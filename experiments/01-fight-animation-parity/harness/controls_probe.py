#!/usr/bin/env python3
"""Drive the real game's replay control bar on a running battle and record it.

W0b needs the grammar of the control bar (REWIND, PAUSE, AUTOPLAY, FAST, SKIP),
which only exists while a battle is animating. This script enters a battle
exactly the way run_fixture.py does, waits for the bar to actually be on screen,
then fires a timed script of button presses and labelled screenshots, with the
whole thing screencast so every press can be read back frame by frame.

Two things this gets right that a naive timed script does not:

- All step times are measured from the moment the control bar becomes visible,
  not from the moment the payload was intercepted. The interception is detected
  by polling, so it is up to a second late, and the bar itself fades in. Timing
  presses from the interception lands them on a bar that is not clickable yet,
  and the press is silently lost.
- FAST is a toggle whose state survives between battles, so a blind press is a
  coin flip. `fast_on` / `fast_off` read the button out of the newest recorded
  frame and press only when the state is wrong.

Timeline entries are `<seconds after the bar appeared>=<action>`, comma
separated. Actions: rewind, pause, autoplay, fast, skip, fast_on, fast_off,
park (move the cursor off the bar, because a hovered button draws a black focus
ring that reads like an engaged state), shot.

Usage
  controls_probe.py f01-plain-trades fast-f01 "0.3=fast_on,0.9=park" --seconds=26
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

# Menu buttons, same coordinates run_fixture.py uses (viewport 1280x800).
NAV = {
    "hamburger": (1255, 63),
    "return_to_menu": (1156, 208),
    "register_cancel": (558, 565),
    "play": (640, 278),
    "arena": (640, 278),
}

# Replay control bar, viewport 1280x800: y=77, ~78 px between buttons.
CTRL = {
    "rewind": (483, 77),
    "pause": (562, 77),
    "autoplay": (640, 77),
    "fast": (716, 77),
    "skip": (794, 77),
    "park": (150, 430),
}

# Probe points in the 960x600 screencast frame. PAUSE_BARS are the two white
# bars of the pause glyph: both white only while the bar is on screen. FAST_ARROWS
# is the fast-forward glyph, which is pure white when FAST is off and dimmed to
# about 217 when FAST is on.
PAUSE_BARS = ((415, 60), (427, 60))
FAST_ARROWS = (520, 57, 558, 72)
FAST_ON_MAX = 240


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


def click_xy(x, y, wait=200):
    return ctl("click", x=x, y=y, wait=wait, hover=60)


def newest(clips):
    names = sorted(n for n in os.listdir(clips) if n.endswith(".jpg"))
    return os.path.join(clips, names[-1]) if names else None


def bar_visible(path):
    from PIL import Image
    with Image.open(path) as im:
        im = im.convert("RGB")
        return all(min(im.getpixel(p)) > 225 for p in PAUSE_BARS)


def fast_engaged(path):
    from PIL import Image
    with Image.open(path) as im:
        return max(im.convert("L").crop(FAST_ARROWS).getdata()) < FAST_ON_MAX


def register_dialog_open(path):
    from PIL import Image
    with Image.open(path) as im:
        r, g, b = im.convert("RGB").getpixel((500, 248))
    return abs(r - g) < 20 and abs(g - b) < 20 and r > 150


def to_battle():
    for name, wait in (("hamburger", 2500), ("return_to_menu", 7000)):
        click_xy(*NAV[name], wait=wait)
    probe = os.path.join(SHOTS, "_menu_probe.jpg")
    ctl("shot", path=probe)
    if register_dialog_open(probe):
        click_xy(*NAV["register_cancel"], wait=4000)
    click_xy(*NAV["play"], wait=5000)
    return click_xy(*NAV["arena"], wait=1200)


def main():
    fixture, label, script = sys.argv[1], sys.argv[2], sys.argv[3]
    seconds = float(next((a.split("=")[1] for a in sys.argv[4:]
                          if a.startswith("--seconds=")), 26))

    steps = []
    for item in script.split(","):
        if item.strip():
            at, action = item.split("=")
            steps.append((float(at), action.strip().lower()))
    steps.sort()

    payload = os.path.join(BASE, "payloads", f"{fixture}.json")
    clips = os.path.join(BASE, "clips", label)
    subprocess.run(["rm", "-rf", clips])
    print("arm:", ctl("arm", path=payload), flush=True)
    print("record:", ctl("record_start", outdir=clips, quality=65,
                         maxWidth=960, maxHeight=600), flush=True)
    print("enter:", to_battle(), flush=True)

    t0 = time.time()
    while time.time() - t0 < 90:
        time.sleep(1)
        if ctl("status").get("hits"):
            break
    intercept_ms = int(os.path.basename(newest(clips)).rsplit("_", 1)[1].split(".")[0])

    bar_t, bar_ms = None, None
    t0 = time.time()
    while time.time() - t0 < 40:
        p = newest(clips)
        if p and bar_visible(p):
            bar_t = time.time()
            bar_ms = int(os.path.basename(p).rsplit("_", 1)[1].split(".")[0])
            break
        time.sleep(0.1)
    if bar_t is None:
        raise SystemExit("control bar never appeared")
    print(f"bar at clip ms {bar_ms} (intercept {intercept_ms})", flush=True)

    events = []
    for at, action in steps:
        dt = bar_t + at - time.time()
        if dt > 0:
            time.sleep(dt)
        now_ms = bar_ms + int((time.time() - bar_t) * 1000)
        note = ""
        if action == "shot":
            path = os.path.join(SHOTS, f"{label}_bar{int(at * 10):04d}.jpg")
            ctl("shot", path=path)
            note = path
        elif action in ("fast_on", "fast_off"):
            want = action == "fast_on"
            have = fast_engaged(newest(clips))
            note = f"was {'on' if have else 'off'}"
            if have != want:
                click_xy(*CTRL["fast"])
                note += " -> pressed"
            else:
                note += " -> no press"
        else:
            click_xy(*CTRL[action])
        events.append({"at": at, "action": action, "clip_ms": now_ms, "note": note})
        print(f"  bar+{at:5.1f}s {action} (clip ms {now_ms}) {note}", flush=True)

    dt = bar_t + seconds - time.time()
    if dt > 0:
        time.sleep(dt)
    res = ctl("record_stop")
    with open(os.path.join(clips, "meta.json"), "w") as f:
        json.dump({"fixture": fixture, "label": label,
                   "battle_start_ms": intercept_ms, "bar_ms": bar_ms,
                   "events": events}, f, indent=1)
    print("clip:", res, flush=True)
    ctl("shot", path=os.path.join(SHOTS, f"{label}_end.jpg"))


main()
