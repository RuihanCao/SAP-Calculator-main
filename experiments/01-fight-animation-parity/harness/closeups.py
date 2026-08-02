#!/usr/bin/env python3
"""1:1 close-up comparison sheets, real client against ours.

Round 8. The whole-frame side by sides of round 7 are the wrong instrument for
what Ruihan rejected: a seam on a control glyph, a crooked plaque and a pasted
end-screen face are all sub-40px details that a downscaled whole frame throws
away. These sheets crop the same widget out of both sides and put them next to
each other at their captured resolution, never resampled.

Both sides are captured at 3x, so a box given in css pixels of the 1280x800
viewport comes out three times as many real pixels on each side, and neither
image is scaled to meet the other.

  closeups.py --spec closeups.json --out /path/to/round

Each spec entry is
  {"label": ..., "real": <still under ANIM01_REF>, "ours": <still under ANIM01_OURS>,
   "box": [x, y, w, h], "our_box": [x, y, w, h] (optional, if ours sits elsewhere)}
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

REF = os.environ.get("ANIM01_REF", "/root/autodl-tmp/sap-data/anim01/w3b/ref")
OURS = os.environ.get("ANIM01_OURS", "/root/autodl-tmp/sap-data/anim01/w3b/ours")
SCALE = float(os.environ.get("ANIM01_SCALE", "3"))
PAD = 14
LABEL = 22


def cut(root, still, box):
    path = os.path.join(root, still)
    if not os.path.exists(path):
        raise SystemExit(f"missing still {path}")
    x, y, w, h = box
    with Image.open(path) as image:
        return image.convert("RGB").crop(
            (
                int(round(x * SCALE)),
                int(round(y * SCALE)),
                int(round((x + w) * SCALE)),
                int(round((y + h) * SCALE)),
            )
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--blind",
        action="store_true",
        help="drop the REAL/OURS captions so the sheet can be judged blind",
    )
    args = parser.parse_args()

    with open(args.spec) as handle:
        entries = json.load(handle)
    os.makedirs(args.out, exist_ok=True)

    written = []
    for index, entry in enumerate(entries):
        real = cut(REF, entry["real"], entry["box"])
        ours = cut(OURS, entry["ours"], entry.get("our_box", entry["box"]))
        # No resampling on either side: the sheet is as wide as the two crops
        # need and as tall as the taller of them.
        width = real.size[0] + ours.size[0] + PAD * 3
        height = max(real.size[1], ours.size[1]) + PAD * 2 + LABEL
        sheet = Image.new("RGB", (width, height), (24, 26, 30))
        sheet.paste(real, (PAD, PAD + LABEL))
        sheet.paste(ours, (PAD * 2 + real.size[0], PAD + LABEL))
        draw = ImageDraw.Draw(sheet)
        draw.text((PAD, 5), entry["label"], fill=(255, 207, 63))
        if not args.blind:
            draw.text((PAD, PAD + LABEL - 12), "REAL", fill=(120, 220, 140))
            draw.text((PAD * 2 + real.size[0], PAD + LABEL - 12), "OURS", fill=(240, 140, 120))
        name = f"close_{index:02d}_{entry['label'].replace(' ', '-').replace('/', '-')}.png"
        sheet.save(os.path.join(args.out, name))
        written.append((name, real.size, ours.size))
        print(f"{name}  real {real.size}  ours {ours.size}")

    print(f"\n{len(written)} close-ups -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
