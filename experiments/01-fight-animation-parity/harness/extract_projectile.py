#!/usr/bin/env python3
"""Cut the damage rock the client throws for a snipe out of the reference clips.

The shipped build does not carry this sprite under any name. Everything named
`Rock`, `SuperRock`, `ManaRock` or `Meteor` in it is a food or a pet token with
eyes drawn on it, `Icons/snipe.png` is the flat UI form with a UI-weight
outline, and a shape-and-colour match of the reference crop against all 2202
sprites in the build returns nothing better than `coins_1`. So this is a
reference-frame cut, which is the next rule down in the game-replication skill.

It is not a rectangle of screenshot. The background is the per-pixel median over
the whole flight window, in which the rock occupies any given pixel for at most
two frames out of forty, so the median is the clean field behind it. Alpha comes
from how far the frame has moved off that background and the colour is then
un-mixed,

    observed = alpha * colour + (1 - alpha) * background

so the sprite keeps its own black keyline and its own white halo with a real
alpha edge, and no green comes with it.

  extract_projectile.py --out src/assets/art/Extracted/damage-rock.png
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

BASE = os.environ.get("ANIM01_BASE", "/root/autodl-tmp/sap-data/anim01")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

CLIP = "clips/f02-snipe-crocodile"
# The whole flight, for the background median.
WINDOW = (29.2, 30.3)
# The frame the cut is taken from and the tracker's centre for the rock in it.
# t=29.815 is the one clear frame: the rock is at full size, is past the ability
# card, and stands on the forest band, whose green is as far from the sprite's
# black, grey and white as anything on the field gets.
STAMP = 29815
CENTRE = (663, 269)
HALF = 40
# How far off the background a pixel has to be to count as sprite at all.
FLOOR = 26.0
# Where alpha saturates. The keyline is 200 off the green, the halo about 150.
SPAN = 105.0


def frames_in(directory, lo, hi):
    out = []
    for name in sorted(os.listdir(directory)):
        if not name.startswith("f_") or not name.endswith(".jpg"):
            continue
        stamp = int(name.rsplit("_", 1)[1].split(".")[0])
        if lo * 1000 <= stamp <= hi * 1000:
            out.append((stamp, os.path.join(directory, name)))
    return out


def frame_at(directory, stamp):
    for name in os.listdir(directory):
        if name.startswith("f_") and name.endswith(f"_{stamp:07d}.jpg"):
            return os.path.join(directory, name)
    raise SystemExit(f"no frame {stamp} in {directory}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clip", default=os.path.join(BASE, CLIP))
    parser.add_argument(
        "--out",
        default=os.path.join(REPO, "src", "assets", "art", "Extracted", "damage-rock.png"),
    )
    parser.add_argument("--no-manifest", action="store_true")
    args = parser.parse_args()

    stack = []
    for _, path in frames_in(args.clip, *WINDOW):
        with Image.open(path) as image:
            stack.append(np.asarray(image.convert("RGB")).astype(np.float32))
    background = np.median(np.stack(stack), axis=0)

    cx, cy = CENTRE
    with Image.open(frame_at(args.clip, STAMP)) as image:
        full = np.asarray(image.convert("RGB")).astype(np.float32)
    box = (slice(cy - HALF, cy + HALF), slice(cx - HALF, cx + HALF))
    obs = full[box]
    bg = background[box]

    distance = np.abs(obs - bg).max(axis=2)
    alpha = np.clip((distance - FLOOR) / SPAN, 0.0, 1.0)

    # Keep one blob and fill it: the rock is opaque all through, and any hole in
    # it is a place where the sprite happened to match the field behind it.
    core = ndimage.binary_fill_holes(alpha > 0.45)
    labels, count = ndimage.label(core)
    if count:
        sizes = ndimage.sum(core, labels, range(1, count + 1))
        core = labels == (int(np.argmax(sizes)) + 1)
    inner = ndimage.binary_erosion(core, np.ones((3, 3)))
    alpha = np.where(inner, 1.0, alpha)
    alpha = np.where(core | (ndimage.binary_dilation(core, np.ones((5, 5)))), alpha, 0.0)

    safe = np.maximum(alpha, 0.04)[..., None]
    colour = np.clip((obs - (1.0 - alpha[..., None]) * bg) / safe, 0, 255)

    # The rock is neutral all through: a black keyline, a grey-blue body whose
    # channels are within about 14 of each other, and a white halo. Anything
    # further off neutral than that came from behind it, where the un-mix had a
    # background estimate that was one frame stale, so it is pulled back to its
    # own luminance. Without this the halo carries a beige crescent off the
    # level plaque the rock passed over.
    luma = colour.mean(axis=2, keepdims=True)
    spread = colour.max(axis=2, keepdims=True) - colour.min(axis=2, keepdims=True)
    pull = np.clip((spread - 22.0) / 30.0, 0.0, 1.0)
    colour = colour * (1.0 - pull) + luma * pull

    rgba = np.dstack([colour, alpha * 255]).astype(np.uint8)
    sprite = Image.fromarray(rgba, "RGBA")
    cropped = sprite.getbbox()
    if cropped:
        sprite = sprite.crop(cropped)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    sprite.save(args.out)
    print(f"damage-rock    {sprite.size}  <- {os.path.basename(args.clip)} frame {STAMP}")

    if not args.no_manifest:
        path = os.path.join(os.path.dirname(args.out), "manifest.json")
        manifest = {}
        if os.path.exists(path):
            with open(path) as handle:
                manifest = json.load(handle)
        manifest["damage-rock"] = {
            "source_clip": CLIP,
            "source_frame": STAMP,
            "centre": list(CENTRE),
            "method": "median-background alpha key and un-mix",
            "pixels": list(sprite.size),
            "note": "the build ships no such sprite; see harness/extract_projectile.py",
        }
        with open(path, "w") as handle:
            json.dump(manifest, handle, indent=1, sort_keys=True)
        print("manifest ->", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
