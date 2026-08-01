#!/usr/bin/env python3
"""High resolution stills of our own stage, framed like the reference stills.

The pair to `capture_refs.py`: same 1280x800 viewport, same 3x pixel density,
same full-viewport framing, so a still from here and a still from the real
client can be laid side by side without either being rescaled.

The stage is moved into a full viewport holder exactly as `record_calc.py` does
it, and the clock is read off `data-anim-*` on the stage root rather than out of
the tools row, which does not exist in that holder.

Usage
  shoot_ours.py f11-jump-african-wild-dog --at 0,1,3,4,5,7
  shoot_ours.py --board gate/g01-ailments.json --at 2,6
"""
import argparse
import asyncio
import base64
import json
import os
import sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")
APP_URL = os.environ.get("ANIM01_APP_URL", "http://127.0.0.1:4202")
OUT_ROOT = os.environ.get("ANIM01_OURS", "/root/autodl-tmp/sap-data/anim01/w3b/ours")
SCALE = float(os.environ.get("ANIM01_SCALE", "3"))

LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-features=NetworkServiceInProcess2",
]

EMPTY_PET = {"name": None, "attack": 0, "health": 0, "exp": 0, "equipment": None}

HOLDER_JS = """() => {
  const stage = document.querySelector('app-battle-animation-stage');
  // The comparison has to be against the presentation the client actually has,
  // so the stage goes into its fullscreen mode: no scrubber, no RESTART, no
  // legacy switch, and the letterbox split evenly. Shooting the inline pane
  // put a black tool strip along the bottom of every one of our frames, which
  // a critic reads as "this one is the reproduction" before looking at
  // anything else.
  const cmp = window.ng && window.ng.getComponent ? window.ng.getComponent(stage) : null;
  if (cmp) { cmp.fullscreen = true; }
  const holder = document.createElement('div');
  holder.id = 'anim01-holder';
  holder.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:#000;display:flex';
  document.body.appendChild(holder);
  holder.appendChild(stage);
  stage.style.cssText = 'flex:1 1 auto;height:100vh';
  document.documentElement.style.overflow = 'hidden';
}"""


def exp_for_level(level):
    return {3: 5, 2: 2}.get(level, 0)


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


def board_url(board, base_url):
    state = {
        "playerPack": board.get("playerPack", "Turtle"),
        "opponentPack": board.get("opponentPack", "Turtle"),
        "turn": board.get("turn", 11),
        "playerToy": board.get("playerToy"),
        "playerToyLevel": str(board.get("playerToyLevel", 1)),
        "opponentToy": board.get("opponentToy"),
        "opponentToyLevel": str(board.get("opponentToyLevel", 1)),
        "playerPets": pad(board.get("player")),
        "opponentPets": pad(board.get("opponent")),
        "allPets": True,
        "tokenPets": True,
        "showAdvanced": False,
    }
    return f"{base_url}/?c={quote(json.dumps(state, separators=(',', ':')))}"


async def shoot(page, cdp, path):
    size = await page.evaluate("() => ({w: window.innerWidth, h: window.innerHeight})")
    result = await cdp.send(
        "Page.captureScreenshot",
        {
            "format": "png",
            "captureBeyondViewport": False,
            "clip": {"x": 0, "y": 0, "width": size["w"], "height": size["h"], "scale": SCALE},
        },
    )
    with open(path, "wb") as handle:
        handle.write(base64.b64decode(result["data"]))


async def run(board, seconds, outdir, base_url):
    from playwright.async_api import async_playwright

    os.makedirs(outdir, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=LAUNCH_ARGS)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800}, device_scale_factor=1
        )
        page = await context.new_page()
        await page.goto(board_url(board, base_url), wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await page.click("text=Simulate")
        await page.wait_for_selector("app-battle-animation-stage .anim-stage", timeout=60000)
        await page.evaluate(HOLDER_JS)
        await page.wait_for_timeout(500)
        cdp = await context.new_cdp_session(page)

        # Seek rather than play: the stage exposes its clock, so a still can be
        # taken at exactly the second a reference still was taken at.
        for at in seconds:
            await page.evaluate(
                """(ms) => {
                  const el = document.querySelector('app-battle-animation-stage');
                  const cmp = window.ng && window.ng.getComponent
                    ? window.ng.getComponent(el)
                    : null;
                  if (cmp) { cmp.onScrub(ms); }
                  return !!cmp;
                }""",
                int(at * 1000),
            )
            await page.wait_for_timeout(320)
            await shoot(page, cdp, os.path.join(outdir, f"o_{int(at * 1000):07d}.png"))
        await browser.close()
    print(f"{len(seconds)} stills -> {outdir}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?")
    parser.add_argument("--board")
    parser.add_argument("--at", default="0,1,2,3,4,5,6,7,8")
    parser.add_argument("--out")
    parser.add_argument("--url", default=APP_URL)
    args = parser.parse_args()

    path = args.board if args.board else os.path.join(FIXTURES, f"{args.fixture}.json")
    if not os.path.isabs(path):
        path = os.path.join(HERE, path)
    with open(path) as handle:
        board = json.load(handle)
    seconds = [float(v) for v in args.at.split(",") if v.strip()]
    outdir = args.out or os.path.join(OUT_ROOT, board.get("id", "board"))
    asyncio.run(run(board, seconds, outdir, args.url))
    return 0


if __name__ == "__main__":
    sys.exit(main())
