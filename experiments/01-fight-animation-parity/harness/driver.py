#!/usr/bin/env python3
"""Long-lived Playwright driver for the real Super Auto Pets WebGL client.

Owns one persistent Chromium profile and one page, keeps the battle-payload
interception armed for the whole session, and executes commands that are
dropped as JSON files into ``<work>/cmd/``. Replies land in ``<work>/resp/``.

The daemon shape is deliberate: the Unity build needs 2-3 minutes to boot under
SwiftShader, and the menu flow has to be discovered by screenshot-inspect-click
iteration. A one-shot script would pay the boot cost on every probe.

Ops
  shot                      CDP Page.captureScreenshot (page.screenshot times out on the animating canvas)
  click / drag / type / key / wait / eval / frames
  arm                       point the interceptor at a payload file
  status                    interception hits and observed /api/battle/get requests
  record_start/record_stop  CDP Page.startScreencast into a frame directory
  burst                     polled still capture (fallback recorder)

Run:  PLAYWRIGHT_BROWSERS_PATH=/root/autodl-tmp/ms-playwright \
      /root/workspace/.venv-sap/bin/python driver.py
"""
import asyncio
import base64
import glob
import json
import os
import time

from playwright.async_api import async_playwright

BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
WORK = os.path.join(BASE, "work")
CMD = os.path.join(WORK, "cmd")
RESP = os.path.join(WORK, "resp")
SHOTS = os.path.join(BASE, "shots")
CLIPS = os.path.join(BASE, "clips")
PROFILE = os.path.join(BASE, "profile")
NETLOG = os.path.join(WORK, "netlog.txt")

# The game iframe served by itch. The outer itch.io page only exists to host
# this iframe; the box cannot reach teamwood.itch.io, so we load the build
# directly. Resolve the build id from the outer page when it changes.
GAME_URL = os.environ.get(
    "ANIM01_GAME_URL",
    "https://html-classic.itch.zone/html/18047452/Production%20WebGL/index.html",
)

for d in (WORK, CMD, RESP, SHOTS, CLIPS, PROFILE):
    os.makedirs(d, exist_ok=True)

# The capture resolution. The layout the fixtures were measured on is the
# 1280x800 viewport, so the viewport stays there by default and the pixel
# density is what gets raised: at ANIM01_SCALE=3 a `shot` comes back 3840x2400
# and the game's own UI art (the level plaque is 39x26 CSS px) is big enough to
# crop as a real asset instead of being traced by hand.
VIEWPORT = {
    "width": int(os.environ.get("ANIM01_VW", "1280")),
    "height": int(os.environ.get("ANIM01_VH", "800")),
}
SCALE = float(os.environ.get("ANIM01_SCALE", "1"))

state = {
    "page": None,
    "cdp": None,
    "ctx": None,
    "payload_path": os.path.join(WORK, "active_payload.json"),
    "hits": [],
    "battle_reqs": [],
    "rec": None,
    "quit": False,
}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def load_payload():
    try:
        with open(state["payload_path"]) as f:
            return json.load(f)
    except Exception:
        return None


async def handle_battle_get(route, request):
    """Fulfil GET /0.N/api/battle/get/{uuid} from the armed fixture payload.

    The requested uuid is copied onto the payload's ``Id`` exactly like the
    extension's page_hook does, because the client matches the response id
    against the id it asked for.
    """
    url = request.url
    state["battle_reqs"].append({"url": url, "method": request.method, "t": time.time()})
    with open(NETLOG, "a") as f:
        f.write(f"{time.time():.1f} {request.method} {url}\n")

    origin = request.headers.get("origin", "*")
    cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-expose-headers": "*",
    }
    if request.method == "OPTIONS":
        await route.fulfill(status=204, headers=cors)
        return

    payload = load_payload()
    if payload is None:
        await route.continue_()
        return

    battle = payload.get("battle", payload)
    battle = json.loads(json.dumps(battle))
    battle["Id"] = url.split("?")[0].rstrip("/").split("/")[-1]
    state["hits"].append({"id": battle["Id"], "t": time.time()})
    log("INJECTED battle", battle["Id"])
    await route.fulfill(
        status=200,
        headers={**cors, "content-type": "application/json; charset=utf-8"},
        body=json.dumps(battle),
    )


