#!/usr/bin/env python3
"""Read the death puff and the level-up burst off the recorded clips, frame by frame.

The ripped build hands over the particle *textures* but not the particle
systems' parameters (the type trees are stripped), so the motion has to come
from the ground truth clips instead of being invented. This walks a clip's
frames, isolates the effect by colour, and prints, per frame, how big it is and
where its centre is, which is enough to fit an onset, a growth curve, a peak and
a decay.

  measure_fx.py puff  clips/f03-faint-chain --from 22.0 --to 26.0
  measure_fx.py burst clips/f14-xp-pug      --from 30.0 --to 34.0

`puff` looks for near-white, low-saturation pixels: the faint cloud. `burst`
looks for saturated yellow: the level-up star spray. Both ignore the letterbox
and the bottom strip so the client's own chrome cannot be mistaken for an
effect, and both report against the play area rather than the frame, so the
numbers drop straight into the stage's percentage geometry.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")

# The reference recordings are a 960x600 viewport carrying a 960x540 play area
# on rows 30..569.
PLAY_TOP = 30
PLAY_BOTTOM = 570


def frames(directory, start_s, end_s):
    out = []
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".jpg") or not name.startswith("f_"):
            continue
        try:
            stamp = int(name.rsplit("_", 1)[1].split(".")[0])
        except (IndexError, ValueError):
            continue
        seconds = stamp / 1000.0
        if start_s <= seconds <= end_s:
            out.append((seconds, os.path.join(directory, name)))
    return out


def mask_for(kind, a):
    r = a[..., 0].astype(int)
    g = a[..., 1].astype(int)
    b = a[..., 2].astype(int)
    if kind == "puff":
        # Near white and near neutral: the cloud. The field's own clouds live in
        # the sky band, which the caller excludes with --top.
        spread = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
        return (r > 205) & (g > 205) & (b > 205) & (spread < 26)
    if kind == "burst":
        # Saturated yellow: the star spray. The lane's sand is yellow too but
        # much darker and less saturated, hence the floor on r and the gap to b.
        return (r > 205) & (g > 160) & (b < 130) & (r - b > 95)
    if kind == "flash":
        return (r > 244) & (g > 244) & (b > 244)
    raise SystemExit(f"unknown kind {kind}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["puff", "burst", "flash"])
    parser.add_argument("clip")
    parser.add_argument("--from", dest="start", type=float, required=True)
    parser.add_argument("--to", dest="end", type=float, required=True)
    parser.add_argument("--top", type=float, default=0.35, help="ignore above this fraction of the play area")
    parser.add_argument("--bottom", type=float, default=0.97)
    parser.add_argument("--json", help="write the per-frame series here")
    args = parser.parse_args()

    directory = args.clip if os.path.isabs(args.clip) else os.path.join(BASE, args.clip)
    picked = frames(directory, args.start, args.end)
    if not picked:
        raise SystemExit(f"no frames in {directory} between {args.start}s and {args.end}s")

    play_h = PLAY_BOTTOM - PLAY_TOP
    top = PLAY_TOP + int(play_h * args.top)
    bottom = PLAY_TOP + int(play_h * args.bottom)

    # A median background over the window, so the board's own white art (the
    # halos on every sprite, the stat plates, the sky's clouds) cancels and only
    # what is transient is counted. Without it the "puff" reading is dominated by
    # five pets standing still and never moves.
    stack = []
    for _, path in picked[:: max(1, len(picked) // 24)]:
        with Image.open(path) as image:
            stack.append(np.asarray(image.convert("RGB"))[top:bottom].astype(np.int16))
    background = np.median(np.stack(stack), axis=0)
    background_mask = mask_for(args.kind, background)

    series = []
    for seconds, path in picked:
        with Image.open(path) as image:
            a = np.asarray(image.convert("RGB"))
        band = a[top:bottom]
        mask = mask_for(args.kind, band) & ~background_mask
        count = int(mask.sum())
        if count:
            ys, xs = np.nonzero(mask)
            entry = {
                "t": round(seconds, 3),
                "px": count,
                "pct_play": round(count / (960 * play_h) * 100, 3),
                "cx_pct": round(float(xs.mean()) / 960 * 100, 2),
                "cy_pct": round((float(ys.mean()) + top - PLAY_TOP) / play_h * 100, 2),
                "w_pct": round(float(xs.max() - xs.min()) / 960 * 100, 2),
                "h_pct": round(float(ys.max() - ys.min()) / play_h * 100, 2),
            }
        else:
            entry = {"t": round(seconds, 3), "px": 0, "pct_play": 0.0}
        series.append(entry)

    peak = max(series, key=lambda e: e["px"])
    live = [e for e in series if e["px"] > peak["px"] * 0.10]
    print(f"# {args.kind} in {os.path.basename(directory)}  {args.start}s..{args.end}s  ({len(series)} frames)")
    for entry in series:
        bar = "#" * min(60, entry["px"] // max(1, peak["px"] // 60 or 1))
        extra = ""
        if entry["px"]:
            extra = f" c=({entry['cx_pct']:.1f},{entry['cy_pct']:.1f})% {entry['w_pct']:.1f}x{entry['h_pct']:.1f}%"
        print(f"{entry['t']:8.3f}  {entry['px']:7d} {entry['pct_play']:6.3f}% {bar}{extra}")
    if live:
        print(
            f"\nonset {live[0]['t']:.3f}s  peak {peak['t']:.3f}s ({peak['px']} px, "
            f"{peak['w_pct']:.1f}x{peak['h_pct']:.1f}% of play)  end {live[-1]['t']:.3f}s  "
            f"duration {live[-1]['t'] - live[0]['t']:.3f}s"
        )
    if args.json:
        with open(args.json, "w") as handle:
            json.dump(series, handle, indent=1)
        print(f"series -> {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
