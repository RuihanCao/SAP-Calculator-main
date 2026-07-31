#!/usr/bin/env python3
"""Contact sheet of one screen REGION over a time window, upscaled 2x.

zoom.py pulls whole frames at their recorded resolution, which is enough for a
whole-board beat but not for reading a widget: the trumpet counter is about
170 px wide in a 960x600 screencast, and the digit in it decides whether an
event was a gain or a spend. This crops a fixed box out of each picked frame
and doubles it, which is how the `z_*_counter_*.jpg` and `z_f16_launch.jpg`
strips cited in CHECKLIST.md were made.

Usage:
  crop_strip.py <clipdir> <from_s> <to_s> <n> <out.jpg> <l,t,r,b> [cols]

Example, the trumpet counter during the f15 spend:
  crop_strip.py .../clips/f15-trumpet-spend-nyala-nurseshark 33.9 34.7 9 \
      out/z_f15_counter_spend.jpg 90,110,660,290 3
"""
import os
import sys

from PIL import Image, ImageDraw

SCALE = 2
LABEL_H = 18


def main():
    if len(sys.argv) < 7:
        raise SystemExit(__doc__)
    clipdir, start, end = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    n, out = int(sys.argv[4]), sys.argv[5]
    box = tuple(int(v) for v in sys.argv[6].split(","))
    cols = int(sys.argv[7]) if len(sys.argv) > 7 else 4

    frames = []
    for name in sorted(x for x in os.listdir(clipdir) if x.endswith(".jpg")):
        try:
            ms = int(name.rsplit("_", 1)[1].split(".")[0])
        except (IndexError, ValueError):
            continue
        if start * 1000 <= ms <= end * 1000:
            frames.append((os.path.join(clipdir, name), ms))
    if not frames:
        raise SystemExit("no frames in range")

    step = max(1, len(frames) // n)
    picks = frames[::step][:n]

    w, h = box[2] - box[0], box[3] - box[1]
    rows = (len(picks) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w * SCALE, rows * (h * SCALE + LABEL_H)), (16, 16, 16))
    draw = ImageDraw.Draw(sheet)
    for i, (path, ms) in enumerate(picks):
        with Image.open(path) as im:
            tile = im.convert("RGB").crop(box).resize((w * SCALE, h * SCALE), Image.LANCZOS)
        x, y = (i % cols) * w * SCALE, (i // cols) * (h * SCALE + LABEL_H)
        sheet.paste(tile, (x, y + LABEL_H))
        draw.text((x + 6, y + 4), f"t={ms / 1000:.2f}s", fill=(250, 230, 120))
    sheet.save(out, quality=90)
    print(out, sheet.size, len(picks))


main()