async def block_itch_wrapper(route, request):
    # static.itch.io is unreachable from the box and stalls page load for ~100s.
    await route.abort()


def on_screencast_frame(params):
    rec = state["rec"]
    if not rec:
        return
    i = rec["n"]
    rec["n"] += 1
    ts = time.time() - rec["t0"]
    path = os.path.join(rec["dir"], f"f_{i:05d}_{int(ts * 1000):07d}.jpg")
    with open(path, "wb") as f:
        f.write(base64.b64decode(params["data"]))
    rec["last"] = ts


async def do_cmd(c):
    page, cdp = state["page"], state["cdp"]
    op = c["op"]

    if op == "shot":
        args = {"format": c.get("format", "jpeg"), "quality": c.get("quality", 75)}
        # CDP hands back CSS pixels whatever the page's device pixel ratio is,
        # so a `clip` carrying an explicit scale is the only way to get the
        # extra detail the client is already rendering at ANIM01_SCALE. Without
        # this the level plaque comes back 39x26 and is not croppable art.
        scale = c.get("scale")
        if scale:
            size = await page.evaluate(
                "() => ({w: window.innerWidth, h: window.innerHeight})"
            )
            args["clip"] = {
                "x": 0,
                "y": 0,
                "width": size["w"],
                "height": size["h"],
                "scale": float(scale),
            }
            args["captureBeyondViewport"] = False
        r = await cdp.send("Page.captureScreenshot", args)
        ext = "png" if c.get("format") == "png" else "jpg"
        path = c.get("path") or os.path.join(SHOTS, f"s_{int(time.time())}.{ext}")
        with open(path, "wb") as f:
            f.write(base64.b64decode(r["data"]))
        return {"path": path}

    if op == "click":
        x, y = c["x"], c["y"]
        await page.mouse.move(x, y)
        await page.wait_for_timeout(c.get("hover", 150))
        await page.mouse.down()
        await page.wait_for_timeout(80)
        await page.mouse.up()
        await page.wait_for_timeout(c.get("wait", 1500))
        return {"clicked": [x, y]}

    if op == "drag":
        await page.mouse.move(c["x1"], c["y1"])
        await page.mouse.down()
        steps = c.get("steps", 24)
        for i in range(1, steps + 1):
            await page.mouse.move(c["x1"] + (c["x2"] - c["x1"]) * i / steps,
                                  c["y1"] + (c["y2"] - c["y1"]) * i / steps)
            await page.wait_for_timeout(20)
        await page.mouse.up()
        await page.wait_for_timeout(c.get("wait", 1500))
        return {"dragged": True}

    if op == "type":
        await page.keyboard.type(c["text"], delay=90)
        await page.wait_for_timeout(500)
        return {"typed": c["text"]}

    if op == "key":
        await page.keyboard.press(c["key"])
        await page.wait_for_timeout(c.get("wait", 900))
        return {"key": c["key"]}

    if op == "wait":
        await page.wait_for_timeout(c.get("ms", 1000))
        return {"waited": c.get("ms", 1000)}

    if op == "eval":
        return {"result": await page.evaluate(c["js"])}

    if op == "frames":
        return {"frames": [f.url for f in page.frames]}

    if op == "arm":
        state["payload_path"] = c["path"]
        state["hits"] = []
        return {"armed": c["path"], "exists": os.path.exists(c["path"])}

    if op == "status":
        return {"battle_reqs": state["battle_reqs"][-20:], "hits": state["hits"][-20:],
                "payload": state["payload_path"], "url": page.url,
                "recording": bool(state["rec"])}

    if op == "record_start":
        outdir = c["outdir"]
        os.makedirs(outdir, exist_ok=True)
        for old in glob.glob(os.path.join(outdir, "*.jpg")):
            os.remove(old)
        state["rec"] = {"dir": outdir, "n": 0, "t0": time.time(), "last": 0.0}
        await cdp.send("Page.startScreencast", {
            "format": "jpeg",
            "quality": c.get("quality", 70),
            "maxWidth": c.get("maxWidth", 1280),
            "maxHeight": c.get("maxHeight", 800),
            "everyNthFrame": c.get("everyNthFrame", 1),
        })
        return {"recording": outdir}

    if op == "record_stop":
        await cdp.send("Page.stopScreencast")
        rec = state["rec"] or {}
        state["rec"] = None
        return {"frames": rec.get("n", 0), "dur": rec.get("last", 0), "dir": rec.get("dir")}

    if op == "burst":
        outdir = c["outdir"]
        os.makedirs(outdir, exist_ok=True)
        n, interval = c.get("n", 120), c.get("interval", 0.25)
        t0 = time.time()
        for i in range(n):
            r = await cdp.send("Page.captureScreenshot",
                               {"format": "jpeg", "quality": c.get("quality", 70)})
            ts = time.time() - t0
            with open(os.path.join(outdir, f"f_{i:05d}_{int(ts * 1000):07d}.jpg"), "wb") as f:
                f.write(base64.b64decode(r["data"]))
            dt = t0 + (i + 1) * interval - time.time()
            if dt > 0:
                await asyncio.sleep(dt)
        return {"frames": n, "dur": time.time() - t0, "dir": outdir}

    if op == "goto":
        await page.goto(c["url"], wait_until="domcontentloaded", timeout=180000)
        return {"url": page.url}

    if op == "reload":
        await page.reload(wait_until="domcontentloaded", timeout=180000)
        return {"url": page.url}

    if op == "quit":
        state["quit"] = True
        return {"bye": True}

    return {"error": "unknown op " + op}


