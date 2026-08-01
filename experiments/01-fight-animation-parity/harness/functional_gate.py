#!/usr/bin/env python3
"""The functional gate for the battle animation.

Every visual round has to re-run this. It drives the calculator the way a person
does (share-state URL, the app's own Simulate button, the stage's own control
bar) and asserts two things the eye misses:

  * zero console errors, page errors and 4xx/5xx responses;
  * zero broken images, scanned as `naturalWidth === 0` on every `img` on the
    page, sampled all the way through the battle rather than once at the end.

The scenario set has to keep covering one instance of every kind of decoration.
The Tasty broken icon reached Ruihan because the parity fixtures carry no
ailment at all, so `gate/g01-ailments.json` exists specifically to hold that
class, `g02` holds food perks and `g03` holds summons, mana, trumpets and toys.
The parity fixtures under `fixtures/` can be added with `--fixtures`.

Usage
  functional_gate.py                       # every gate/*.json
  functional_gate.py --fixtures            # gate boards plus the 16 parity fixtures
  functional_gate.py g01-ailments --shots /tmp/gate
"""
import argparse
import asyncio
import json
import os
import sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, "gate")
FIXTURES = os.path.join(HERE, "fixtures")
APP_URL = os.environ.get("ANIM01_APP_URL", "http://127.0.0.1:4202")
SHOT_DIR = os.environ.get("ANIM01_GATE_SHOTS", "/root/autodl-tmp/sap-data/anim01/w3b/gate")

# Kept in step with record_calc.py; see the note there about this container's
# network service and about the system disk filling up.
LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--enable-features=NetworkServiceInProcess2",
]

EMPTY_PET = {"name": None, "attack": 0, "health": 0, "exp": 0, "equipment": None}


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


def calculator_state(board):
    return {
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


def board_url(board, base_url):
    payload = quote(json.dumps(calculator_state(board), separators=(",", ":")))
    return f"{base_url}/?c={payload}"


BROKEN_IMAGES_JS = """() => Array.from(document.images)
     .filter(i => i.complete && i.naturalWidth === 0)
     .map(i => ({src: i.currentSrc || i.src, cls: i.className, alt: i.alt}))"""

STAGE_STATE_JS = """() => {
  const stage = document.querySelector('app-battle-animation-stage .anim-stage');
  if (!stage) { return null; }
  return {
    done: stage.dataset.animDone === '1',
    time: Number(stage.dataset.animTime || 0),
    duration: Number(stage.dataset.animDuration || 0),
  };
}"""


async def run_board(pw, board, base_url, shot_dir, seconds):
    label = board["id"]
    problems = {"console": [], "http": [], "broken": {}}
    browser = await pw.chromium.launch(args=LAUNCH_ARGS)
    context = await browser.new_context(viewport={"width": 1280, "height": 800})
    page = await context.new_page()

    def on_console(message):
        if message.type == "error":
            problems["console"].append(f"console error: {message.text}")

    def on_response(response):
        if response.status >= 400:
            problems["http"].append(f"HTTP {response.status} {response.url}")

    page.on("console", on_console)
    page.on("pageerror", lambda exc: problems["console"].append(f"pageerror: {exc}"))
    page.on("response", on_response)
    page.on(
        "requestfailed",
        lambda request: problems["http"].append(f"requestfailed {request.url}"),
    )

    async def scan():
        for item in await page.evaluate(BROKEN_IMAGES_JS):
            problems["broken"][item["src"]] = item

    try:
        await page.goto(board_url(board, base_url), wait_until="load", timeout=120000)
        await page.wait_for_selector("text=Simulate", timeout=60000)
        await scan()
        await page.click("text=Simulate")
        await page.wait_for_selector("app-battle-animation-stage .anim-stage", timeout=60000)
        await page.wait_for_timeout(500)
        await scan()

        await page.dispatch_event(
            "app-battle-animation-stage [data-anim-control='play']", "click"
        )
        deadline = asyncio.get_event_loop().time() + seconds
        pressed_fast = False
        while asyncio.get_event_loop().time() < deadline:
            await page.wait_for_timeout(300)
            await scan()
            state = await page.evaluate(STAGE_STATE_JS)
            if state and state["duration"] > 0:
                # Halfway through, exercise the bar the way a person would.
                if not pressed_fast and state["time"] > state["duration"] * 0.4:
                    pressed_fast = True
                    await page.dispatch_event(
                        "app-battle-animation-stage [data-anim-control='fast']", "click"
                    )
                    await page.dispatch_event(
                        "app-battle-animation-stage [data-anim-control='autoplay']", "click"
                    )
                    await page.dispatch_event(
                        "app-battle-animation-stage [data-anim-control='autoplay']", "click"
                    )
                    await scan()
                if state["done"]:
                    break
        await page.wait_for_timeout(600)
        await scan()
        if shot_dir:
            os.makedirs(shot_dir, exist_ok=True)
            await page.screenshot(path=os.path.join(shot_dir, f"{label}-end.png"))

        # The end screen, then back to the top of the battle.
        await page.dispatch_event(
            "app-battle-animation-stage [data-anim-control='rewind']", "click"
        )
        await page.wait_for_timeout(1200)
        await scan()
        await page.dispatch_event(
            "app-battle-animation-stage [data-anim-control='skip']", "click"
        )
        await page.wait_for_timeout(1500)
        await scan()
    except Exception as exc:  # noqa: BLE001
        problems["console"].append(f"drive failed: {str(exc).splitlines()[0]}")
    finally:
        await browser.close()
    return label, problems


async def main_async(args):
    from playwright.async_api import async_playwright

    boards = []
    ids = args.boards
    for path in sorted(os.listdir(GATE)):
        if path.endswith(".json") and (not ids or path[:-5] in ids):
            with open(os.path.join(GATE, path)) as handle:
                boards.append(json.load(handle))
    if args.fixtures:
        for path in sorted(os.listdir(FIXTURES)):
            if path.endswith(".json") and (not ids or path[:-5] in ids):
                with open(os.path.join(FIXTURES, path)) as handle:
                    boards.append(json.load(handle))
    if not boards:
        raise SystemExit("no boards selected")

    results = []
    async with async_playwright() as pw:
        for board in boards:
            results.append(await run_board(pw, board, args.url, args.shots, args.seconds))

    failed = 0
    print("=" * 68)
    for label, problems in results:
        broken = list(problems["broken"].values())
        bad = bool(broken or problems["console"] or problems["http"])
        failed += 1 if bad else 0
        print(f"{'FAIL' if bad else 'PASS'}  {label}")
        for item in broken:
            print(f"      broken image  {item['alt']!r} [{item['cls']}] -> {item['src']}")
        for line in dict.fromkeys(problems["console"]):
            print(f"      {line}")
        for line in dict.fromkeys(problems["http"]):
            print(f"      {line}")
    print("=" * 68)
    print(f"{len(results) - failed}/{len(results)} boards clean")
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("boards", nargs="*")
    parser.add_argument("--fixtures", action="store_true", help="also run the parity fixtures")
    parser.add_argument("--seconds", type=float, default=90)
    parser.add_argument("--url", default=APP_URL)
    parser.add_argument("--shots", default=SHOT_DIR)
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
