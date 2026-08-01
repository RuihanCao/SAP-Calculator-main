#!/usr/bin/env python3
"""High resolution reference stills of the real client, for asset extraction.

The `clips/` recordings are 960x600 JPEG, which is the right size for judging
sequence and timing and far too small to cut art out of: the level plaque is
39x26 px there. This script re-enters the arena battle the same way
run_fixture.py does, then takes PNG stills through CDP with an explicit clip
scale, so the client's own UI art comes back at ANIM01_SCALE times its CSS size
(3x by default, a 3840x2400 frame) and can be cropped into a real asset.

The driver has to be running with the matching ANIM01_SCALE:

  ANIM01_SCALE=3 driver.py

Usage
  capture_refs.py f11-jump-african-wild-dog --seconds 45
  capture_refs.py f12-trumpets-groundhog --seconds 45 --out /path/to/dir
  capture_refs.py --hold           # freeze on the current frame and shoot once
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
PY = os.environ.get("ANIM01_PY", "/root/workspace/.venv-sap/bin/python")
OUT_ROOT = os.path.join(BASE, "w3b", "ref")
SCALE = float(os.environ.get("ANIM01_SCALE", "3"))

# Canvas coordinates at viewport 1280x800, shared with run_fixture.py.
BTN = {
    "hamburger": (1255, 63),
    "return_to_menu": (1156, 208),
    "register_cancel": (558, 565),
    "play": (640, 278),
    "arena": (640, 278),
}
# The replay bar, read off a battle frame: five tiles centred on the top edge.
BAR = {
    "rewind": (484, 76),
    "pause": (562, 76),
    "autoplay": (640, 76),
    "fast": (717, 76),
    "skip": (795, 76),
}


def ctl(op, **kw):
    cmd = [PY, os.path.join(HERE, "ctl.py"), op]
    for key, value in kw.items():
        cmd += [f"--{key}", str(value)]
    cmd += ["--timeout", "900"]
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE).stdout.strip()
    try:
        return json.loads(out)
    except Exception:  # noqa: BLE001
        return {"raw": out}


def shot(path, scale=SCALE):
    return ctl("shot", format="png", scale=scale, path=path)


def click(name, wait=1500):
    x, y = BTN[name]
    return ctl("click", x=x, y=y, wait=wait)


def press(name, wait=400):
    x, y = BAR[name]
    return ctl("click", x=x, y=y, wait=wait)


def register_dialog_open(path):
    from PIL import Image

    with Image.open(path) as image:
        r, g, b = image.convert("RGB").getpixel((500, 248))
    return abs(r - g) < 20 and abs(g - b) < 20 and r > 150


def to_battle():
    """Leave to the main menu and re-enter the arena run, which refetches the battle."""
    click("hamburger", wait=2500)
    click("return_to_menu", wait=7000)
    probe = os.path.join(BASE, "shots", "_menu_probe.jpg")
    ctl("shot", path=probe)
    if register_dialog_open(probe):
        click("register_cancel", wait=4000)
    click("play", wait=5000)
    return click("arena", wait=1200)


def run_stepped(fixture, steps, outdir, enter):
    """One still per beat, with the replay held still between them.

    AUTOPLAY off turns PLAY into a step button (checklist 17), so the client
    parks on a finished beat instead of animating through it. That is the only
    way to get a crisp still of a short-lived widget: the ability toast is on
    screen for about a second and a 3x CDP capture costs most of that, so a
    timed sweep keeps missing it and any frame it does catch is motion-blurred
    by whatever else is moving.
    """
    os.makedirs(outdir, exist_ok=True)
    if fixture:
        payload = os.path.join(BASE, "payloads", f"{fixture}.json")
        if not os.path.exists(payload):
            raise SystemExit(f"no payload {payload}")
        print(" arm:", ctl("arm", path=payload), flush=True)
    if enter:
        print(" enter:", to_battle(), flush=True)
        deadline = time.time() + 90
        while time.time() < deadline:
            time.sleep(2)
            if ctl("status").get("hits"):
                break
        # Take the replay off autoplay while the entrance is still running: the
        # bar is live from about a second in, and waiting for the entrance to
        # finish lets a short battle run to the end screen, where these same
        # coordinates hit "abandon game" instead.
        time.sleep(1.0)
    press("autoplay", wait=900)
    for index in range(steps):
        shot(os.path.join(outdir, f"s_{index:03d}.png"))
        press("pause", wait=1100)
    print(f"{steps} stepped stills -> {outdir}", flush=True)
    return outdir


def run_pause_step(fixture, steps, outdir, enter, beat=0.35):
    """Freeze-frame walk: PAUSE, shoot, PLAY for a beat, PAUSE, shoot.

    Independent of the AUTOPLAY toggle, so it cannot fall through to the end
    screen and start clicking "abandon game". It also gives the one bar state a
    playing capture never shows, the PLAY glyph, because the first still is
    taken while the replay is held.
    """
    os.makedirs(outdir, exist_ok=True)
    if fixture:
        payload = os.path.join(BASE, "payloads", f"{fixture}.json")
        if not os.path.exists(payload):
            raise SystemExit(f"no payload {payload}")
        print(" arm:", ctl("arm", path=payload), flush=True)
    if enter:
        print(" enter:", to_battle(), flush=True)
        deadline = time.time() + 90
        while time.time() < deadline:
            time.sleep(2)
            if ctl("status").get("hits"):
                break
        time.sleep(1.2)
    press("pause", wait=500)
    for index in range(steps):
        shot(os.path.join(outdir, f"p_{index:03d}.png"))
        press("pause", wait=int(beat * 1000))
        press("pause", wait=400)
    print(f"{steps} paused stills -> {outdir}", flush=True)
    return outdir


def run(fixture, seconds, interval, outdir, enter):
    os.makedirs(outdir, exist_ok=True)
    if fixture:
        payload = os.path.join(BASE, "payloads", f"{fixture}.json")
        if not os.path.exists(payload):
            raise SystemExit(f"no payload {payload}")
        print(" arm:", ctl("arm", path=payload), flush=True)
    if enter:
        print(" enter:", to_battle(), flush=True)
        deadline = time.time() + 90
        while time.time() < deadline:
            time.sleep(2)
            if ctl("status").get("hits"):
                break

    t0 = time.time()
    index = 0
    while time.time() - t0 < seconds:
        stamp = int((time.time() - t0) * 1000)
        path = os.path.join(outdir, f"r_{index:03d}_{stamp:07d}.png")
        shot(path)
        index += 1
        rest = t0 + index * interval - time.time()
        if rest > 0:
            time.sleep(rest)
    print(f"{index} stills -> {outdir}", flush=True)
    return outdir


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", nargs="?")
    parser.add_argument("--seconds", type=float, default=45)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--out")
    parser.add_argument(
        "--no-enter",
        action="store_true",
        help="shoot whatever is on screen instead of re-entering the battle",
    )
    parser.add_argument(
        "--hold",
        action="store_true",
        help="press PAUSE, then take one still of the frozen frame",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=0,
        help="turn AUTOPLAY off and take one still per beat, N beats",
    )
    parser.add_argument(
        "--pausestep",
        type=int,
        default=0,
        help="PAUSE/shoot/PLAY-a-beat/PAUSE walk, N stills",
    )
    args = parser.parse_args()

    outdir = args.out or os.path.join(OUT_ROOT, args.fixture or "hold")
    if args.pausestep:
        run_pause_step(args.fixture, args.pausestep, outdir, not args.no_enter)
        return 0
    if args.step:
        run_stepped(args.fixture, args.step, outdir, not args.no_enter)
        return 0
    if args.hold:
        os.makedirs(outdir, exist_ok=True)
        press("pause", wait=600)
        path = os.path.join(outdir, f"hold_{int(time.time())}.png")
        print(shot(path))
        return 0
    run(args.fixture, args.seconds, args.interval, outdir, not args.no_enter)
    return 0


if __name__ == "__main__":
    sys.exit(main())
