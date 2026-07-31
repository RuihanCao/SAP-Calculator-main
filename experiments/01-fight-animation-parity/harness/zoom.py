#!/usr/bin/env python3
"""Pull a short window of frames out of a clip at full recorded resolution.

Used to read an individual animation beat closely enough to describe it in
CHECKLIST.md. The filmstrip tiles are downscaled; this is not.

Usage:
  zoom.py <clipdir> <from_s> <to_s> [--n 8] [--out /path/strip.jpg] [--cols 4]
"""
import argparse
import os


def frames(clipdir):
    out = []
    for n in sorted(x for x in os.listdir(clipdir) if x.endswith(".jpg")):
        try:
            ms = int(n.rsplit("_", 1)[1].split(".")[0])
        except Exception:
            continue
        out.append((os.path.join(clipdir, n), ms))
    return out


def main():
    from PIL import Image, ImageDraw
    ap = argparse.ArgumentParser()
    ap.add_argument("clipdir")
    ap.add_argument("start", type=float)
    ap.add_argument("end", type=float)
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--out", default="/tmp/zoom.jpg")
    a = ap.parse_args()

    fs = [f for f in frames(a.clipdir) if a.start * 1000 <= f[1] <= a.end * 1000]
    if not fs:
        raise SystemExit("no frames in range")
    step = max(1, len(fs) // a.n)
    picks = fs[::step][: a.n]

    with Image.open(picks[0][0]) as im:
        w, h = im.size
    rows = (len(picks) + a.cols - 1) // a.cols
    lh = 20
    sheet = Image.new("RGB", (a.cols * w, rows * (h + lh)), (16, 16, 16))
    d = ImageDraw.Draw(sheet)
    for i, (p, ms) in enumerate(picks):
        with Image.open(p) as im:
            x, y = (i % a.cols) * w, (i // a.cols) * (h + lh)
            sheet.paste(im.convert("RGB"), (x, y + lh))
            d.text((x + 6, y + 5), f"t={ms / 1000:.2f}s", fill=(250, 230, 120))
    sheet.save(a.out, quality=88)
    print(a.out, sheet.size, len(picks))


main()
