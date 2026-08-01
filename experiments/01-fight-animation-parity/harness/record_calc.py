#!/usr/bin/env python3
"""Record the calculator's own fight animation for a fixture.

The mirror image of run_fixture.py: that one drives the real game, this one
drives our app, so W3 can put the two filmstrips side by side.

The fixture's boards are loaded through the app's own share-state parameter
(`?c=<json>`), which is the same path the Import/Share link uses, so nothing
about the app is special cased for the recording. The animation is then played
with the stage's PLAY button and screencast through CDP, frame names matching
the W0 harness (`f_<index>_<ms>.jpg`) so make_clip.py can build the clip and the
filmstrip without changes.

Usage:
  record_calc.py --all
  record_calc.py f01-plain-trades [--fast] [--seconds 30] [--url http://127.0.0.1:4200]
  record_calc.py f01-plain-trades --swap        # the same battle lost, for the defeat screen
"""
import argparse
import asyncio
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")
OUT_ROOT = os.environ.get("ANIM01_CALC_OUT", "/root/autodl-tmp/sap-data/anim01/calc")
APP_URL = os.environ.get("ANIM01_APP_URL", "http://127.0.0.1:4200")

EMPTY_PET = {"name": None, "attack": 0, "health": 0, "exp": 0, "equipment": None}

# Chromium on this box.
#
# The container cannot start Chromium's out-of-process network service: every
# http navigation dies with ERR_INSUFFICIENT_RESOURCES while data: URLs still
# load, so the network service is forced in-process. The other trap, which looks
# identical from the outside, is the system disk filling up: with under a few
# hundred MB free on `/` the renderer crashes on navigation and CDP
# captureScreenshot answers "Unable to capture screenshot". Check `df -h /`
# before believing anything else.
LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--enable-features=NetworkServiceInProcess2",
]


def exp_for_level(level):
    if level == 3:
        return 5
    if level == 2:
        return 2
    return 0


def to_pet(spec):
    if not spec:
        return dict(EMPTY_PET)
    return {
        "name": spec["pet"],
        "attack": spec["attack"],
        "health": spec["health"],
        "exp": exp_for_level(spec.get("level", 1)),
        "equipment": spec.get("perk"),
    }


def pad(pets):
    out = [to_pet(p) for p in (pets or [])]
    while len(out) < 5:
        out.append(dict(EMPTY_PET))
    return out[:5]


def calculator_state(fixture):
    return {
        "playerPack": fixture.get("playerPack", "Turtle"),
        "opponentPack": fixture.get("opponentPack", "Turtle"),
        "turn": fixture.get("turn", 11),
        "playerToy": fixture.get("playerToy"),
        "playerToyLevel": str(fixture.get("playerToyLevel", 1)),
        "opponentToy": fixture.get("opponentToy"),
        "opponentToyLevel": str(fixture.get("opponentToyLevel", 1)),
        "playerPets": pad(fixture.get("player")),
        "opponentPets": pad(fixture.get("opponent")),
        "allPets": True,
        "tokenPets": True,
        "showAdvanced": False,
    }


def fixture_url(fixture, base_url):
    from urllib.parse import quote

    payload = quote(json.dumps(calculator_state(fixture), separators=(",", ":")))
    return f"{base_url}/?c={payload}"


def swap_boards(fixture):
    """The same battle from the losing side, which is how the defeat screen is reached.

    Nothing about the fixture set changes: the file on disk is untouched and the
    swap happens on the way into the share-state parameter.
    """
    swapped = dict(fixture)
    swapped["player"], swapped["opponent"] = fixture.get("opponent"), fixture.get("player")
    swapped["playerPack"], swapped["opponentPack"] = (
        fixture.get("opponentPack", "Turtle"),
        fixture.get("playerPack", "Turtle"),
    )
    swapped["playerToy"], swapped["opponentToy"] = (
        fixture.get("opponentToy"),
        fixture.get("playerToy"),
    )
    swapped["playerToyLevel"], swapped["opponentToyLevel"] = (
        fixture.get("opponentToyLevel", 1),
        fixture.get("playerToyLevel", 1),
    )
    return swapped


