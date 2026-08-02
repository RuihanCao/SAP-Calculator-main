#!/usr/bin/env python3
"""Cut the battle UI's art out of high resolution reference stills.

Everything the battle animation draws has to come from the game rather than
from a hand-written SVG path (game-replication skill, rule 4). What the ripped
asset pack does not carry is the in-battle chrome: the level plaque, the replay
bar, the plates the toast and the entrance names sit on, the puff cloud, the
burst star, the trumpet counter and the end screen's face. Those are cut from
`capture_refs.py` stills here and land in `src/assets/art/Extracted/` with a
provenance line each.

The cut is a plain rectangle plus a background knock-out: the pieces all wear
the game's white halo, so a flood fill inwards from the border of the box
removes the field behind them and leaves the sprite with its own alpha edge.
Pieces that are translucent rather than haloed (the replay tile) say so with
`"keep_background": true` and are cut opaque, and the stylesheet composites them
the way the client does.

Usage
  extract_assets.py                    # write every asset plus the manifest
  extract_assets.py --list             # print what would be written
  extract_assets.py --contact /tmp/x.png   # one sheet of everything, to eyeball
"""
import argparse
import json
import os
import sys
from collections import deque

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
REF = os.environ.get("ANIM01_REF", "/root/autodl-tmp/sap-data/anim01/w3b/ref")
OUT = os.path.join(REPO, "src", "assets", "art", "Extracted")
SCALE = 3.0
# The replay tile's own colour where it stands over plain sky, measured on the
# still the glyphs are cut from. The stylesheet reproduces the tile from this
# and from the sky it sits on, rather than baking a rectangle of that sky into
# every glyph.
TILE_RGB = (77, 150, 173)

# name -> (still, [x, y, w, h] in CSS px of a 1280x800 viewport, options)
#
# Every still is a 3x CDP capture of the real client taken by capture_refs.py;
# the fixture and the still's own timestamp are the provenance and are written
# into EXTRACTION.md next to the assets.
ASSETS = {
    # Round 8: everything that had a ripped counterpart is gone from here and
    # comes out of the client's own build instead (see harness/copy_ripped.py
    # and art/Ripped/manifest.json). What is left is the two plates, which the
    # build does not carry as a single sprite: the client composes them from a
    # nine-slice panel at runtime, so a cut of the composed plate is still the
    # closest thing to the original.
    "plate-vs": ("f11-jump-african-wild-dog/r_001_0001000.png", [594, 247, 92, 90], {}),
    "plate-name": (
        "f11-jump-african-wild-dog/r_001_0001000.png",
        [176, 255, 176, 74],
        # Blanked inside the keyline: this piece is a nine-slice frame, and the
        # `fill` keyword stretches whatever is in the middle across the whole
        # card. Leaving the reference team's own name in there printed it under
        # every label the stage draws.
        {"blank_slice": 40},
    ),
}


