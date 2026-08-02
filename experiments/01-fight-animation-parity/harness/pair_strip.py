#!/usr/bin/env python3
"""1:1 strips of one beat, the real client above and ours below.

`closeups.py` compares a still of a widget. A death, a throw and a buff are not
stills, so this is the moving version of the same instrument: the same crop box
out of both sides at the same offsets from a named anchor frame, laid out as two
rows at their captured resolution with nothing resampled on either side.

That is only a fair comparison if both sides were captured the same size, which
is why `record_calc.py` grew `--viewport 960x600`: the reference clips are a
960x600 screencast carrying a 960x540 play area on rows 30..570, and the stage's
field is 16:9, so at that viewport ours is the same play area pixel for pixel.

  pair_strip.py --spec strips.json --out /path/to/round

Each spec entry:
  {"label": ..., "real": {"clip": ..., "anchor": 29.924},
   "ours": {"clip": ..., "anchor": 10.05},
   "offsets": [-0.1, 0, 0.2, ...], "box": [l, t, r, b], "cols": 6}
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
PAD = 10
LABEL = 15
ROW_LABEL = 58


def frames(directory):
    out = {}
    for name in os.listdir(directory):
        if not name.startswith("f_") or not name.endswith(".jpg"):
            continue
        out[int(name.rsplit("_", 1)[1].split(".")[0])] = os.path.join(directory, name)
    return out


def pick(index, at_ms):
    return index[min(index, key=lambda stamp: abs(stamp - at_ms))]


def row(side, offsets, box):
    directory = side["clip"]
    if not os.path.isabs(directory):
        directory = os.path.join(BASE, directory)
    index = frames(directory)
    if not index:
        raise SystemExit(f"no frames in {directory}")
    anchor_ms = side["anchor"] * 1000
    tiles = []
    for offset in offsets:
        want = anchor_ms + offset * 1000
        path = pick(index, want)
        stamp = int(path.rsplit("_", 1)[1].split(".")[0])
        with Image.open(path) as image:
            tiles.append((image.convert("RGB").crop(tuple(box)), (stamp - anchor_ms) / 1000.0))
    return tiles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--blind", action="store_true")
    args = parser.parse_args()

    with open(args.spec) as handle:
        entries = json.load(handle)
    os.makedirs(args.out, exist_ok=True)

    for index, entry in enumerate(entries):
        offsets = entry["offsets"]
        box = entry["box"]
        cols = entry.get("cols", min(6, len(offsets)))
        real = row(entry["real"], offsets, box)
        # A different crop for our side only when the two boards genuinely sit
        # somewhere different; the slot geometry matches, so this is rare.
        ours = row(entry["ours"], offsets, entry.get("our_box", box))
        width, height = real[0][0].size
        rows = (len(offsets) + cols - 1) // cols
        sheet_w = ROW_LABEL + cols * (width + PAD) + PAD
        band = rows * (height + LABEL + PAD)
        sheet = Image.new("RGB", (sheet_w, LABEL + 2 * band + PAD), (24, 26, 30))
        draw = ImageDraw.Draw(sheet)
        draw.text((PAD, 3), entry["label"], fill=(255, 207, 63))
        for which, (tiles, name, colour) in enumerate(
            ((real, "REAL", (120, 220, 140)), (ours, "OURS", (240, 140, 120)))
        ):
            top = LABEL + which * band
            if not args.blind:
                draw.text((6, top + height // 2), name, fill=colour)
            for i, (tile, actual) in enumerate(tiles):
                x = ROW_LABEL + (i % cols) * (width + PAD)
                y = top + (i // cols) * (height + LABEL + PAD)
                sheet.paste(tile, (x, y + LABEL))
                draw.text((x + 2, y + 2), f"{actual:+.2f}s", fill=(200, 200, 210))
        name = f"strip_{index:02d}_{entry['label'].replace(' ', '-').replace('/', '-')}.png"
        sheet.save(os.path.join(args.out, name))
        print(f"{name}  {sheet.size}  tile {width}x{height}  {len(offsets)} offsets")

    print(f"\n{len(entries)} strips -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