async def record_one(fid, base_url, seconds, fast, quality, swap=False):
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)
    if swap:
        fixture = swap_boards(fixture)

    suffix = "-fast" if fast else ("-defeat" if swap else "")
    outdir = os.path.join(OUT_ROOT, f"{fid}{suffix}")
    os.makedirs(outdir, exist_ok=True)
    for name in os.listdir(outdir):
        if name.endswith(".jpg"):
            os.remove(os.path.join(outdir, name))

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=LAUNCH_ARGS)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        await page.goto(fixture_url(fixture, base_url), wait_until="load", timeout=120000)

        # Run the battle, which is what fills the animation with events.
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await page.click("text=Simulate")
        await page.wait_for_selector("app-battle-animation-stage .anim-stage", timeout=60000)

        # The stage lives in a small split pane in the app. For the recording it
        # is moved into a full viewport holder, so the clip frames the animation
        # the same way the reference clips frame the real game. Nothing about
        # the component changes: it is the same live element, just reparented.
        await page.evaluate(
            """() => {
              const stage = document.querySelector('app-battle-animation-stage');
              const holder = document.createElement('div');
              holder.id = 'anim01-holder';
              holder.style.cssText =
                'position:fixed;inset:0;z-index:99999;background:#0d1117;display:flex';
              document.body.appendChild(holder);
              holder.appendChild(stage);
              stage.style.cssText = 'flex:1 1 auto;height:100vh';
              document.documentElement.style.overflow = 'hidden';
            }"""
        )
        await page.wait_for_timeout(400)

        # The bar's buttons carry stable data attributes, because the labels
        # are not unique any more: AUTOPLAY contains PLAY. The presses are
        # dispatched rather than clicked because the bar is deliberately inert
        # until it has faded in, which is a second into the entrance
        # (checklist 17), and the recording starts before that.
        if fast:
            await page.dispatch_event(
                "app-battle-animation-stage [data-anim-control='fast']", "click"
            )
            await page.wait_for_timeout(150)

        shot = await page.locator("app-battle-animation-stage .anim-field").screenshot()
        with open(os.path.join(outdir, "_board.png"), "wb") as handle:
            handle.write(shot)

        cdp = await context.new_cdp_session(page)
        state = {"n": 0, "t0": time.time()}

        async def on_frame(params):
            index = state["n"]
            state["n"] += 1
            ts = time.time() - state["t0"]
            path = os.path.join(outdir, f"f_{index:05d}_{int(ts * 1000):07d}.jpg")
            with open(path, "wb") as handle:
                handle.write(base64.b64decode(params["data"]))
            try:
                await cdp.send(
                    "Page.screencastFrameAck", {"sessionId": params["sessionId"]}
                )
            except Exception:
                pass

        cdp.on(
            "Page.screencastFrame",
            lambda params: asyncio.ensure_future(on_frame(params)),
        )
        await cdp.send(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": quality,
                "maxWidth": 1280,
                "maxHeight": 800,
                "everyNthFrame": 1,
            },
        )

        await page.dispatch_event(
            "app-battle-animation-stage [data-anim-control='play']", "click"
        )
        # When the battle is over, read off the stage root.
        #
        # This used to read the tools row's clock text, which is only drawn on
        # the calculator's inline pane and is not inside the element the holder
        # above reparents; every re-recording either hung for the whole
        # `--seconds` budget or died on a strict-mode locator error, and that
        # was mistaken for the animation itself being broken. `data-anim-*`
        # lives on the stage root, exists in both presentations and survives the
        # move. A stage that never publishes them (an older build, a stalled
        # frame loop) falls back to the deadline instead of throwing.
        deadline = time.time() + seconds
        missing = 0
        while time.time() < deadline:
            await page.wait_for_timeout(250)
            state = await page.evaluate(
                """() => {
                  const stage = document.querySelector('app-battle-animation-stage .anim-stage');
                  if (!stage) { return null; }
                  return {
                    done: stage.dataset.animDone === '1',
                    time: Number(stage.dataset.animTime || 0),
                    duration: Number(stage.dataset.animDuration || 0),
                  };
                }"""
            )
            if state is None or state["duration"] <= 0:
                missing += 1
                if missing > 8:
                    print(f"  {fid}: no data-anim-* on the stage, recording to the deadline")
                    break
                continue
            missing = 0
            if state["done"]:
                await page.wait_for_timeout(700)
                break

        await cdp.send("Page.stopScreencast")
        with open(os.path.join(outdir, "meta.json"), "w") as handle:
            json.dump(
                {
                    "fixture": fid,
                    "fast": fast,
                    "swapped": swap,
                    "battle_start_ms": 0,
                    "frames": state["n"],
                    "seconds": round(time.time() - state["t0"], 2),
                },
                handle,
                indent=1,
            )
        await browser.close()
    print(f"{fid}{suffix}: {state['n']} frames -> {outdir}")
    return outdir


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--fast", action="store_true")
    parser.add_argument(
        "--swap",
        action="store_true",
        help="swap the boards, so the recording ends on the defeat screen",
    )
    parser.add_argument("--seconds", type=float, default=45)
    parser.add_argument("--quality", type=int, default=70)
    parser.add_argument("--url", default=APP_URL)
    args = parser.parse_args()

    ids = (
        sorted(n[:-5] for n in os.listdir(FIXTURES) if n.endswith(".json"))
        if args.all
        else [args.fixture]
    )
    if not ids or ids == [None]:
        parser.error("give a fixture id or --all")

    for fid in ids:
        asyncio.run(
            record_one(fid, args.url, args.seconds, args.fast, args.quality, args.swap)
        )


if __name__ == "__main__":
    sys.exit(main())
