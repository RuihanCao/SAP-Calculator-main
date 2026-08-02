#!/usr/bin/env python3
"""Measure the corpse flight path off a frame where the whole trail is drawn.

The trail is near-white and the board's own white art is static, so a median
background over the window is subtracted first. What is left is binned by x and
the mean y of each bin is printed, in play-area percentages, which is the same
coordinate system the stage's geometry constants use.
"""
import argparse
import os

import numpy as np
from PIL import Image

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
p.add_argument("--at", type=float, required=True, help="frame to measure")
p.add_argument("--bgfrom", type=float, required=True)
p.add_argument("--bgto", type=float, required=True)
p.add_argument("--box", default="0,30,960,570")
p.add_argument("--save")
a = p.parse_args()

l, t, r, bo = [int(v) for v in a.box.split(",")]
window = frames(a.clip, a.bgfrom, a.bgto)
stack = []
for _, pth in window[:: max(1, len(window) // 25)]:
    with Image.open(pth) as im:
        stack.append(np.asarray(im.convert("RGB"))[t:bo, l:r].astype(np.int16))
bg = np.median(np.stack(stack), axis=0)

target = min(frames(a.clip, a.at - 0.06, a.at + 0.06), key=lambda e: abs(e[0] - a.at))
print("frame", os.path.basename(target[1]), "t=%.3f" % target[0])
with Image.open(target[1]) as im:
    band = np.asarray(im.convert("RGB"))[t:bo, l:r].astype(np.int16)

d = np.abs(band - bg).max(axis=2)
rr, gg, bb = band[..., 0], band[..., 1], band[..., 2]
mn = np.minimum(np.minimum(rr, gg), bb)
mx = np.maximum(np.maximum(rr, gg), bb)
m = (d > 40) & (mn > 195) & (mx - mn < 40)
ys, xs = np.nonzero(m)
print("trail px", len(xs))
if len(xs):
    print("bbox x %d..%d  y %d..%d" % (xs.min() + l, xs.max() + l, ys.min() + t, ys.max() + t))
    print(" x_px   x%%play   n    mean_y_px  y%%play   thickness_px")
    for x0 in range(xs.min(), xs.max() + 1, 20):
        k = (xs >= x0) & (xs < x0 + 20)
        if k.sum() < 12:
            continue
        yy = ys[k]
        print("  %4d   %5.1f  %5d   %6.1f     %5.1f      %4d"
              % (x0 + l, (x0 + l + 10) / 960 * 100, k.sum(), yy.mean() + t,
                 (yy.mean() + t - PLAY_TOP) / PLAY_H * 100, yy.max() - yy.min() + 1))

if a.save:
    out = np.zeros(band.shape[:2], dtype=np.uint8)
    out[m] = 255
    Image.fromarray(out).save(a.save)
    print("saved", a.save)
