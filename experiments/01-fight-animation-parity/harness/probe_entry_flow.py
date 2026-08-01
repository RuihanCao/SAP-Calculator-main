#!/usr/bin/env python3
"""Walk the calculator's own battle animation entry flow and shoot every step.

This is the app-integration probe: nothing is reparented and nothing is
dispatched past the UI, the way in is the button a person presses. The steps
are the five screens Ruihan asked to see: the calculator, the fullscreen
entrance, the battle, the end screen with its two buttons, and the calculator
again after EXIT.

Usage:
  probe_entry_flow.py [fixture] [--out DIR] [--url http://127.0.0.1:4200]
"""
import argparse
import asyncio
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
RANDOM_BACKGROUND = "[data-battle-animation='random-background']"
EXIT_BUTTON = f"{STAGE} [data-anim-outro='exit']"
REWIND_BUTTON = f"{STAGE} [data-anim-outro='rewind']"


async def probe(fid, base_url, outdir, random_background=False):
    from urllib.parse import quote
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)
    os.makedirs(outdir, exist_ok=True)
    payload = quote(json.dumps(calculator_state(fixture), separators=(",", ":")))
    steps = []

    async def shoot(page, name):
        path = os.path.join(outdir, f"{name}.jpg")
        await page.screenshot(path=path, type="jpeg", quality=82)
        steps.append(name)
        print(f"  {name}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        await page.goto(f"{base_url}/?c={payload}", wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await shoot(page, "01-calculator")

        await page.click("text=Simulate")
        await page.wait_for_selector(OPEN_BUTTON, timeout=60000)
        await page.wait_for_timeout(600)
        await shoot(page, "02-simulated")

        # The biome is the replay's own one unless the field is asked to be
        # drawn from the pack instead.
        if random_background:
            await page.check(RANDOM_BACKGROUND)

        # One press: no scrubbing, no skip-intro, no play.
        await page.click(OPEN_BUTTON)
        await page.wait_for_selector(f".battle-animation-fullscreen {STAGE} .anim-field",
                                     timeout=30000)
        await page.wait_for_timeout(1500)
        await shoot(page, "03-fullscreen-intro")

        # The entrance is 9.03 s, so this is the battle itself, already running.
        await page.wait_for_timeout(11000)
        await shoot(page, "04-battle")

        # Wait for the end screen: the outro's own buttons are the signal.
        await page.wait_for_selector(EXIT_BUTTON, timeout=120000)
        await page.wait_for_timeout(3200)
        await shoot(page, "05-end-screen")

        rewind_visible = await page.locator(REWIND_BUTTON).count()
        await page.click(EXIT_BUTTON)
        await page.wait_for_timeout(700)
        await shoot(page, "06-back-in-calculator")
        still_open = await page.locator(".battle-animation-fullscreen").count()

        with open(os.path.join(outdir, "probe.json"), "w") as handle:
            json.dump(
                {
                    "fixture": fid,
                    "steps": steps,
                    "rewind_on_end_screen": rewind_visible,
                    "fullscreen_after_exit": still_open,
                    "random_background": random_background,
                },
                handle,
                indent=1,
            )
        await browser.close()
    print(f"{fid}: entry flow -> {outdir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?", default="f01-plain-trades")
    parser.add_argument("--url", default=APP_URL)
    parser.add_argument("--out", default=os.path.join(OUT_ROOT, "entry-flow"))
    parser.add_argument(
        "--random-background",
        action="store_true",
        help="tick the calculator's random field box before opening",
    )
    args = parser.parse_args()
    asyncio.run(probe(args.fixture, args.url, args.out, args.random_background))


if __name__ == "__main__":
    sys.exit(main())