async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            PROFILE,
            headless=True,
            viewport=VIEWPORT,
            device_scale_factor=SCALE,
            args=[
                "--enable-unsafe-swiftshader",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                # This container cannot start Chromium's out-of-process network
                # service: every navigation fails ERR_INSUFFICIENT_RESOURCES
                # while data: URLs still load. See harness/README.md.
                "--enable-features=NetworkServiceInProcess2",
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--autoplay-policy=no-user-gesture-required",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
            ],
        )
        await ctx.route("**/api/battle/get/*", handle_battle_get)
        await ctx.route("https://static.itch.io/**", block_itch_wrapper)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        state["ctx"], state["page"] = ctx, page

        def on_req(r):
            if "teamwood.games" in r.url:
                with open(NETLOG, "a") as f:
                    f.write(f"{time.time():.1f} REQ {r.method} {r.url}\n")

        page.on("request", on_req)
        await page.goto(GAME_URL, wait_until="domcontentloaded", timeout=180000)
        cdp = await ctx.new_cdp_session(page)
        state["cdp"] = cdp
        cdp.on("Page.screencastFrame", lambda params: asyncio.ensure_future(_frame(cdp, params)))
        await cdp.send("Page.enable")
        log("READY", page.url)
        with open(os.path.join(WORK, "daemon_ready"), "w") as f:
            f.write(str(time.time()))

        while not state["quit"]:
            files = sorted(glob.glob(os.path.join(CMD, "*.json")))
            if not files:
                await asyncio.sleep(0.15)
                continue
            f0 = files[0]
            try:
                with open(f0) as fh:
                    c = json.load(fh)
            except Exception:
                await asyncio.sleep(0.15)
                continue
            os.remove(f0)
            name = os.path.basename(f0)
            log("CMD", name, c.get("op"))
            try:
                res = await do_cmd(c)
            except Exception as e:
                res = {"error": repr(e)}
            with open(os.path.join(RESP, name), "w") as fh:
                json.dump(res, fh)
            log("RES", name, json.dumps(res)[:240])
        await ctx.close()


async def _frame(cdp, params):
    on_screencast_frame(params)
    try:
        await cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
    except Exception:
        pass


asyncio.run(main())
