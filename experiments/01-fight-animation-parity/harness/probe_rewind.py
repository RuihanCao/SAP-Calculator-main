#!/usr/bin/env python3
"""Press REWIND, on the bar and on the end screen, and show what happens.

Round 4 froze: after the press every later frame was bit identical to the one
before it and the end screen never came. The reference restarts the whole
animation from the entrance and keeps playing (clips/ctl-rewind/, frames 00 to
07 of out/ctl-rewind_filmstrip.jpg), so this probe presses the button and then
shoots a ladder of frames, hashing each one, and states plainly whether the
picture moved and whether the outro was reached again.

Usage:
  probe_rewind.py [fixture] [--out DIR] [--url http://127.0.0.1:4200]
"""
import argparse
import asyncio
import base64
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from record_calc import calculator_state  # noqa: E402

FIXTURES = os.path.join(HERE, "fixtures")
OUT_ROOT = os.environ.get("ANIM01_CALC_OUT", "/root/autodl-tmp/sap-data/anim01/calc")
APP_URL = os.environ.get("ANIM01_APP_URL", "http://127.0.0.1:4200")

STAGE = "app-battle-animation-stage"
OPEN_BUTTON = "[data-battle-animation='open']"
BAR_REWIND = f"{STAGE} [data-anim-control='rewind']"
OUTRO_REWIND = f"{STAGE} [data-anim-outro='rewind']"
OUTRO_EXIT = f"{STAGE} [data-anim-outro='exit']"

# When each frame of the ladder is shot, in ms after the press.
LADDER_MS = [150, 400, 900, 1500, 2600, 4200, 7000, 10000]


async def run(fid, base_url, outdir):
    from urllib.parse import quote
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)
    os.makedirs(outdir, exist_ok=True)
    payload = quote(json.dumps(calculator_state(fixture), separators=(",", ":")))
    report = {"fixture": fid, "presses": []}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        cdp = await context.new_cdp_session(page)

        async def shoot(name):
            data = await cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 82})
            raw = base64.b64decode(data["data"])
            with open(os.path.join(outdir, f"{name}.jpg"), "wb") as handle:
                handle.write(raw)
            return hashlib.sha1(raw).hexdigest()[:12]

        await page.goto(f"{base_url}/?c={payload}", wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await page.click("text=Simulate")
        await page.wait_for_selector(OPEN_BUTTON, timeout=60000)
        await page.click(OPEN_BUTTON)
        await page.wait_for_selector(f".battle-animation-fullscreen {STAGE} .anim-field",
                                     timeout=30000)

        async def ladder(label):
            frames = []
            for at, delay in enumerate(
                [LADDER_MS[0]] + [b - a for a, b in zip(LADDER_MS, LADDER_MS[1:])]
            ):
                await page.wait_for_timeout(delay)
                digest = await shoot(f"{label}-{at:02d}-{LADDER_MS[at]}ms")
                frames.append({"ms": LADDER_MS[at], "sha1": digest})
            distinct = len({frame["sha1"] for frame in frames})
            return {
                "frames": frames,
                "distinct_frames": distinct,
                "moved": distinct > 1,
            }

        # 1. The bar's own REWIND, pressed mid battle.
        await page.wait_for_timeout(14000)
        before = await shoot("bar-00-before")
        await page.click(BAR_REWIND)
        result = await ladder("bar")
        result["press"] = "control bar"
        result["before_sha1"] = before
        report["presses"].append(result)

        # 2. The end screen's REWIND, pressed after the battle is over.
        await page.wait_for_selector(OUTRO_EXIT, timeout=180000)
        await page.wait_for_timeout(2500)
        before = await shoot("outro-00-before")
        await page.click(OUTRO_REWIND)
        result = await ladder("outro")
        result["press"] = "end screen"
        result["before_sha1"] = before
        # And the end screen has to be reachable a second time.
        try:
            await page.wait_for_selector(OUTRO_EXIT, timeout=180000)
            await page.wait_for_timeout(2500)
            result["outro_reached_again"] = True
            await shoot("outro-99-end-screen-again")
        except Exception:
            result["outro_reached_again"] = False
        report["presses"].append(result)

        await browser.close()

    with open(os.path.join(outdir, "rewind.json"), "w") as handle:
        json.dump(report, handle, indent=1)
    for press in report["presses"]:
        print(
            f"{press['press']}: distinct frames {press['distinct_frames']}/"
            f"{len(press['frames'])}, moved={press['moved']}, "
            f"outro again={press.get('outro_reached_again', 'n/a')}"
        )
    print(f"{fid}: rewind probe -> {outdir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?", default="f01-plain-trades")
    parser.add_argument("--url", default=APP_URL)
    parser.add_argument("--out", default=os.path.join(OUT_ROOT, "rewind"))
    args = parser.parse_args()
    asyncio.run(run(args.fixture, args.url, args.out))


if __name__ == "__main__":
    sys.exit(main())
