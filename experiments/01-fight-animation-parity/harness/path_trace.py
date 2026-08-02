#!/usr/bin/env python3
"""Trace a moving sprite's path across a window into one image.

Per frame: median-background subtraction, then the largest bright component is
kept and its centroid recorded. Prints the centroid track in play-area percent
and writes an overlay so the track can be checked against the picture.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

PLAY_TOP, PLAY_BOTTOM = 30, 570
PLAY_H = PLAY_BOTTOM - PLAY_TOP


def frames(d, a, b):
    out = []
    for n in sorted(os.listdir(d)):
        if not n.endswith(".jpg") or not n.startswith("f_"):
            continue
        try:
            ms = int(n.rsplit("_", 1)[1].split(".")[0])
        except (IndexError, ValueError):
            continue
        if a * 1000 <= ms <= b * 1000:
            out.append((ms / 1000.0, os.path.join(d, n)))
    return out


p = argparse.ArgumentParser()
p.add_argument("clip")
p.add_argument("--from", dest="a", type=float, required=True)
p.add_argument("--to", dest="b", type=float, required=True)
p.add_argument("--box", default="0,30,960,570")
p.add_argument("--bright", type=int, default=200)
p.add_argument("--diff", type=int, default=50)
p.add_argument("--min-area", type=int, default=400)
p.add_argument("--overlay")
p.add_argument("--json")
a = p.parse_args()

l, t, r, bo = [int(v) for v in a.box.split(",")]
picked = frames(a.clip, a.a, a.b)
stack = []
for _, pth in picked[:: max(1, len(picked) // 25)]:
    with Image.open(pth) as im:
        stack.append(np.asarray(im.convert("RGB"))[t:bo, l:r].astype(np.int16))
bg = np.median(np.stack(stack), axis=0)

track = []
for s, pth in picked:
    with Image.open(pth) as im:
        band = np.asarray(im.convert("RGB"))[t:bo, l:r].astype(np.int16)
    d = np.abs(band - bg).max(axis=2)
    mn = band.min(axis=2)
    m = (d > a.diff) & (mn > a.bright)
    m = ndimage.binary_closing(m, np.ones((5, 5)))
    lab, n = ndimage.label(m)
    if n == 0:
        continue
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    comps = []
    for i in order[:4]:
        if sizes[i] < a.min_area:
            continue
        ys, xs = np.nonzero(lab == i + 1)
        comps.append({
            "area": int(sizes[i]),
            "cx": round(float(xs.mean()) + l, 1),
            "cy": round(float(ys.mean()) + t, 1),
            "x0": int(xs.min()) + l, "x1": int(xs.max()) + l,
            "y0": int(ys.min()) + t, "y1": int(ys.max()) + t,
        })
    if comps:
        track.append({"t": round(s, 3), "comps": comps})

for e in track:
    row = "  ".join("[%5d @ %5.1f,%5.1f = %4.1f%%,%4.1f%%]"
                    % (c["area"], c["cx"], c["cy"], c["cx"] / 960 * 100,
                       (c["cy"] - PLAY_TOP) / PLAY_H * 100) for c in e["comps"])
    print("%7.3f %s" % (e["t"], row))

if a.overlay:
    base = min(picked, key=lambda e: abs(e[0] - a.b))
    with Image.open(base[1]) as im:
        canvas = im.convert("RGB").copy()
    d = ImageDraw.Draw(canvas)
    for e in track:
        c = e["comps"][0]
        d.ellipse([c["cx"] - 4, c["cy"] - 4, c["cx"] + 4, c["cy"] + 4], outline=(255, 0, 255), width=2)
    canvas.save(a.overlay, quality=95)
    print("overlay", a.overlay)

if a.json:
    with open(a.json, "w") as f:
        json.dump(track, f, indent=1)
