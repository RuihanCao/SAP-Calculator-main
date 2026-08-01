#!/usr/bin/env python3
"""Shoot the three things W-A changed, through the real user flow.

Nothing here reaches past the UI: the fixture is loaded through the app's own
share-state URL, Simulate is pressed, and the animation is opened with the
button a person presses.

  a) the calculator's own screen, so the inline animation can be compared with
     the original one it is supposed to be again,
  b) the frame the fullscreen animation lands on, caught as early as the
     browser will give it up and then again over a short ladder, with the
     control bar's own opacity read out of the DOM at each rung,
  c) the frame REWIND lands on, shot the same way.

The bar's opacity is the assertion that matters: the entrance used to fade it
in over the last 1.5 s of a 9 s intro, so a landing frame with the bar already
at opacity 1 is the intro being gone rather than merely being short.

Usage:
  probe_ui_restore.py [fixture] [--out DIR] [--url http://127.0.0.1:4201]
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
APP_URL = os.environ.get("ANIM01_APP_URL", "http://127.0.0.1:4201")

STAGE = "app-battle-animation-stage"
OPEN_BUTTON = "[data-battle-animation='open']"
FIELD = f".battle-animation-fullscreen {STAGE} .anim-field"
CONTROLS = f".battle-animation-fullscreen {STAGE} .anim-controls"
BAR_REWIND = f"{STAGE} [data-anim-control='rewind']"

# When each rung of a ladder is shot, in ms after the press.
LADDER_MS = [0, 120, 400, 1000]

# Nothing of the entrance may be on screen at any rung.
INTRO_MARKERS = [".anim-shutter", ".anim-intro-row", ".anim-intro-card"]


async def run(fid, base_url, outdir):
    from urllib.parse import quote
    from playwright.async_api import async_playwright

    with open(os.path.join(FIXTURES, f"{fid}.json")) as handle:
        fixture = json.load(handle)
    os.makedirs(outdir, exist_ok=True)
    payload = quote(json.dumps(calculator_state(fixture), separators=(",", ":")))
    report = {"fixture": fid, "url": base_url, "console_errors": [], "ladders": {}}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=["--no-sandbox", "--force-device-scale-factor=1"]
        )
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        page.on(
            "console",
            lambda msg: report["console_errors"].append(f"{msg.type}: {msg.text}")
            if msg.type == "error"
            else None,
        )
        page.on("pageerror", lambda err: report["console_errors"].append(f"pageerror: {err}"))
        cdp = await context.new_cdp_session(page)

        async def shoot(name):
            data = await cdp.send(
                "Page.captureScreenshot", {"format": "jpeg", "quality": 84}
            )
            raw = base64.b64decode(data["data"])
            with open(os.path.join(outdir, f"{name}.jpg"), "wb") as handle:
                handle.write(raw)
            return hashlib.sha1(raw).hexdigest()[:12]

        async def bar_opacity():
            return await page.evaluate(
                """(sel) => {
                     const el = document.querySelector(sel);
                     if (!el) return null;
                     return Number(getComputedStyle(el).opacity);
                   }""",
                CONTROLS,
            )

        async def intro_on_screen():
            return await page.evaluate(
                """(sels) => sels.filter((s) => document.querySelector(s) !== null)""",
                INTRO_MARKERS,
            )

        async def ladder(label):
            rungs = []
            previous = 0
            for at, when in enumerate(LADDER_MS):
                if when > previous:
                    await page.wait_for_timeout(when - previous)
                    previous = when
                rungs.append(
                    {
                        "ms": when,
                        "sha1": await shoot(f"{label}-{at:02d}-{when}ms"),
                        "control_bar_opacity": await bar_opacity(),
                        "intro_elements_on_screen": await intro_on_screen(),
                    }
                )
            report["ladders"][label] = rungs
            return rungs

        # -- the calculator itself ------------------------------------------
        await page.goto(f"{base_url}/?c={payload}", wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await page.click("text=Simulate")
        await page.wait_for_selector(OPEN_BUTTON, timeout=60000)
        await page.wait_for_timeout(900)
        await shoot("a1-calculator-top")
        # The animation pane is below the fold at this viewport, and it is the
        # half of the screen this wave was about, so it gets its own frame.
        await page.locator(".logs-pane").scroll_into_view_if_needed()
        await page.wait_for_timeout(500)
        await shoot("a2-calculator-animation-pane")
        report["inline_new_renderer_count"] = await page.locator(
            f".animation-top-pane {STAGE}"
        ).count()
        report["legacy_stage_count"] = await page.locator(".fight-stage").count()
        report["legacy_toggle_count"] = await page.locator(
            ".fight-legacy-switch, .anim-legacy"
        ).count()

        # -- the landing frame ----------------------------------------------
        await page.click(OPEN_BUTTON)
        await page.wait_for_selector(FIELD, timeout=30000)
        await ladder("b-landing")

        # -- REWIND ----------------------------------------------------------
        # Pressed well into the battle, so the restart is visibly a restart.
        await page.wait_for_timeout(6000)
        report["before_rewind_sha1"] = await shoot("c0-before-rewind")
        await page.click(BAR_REWIND)
        await ladder("c-rewind")

        await browser.close()

    landing = report["ladders"]["b-landing"][0]
    restart = report["ladders"]["c-rewind"][0]
    report["verdict"] = {
        "landing_bar_visible": landing["control_bar_opacity"] == 1,
        "restart_bar_visible": restart["control_bar_opacity"] == 1,
        "no_intro_anywhere": all(
            not rung["intro_elements_on_screen"]
            for rungs in report["ladders"].values()
            for rung in rungs
        ),
        "restart_moved_the_picture": restart["sha1"] != report["before_rewind_sha1"],
        "landing_and_restart_agree": {
            "landing_sha1": landing["sha1"],
            "restart_sha1": restart["sha1"],
        },
    }
    with open(os.path.join(outdir, "ui-restore.json"), "w") as handle:
        json.dump(report, handle, indent=1)
    print(json.dumps(report["verdict"], indent=1))
    print(f"console errors: {len(report['console_errors'])}")
    for line in report["console_errors"]:
        print(f"  {line}")
    print(f"{fid}: -> {outdir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?", default="f01-plain-trades")
    parser.add_argument("--url", default=APP_URL)
    parser.add_argument("--out", default=os.path.join(OUT_ROOT, "w3a-ui-restore"))
    args = parser.parse_args()
    asyncio.run(run(args.fixture, args.url, args.out))


if __name__ == "__main__":
    sys.exit(main())