def flood_background(image, tolerance=42):
    """Knock the field out from behind a haloed sprite.

    Walks in from every border pixel and clears anything that stays close to the
    colour it started from, which is the background the sprite was standing on.
    The sprite's own white halo stops the walk, so the result keeps the art's
    own edge instead of a rectangle of grass.
    """
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    seen = [[False] * height for _ in range(width)]
    queue = deque()

    def seed(x, y):
        if not seen[x][y]:
            seen[x][y] = True
            queue.append((x, y, pixels[x, y][:3]))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)

    cleared = []
    while queue:
        x, y, origin = queue.popleft()
        r, g, b, _ = pixels[x, y]
        # The art's own white halo and black keyline are walls. Connectivity
        # alone is not enough: the halo is anti-aliased against the field, and
        # one soft pixel is all it takes for the fill to get inside a plate and
        # hollow it out, which is what emptied the entrance plate and the cloud
        # on the pass before this one.
        if min(r, g, b) > 222 or max(r, g, b) < 64:
            continue
        if abs(r - origin[0]) + abs(g - origin[1]) + abs(b - origin[2]) > tolerance:
            continue
        cleared.append((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and not seen[nx][ny]:
                seen[nx][ny] = True
                # The seed colour travels with the walk rather than being reset
                # to the pixel just visited. Resetting it lets the fill climb an
                # anti-aliased edge one small step at a time and eat the sprite
                # from the outside in, which is what the first pass did: every
                # piece came back as a hollow outline.
                queue.append((nx, ny, origin))
    for x, y in cleared:
        pixels[x, y] = (0, 0, 0, 0)
    return image


def trim(image):
    box = image.getbbox()
    return image.crop(box) if box else image


def white_key(image, tile_rgb, floor=0.16):
    """Lift the white label and glyph off a flat replay tile.

    The tile itself is a flat translucent rectangle, which the stylesheet draws;
    what has to come out as art is the white printing on it. Alpha is how far
    each pixel has travelled from the tile's own colour towards white, and the
    colour is forced back to white, so a tile whose control is disengaged and
    printed grey still yields the full strength glyph.
    """
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    base = sum(tile_rgb) / 3
    span = max(1.0, 255.0 - base)
    raw = {}
    for x in range(width):
        for y in range(height):
            r, g, b, _ = pixels[x, y]
            alpha = ((r + g + b) / 3 - base) / span
            if alpha > floor:
                raw[(x, y)] = alpha
    # A control the client draws disengaged wears a grey veil, so its printing
    # comes out of the subtraction faint. Normalising on the strongest tenth of
    # the pixels gives the same full strength glyph either way, and the
    # stylesheet puts the dimming back where the reference has it.
    if raw:
        ordered = sorted(raw.values())
        peak = ordered[int(len(ordered) * 0.9)] or 1.0
    else:
        peak = 1.0
    for x in range(width):
        for y in range(height):
            alpha = raw.get((x, y))
            if alpha is None:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (255, 255, 255, min(255, int(round(alpha / peak * 255))))
    return image


def cut(name, still, css_box, options):
    path = os.path.join(REF, still)
    if not os.path.exists(path):
        raise SystemExit(f"missing still {path}")
    x, y, w, h = css_box
    with Image.open(path) as source:
        box = (
            int(round(x * SCALE)),
            int(round(y * SCALE)),
            int(round((x + w) * SCALE)),
            int(round((y + h) * SCALE)),
        )
        piece = source.convert("RGBA").crop(box)
    if options.get("white_key"):
        return white_key(piece, options["white_key"], options.get("floor", 0.16))
    if not options.get("keep_background"):
        if not options.get("palette_only"):
            piece = flood_background(piece, options.get("tolerance", 60))
        if options.get("drop_yellow"):
            pixels = piece.load()
            for x in range(piece.size[0]):
                for y in range(piece.size[1]):
                    r, g, b, a = pixels[x, y]
                    if a and r > 170 and g > 120 and b < 110 and r - b > 90:
                        pixels[x, y] = (0, 0, 0, 0)
        if options.get("drop_green"):
            # The cloud sits in front of the forest band, and the notches
            # between its lobes are pockets of leaf green the border walk cannot
            # reach. The cloud itself has no green in it, so the pockets go by
            # palette.
            pixels = piece.load()
            for x in range(piece.size[0]):
                for y in range(piece.size[1]):
                    r, g, b, a = pixels[x, y]
                    if a and g > r + 22 and g > b + 22:
                        pixels[x, y] = (0, 0, 0, 0)
        piece = trim(piece)
    slice_px = options.get("blank_slice")
    if slice_px:
        pixels = piece.load()
        width, height = piece.size
        for x in range(slice_px, width - slice_px):
            for y in range(slice_px, height - slice_px):
                pixels[x, y] = (255, 255, 255, 255)
    return piece


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--contact")
    parser.add_argument("--out", default=OUT)
    args = parser.parse_args()

    wanted = {k: v for k, v in ASSETS.items() if not args.names or k in args.names}
    if args.list:
        for name, (still, box, _) in wanted.items():
            print(f"{name:14s} {still}  css{box}")
        return 0

    os.makedirs(args.out, exist_ok=True)
    # The manifest is merged, not rewritten. Cutting one asset by name used to
    # leave the file holding only that asset, which quietly stripped the
    # provenance off the other ten while the art itself stayed on disk.
    manifest_path = os.path.join(args.out, "manifest.json")
    manifest = {}
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path) as handle:
                manifest = json.load(handle)
        except (OSError, ValueError) as exc:
            raise SystemExit(f"manifest at {manifest_path} is unreadable: {exc}")
    # Entries for assets that are no longer produced would be provenance for art
    # that is not there, so they go.
    for stale in set(manifest) - set(ASSETS):
        del manifest[stale]
    pieces = []
    for name, (still, box, options) in wanted.items():
        piece = cut(name, still, box, options)
        target = os.path.join(args.out, f"{name}.png")
        piece.save(target)
        manifest[name] = {
            "source_still": still,
            "css_box": box,
            "capture_scale": SCALE,
            "pixels": list(piece.size),
            "opaque_cut": bool(options.get("keep_background")),
        }
        pieces.append((name, piece))
        print(f"{name:14s} {piece.size}  <- {still} css{box}")

    with open(manifest_path, "w") as handle:
        json.dump(manifest, handle, indent=1, sort_keys=True)
    missing = sorted(set(ASSETS) - set(manifest))
    if missing:
        print(f"manifest has no provenance for: {', '.join(missing)}")

    if args.contact:
        pad = 12
        width = sum(p.size[0] for _, p in pieces) + pad * (len(pieces) + 1)
        height = max(p.size[1] for _, p in pieces) + pad * 2
        sheet = Image.new("RGBA", (width, height), (28, 32, 38, 255))
        x = pad
        for _, piece in pieces:
            sheet.alpha_composite(piece, (x, pad))
            x += piece.size[0] + pad
        sheet.convert("RGB").save(args.contact)
        print("contact ->", args.contact)
    return 0


if __name__ == "__main__":
    sys.exit(main())
