#!/usr/bin/env python3
"""Whole-frame side by sides and overlay diffs, real client against ours.

The pass bar for the visual axis is a blind whole-frame judgement, so the pairs
this writes are unlabelled by design: `pair_<n>_A.png` and `pair_<n>_B.png` with
the side recorded only in the key, which the critic does not get.

  side_by_side.py --pairs pairs.json --out /path/to/round

`pairs.json` is a list of {"label", "real", "ours"} with paths relative to the
reference and our own still roots.

The key lands in a sibling `keys/` directory rather than inside the round, so a
critic can be pointed at the round directory without the answer sitting in it.
The randomisation is seeded from entropy unless `--seed` is given, so re-running
a round does not reproduce the previous round's A/B assignment.
"""
import argparse
import json
import os
import random
import secrets
import sys

from PIL import Image, ImageChops

REF = os.environ.get("ANIM01_REF", "/root/autodl-tmp/sap-data/anim01/w3b/ref")
OURS = os.environ.get("ANIM01_OURS", "/root/autodl-tmp/sap-data/anim01/w3b/ours")


def load(path, width):
    with Image.open(path) as im:
        im = im.convert("RGB")
        height = round(im.size[1] * width / im.size[0])
        return im.resize((width, height), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="fix the A/B assignment, for reproducing a particular round",
    )
    args = parser.parse_args()

    with open(args.pairs) as handle:
        pairs = json.load(handle)
    os.makedirs(args.out, exist_ok=True)
    # A sibling of the round, not a member of it: `--out .../rounds/r2` puts the
    # key at `.../rounds/keys/r2.json`, so handing over the round directory
    # hands over the images and nothing else.
    rounds_root = os.path.dirname(os.path.abspath(args.out.rstrip(os.sep)))
    keys_dir = os.path.join(rounds_root, "keys")
    os.makedirs(keys_dir, exist_ok=True)
    key_path = os.path.join(
        keys_dir, f"{os.path.basename(os.path.abspath(args.out.rstrip(os.sep)))}.json"
    )
    seed = args.seed if args.seed is not None else secrets.randbits(64)
    rng = random.Random(seed)
    key = []

    for index, pair in enumerate(pairs):
        real = load(os.path.join(REF, pair["real"]), args.width)
        ours = load(os.path.join(OURS, pair["ours"]), args.width)
        # Which of A and B is the real client is decided per pair and written
        # only into the key, outside the round, so the critic cannot learn it.
        swap = rng.random() < 0.5
        a, b = (ours, real) if swap else (real, ours)
        a.save(os.path.join(args.out, f"pair_{index:02d}_A.png"))
        b.save(os.path.join(args.out, f"pair_{index:02d}_B.png"))

        # Stacked, for reading them together.
        stack = Image.new("RGB", (args.width, a.size[1] + b.size[1] + 6), (18, 20, 24))
        stack.paste(a, (0, 0))
        stack.paste(b, (0, a.size[1] + 6))
        stack.save(os.path.join(args.out, f"pair_{index:02d}_stack.png"))

        # Overlay diff, on the common height.
        height = min(real.size[1], ours.size[1])
        diff = ImageChops.difference(
            real.crop((0, 0, args.width, height)), ours.crop((0, 0, args.width, height))
        )
        diff.point(lambda v: min(255, v * 3)).save(
            os.path.join(args.out, f"pair_{index:02d}_diff.png")
        )

        key.append(
            {
                "pair": index,
                "label": pair.get("label", ""),
                "A": "ours" if swap else "real",
                "B": "real" if swap else "ours",
                "real_still": pair["real"],
                "our_still": pair["ours"],
            }
        )

    with open(key_path, "w") as handle:
        json.dump({"seed": seed, "out": os.path.abspath(args.out), "pairs": key}, handle, indent=1)
    # A key left behind by an older run would still answer the new round.
    legacy = os.path.join(args.out, "key.json")
    if os.path.exists(legacy):
        os.remove(legacy)
    print(f"{len(pairs)} pairs -> {args.out}")
    print(f"key (seed {seed}) -> {key_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
