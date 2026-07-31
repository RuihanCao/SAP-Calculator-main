#!/usr/bin/env python3
"""Drive one fixture through the real game and record its battle animation.

How the loop works
  The arena battle screen is re-entered by leaving to the main menu and picking
  Play > Arena again. Every re-entry makes the client re-issue
  GET /0.N/api/battle/get/{uuid} for the run's pending battle, and the driver
  fulfils that request with whatever fixture payload is currently armed. So the
  same single arena battle slot can be reused for every fixture, and no arena
  progress is needed. AUTOPLAY is left on so the battle animates end to end.

  Guest accounts keep no replay history, so the History > Replays list and the
  replay-code box are both dead ends; this re-entry loop is the working path.

Preconditions
  driver.py running, an arena run started once (see README), AUTOPLAY on, and
  the game sitting on the post-battle shop screen.

Usage
  run_fixture.py f02-snipe-crocodile
  run_fixture.py --all
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
PY = os.environ.get("ANIM01_PY", "/root/workspace/.venv-sap/bin/python")
SHOTS = os.path.join(BASE, "shots")

# Canvas coordinates at viewport 1280x800, found by screenshot-inspect-click.
BTN = {
    "hamburger": (1255, 63),
    "return_to_menu": (1156, 208),
    "register_cancel": (558, 565),
    "play": (640, 278),
    "arena": (640, 278),
    "replay_play": (562, 77),
    "replay_autoplay": (640, 77),
}


def ctl(op, **kw):
    cmd = [PY, os.path.join(HERE, "ctl.py"), op]
    for k, v in kw.items():
        cmd += [f"--{k}", str(v)]
    cmd += ["--timeout", "900"]
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=HERE).stdout.strip()
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out}


def click(name, wait=1500):
    x, y = BTN[name]
    return ctl("click", x=x, y=y, wait=wait)


def thumb(path, size=(80, 50)):
    from PIL import Image
    with Image.open(path) as im:
        return im.convert("L").resize(size)


def still(clipdir, span=24, thresh=1.6):
    """True when the newest frames are visually identical.

    Unity renders continuously so the screencast never stops; the only reliable
    end-of-animation signal is that the picture stopped changing.
    """
    names = sorted(n for n in os.listdir(clipdir) if n.endswith(".jpg"))
    if len(names) < span + 1:
        return False
    a, b = thumb(os.path.join(clipdir, names[-span])), thumb(os.path.join(clipdir, names[-1]))
    pa, pb = list(a.getdata()), list(b.getdata())
    return sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa) < thresh


def register_dialog_open(path):
    """The guest 'complete your account' dialog covers the menu after leaving a run."""
    from PIL import Image
    with Image.open(path) as im:
        r, g, b = im.convert("RGB").getpixel((500, 248))
    # dialog: light grey input field; main menu: sky blue
    return abs(r - g) < 20 and abs(g - b) < 20 and r > 150


def to_battle(fid):
    """Leave to the main menu and re-enter the arena run, which refetches the battle."""
    click("hamburger", wait=2500)
    click("return_to_menu", wait=7000)
    probe = os.path.join(SHOTS, "_menu_probe.jpg")
    ctl("shot", path=probe)
    if register_dialog_open(probe):
        click("register_cancel", wait=4000)
    click("play", wait=5000)
    return click("arena", wait=1200)


def run(fid):
    payload = os.path.join(BASE, "payloads", f"{fid}.json")
    if not os.path.exists(payload):
        raise SystemExit(f"no payload {payload}")
    clips = os.path.join(BASE, "clips", fid)
    os.makedirs(SHOTS, exist_ok=True)
    subprocess.run(["rm", "-rf", clips])

    print(f"=== {fid}", flush=True)
    print(" arm:", ctl("arm", path=payload), flush=True)
    print(" record:", ctl("record_start", outdir=clips, quality=65,
                          maxWidth=960, maxHeight=600), flush=True)
    print(" enter:", to_battle(fid), flush=True)

    # Give the client time to ask for the battle and start animating.
    t0 = time.time()
    hit = False
    while time.time() - t0 < 90:
        time.sleep(2)
        if ctl("status").get("hits"):
            hit = True
            break
    print(" intercepted:", hit, flush=True)

    # Record where in the clip the battle actually starts, so make_clip.py can
    # drop the menu-navigation lead-in.
    newest = sorted(n for n in os.listdir(clips) if n.endswith(".jpg"))
    battle_start_ms = int(newest[-1].rsplit("_", 1)[1].split(".")[0]) if newest else 0
    with open(os.path.join(clips, "meta.json"), "w") as f:
        json.dump({"fixture": fid, "battle_start_ms": battle_start_ms,
                   "intercepted": hit}, f)

    board = os.path.join(SHOTS, f"{fid}_board.jpg")
    ctl("shot", path=board)

    quiet = 0
    deadline = time.time() + float(os.environ.get("ANIM01_MAX_RECORD", 300))
    while time.time() < deadline:
        time.sleep(2.0)
        if os.path.isdir(clips) and still(clips):
            quiet += 1
            if quiet >= 5:
                break
        else:
            quiet = 0
    res = ctl("record_stop")
    print(" clip:", res, flush=True)
    ctl("shot", path=os.path.join(SHOTS, f"{fid}_end.jpg"))
    return {"fixture": fid, "intercepted": hit, **res}


def main():
    if "--all" in sys.argv:
        fdir = os.path.join(HERE, "fixtures")
        ids = [n[:-5] for n in sorted(os.listdir(fdir))
               if n.endswith(".json") and not n.startswith("_")]
    else:
        ids = [a for a in sys.argv[1:] if not a.startswith("-")]
    out = [run(i) for i in ids]
    print(json.dumps(out, indent=1))


main()
