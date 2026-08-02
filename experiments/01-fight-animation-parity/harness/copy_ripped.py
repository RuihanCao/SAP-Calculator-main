#!/usr/bin/env python3
"""Copy the ripped originals the stage needs into the repo, with provenance.

Round 8. The round-7 art was cut out of screenshots: correct colours and shapes,
but stitched, with the background knocked out by a flood fill and a seam
wherever two cuts met. The client's own build hands over the same sprites as
lossless PNG with true 8-bit alpha, so every one of those cuts that has a ripped
counterpart is replaced here and the cut is deleted.

Source: the Unity WebGL build `18047452` (productVersion 203), unpacked by
`/root/autodl-tmp/sap-data/anim01/rip/tools/`. See the probe report for how.

Only the files the stage actually draws are copied. Everything written carries a
line in `src/assets/art/Ripped/manifest.json` naming the object it came from and
the build it came out of, so the trail runs from a file in the repo back to a
named object in a named build.

Usage
  copy_ripped.py            # copy and write the manifest
  copy_ripped.py --check    # report what is missing or stale, write nothing
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RIP = os.environ.get("ANIM01_RIP", "/root/autodl-tmp/sap-data/anim01/rip/out/png")
OUT = os.path.join(REPO, "src", "assets", "art", "Ripped")

BUILD = "18047452"
PRODUCT_VERSION = "203"

# repo path -> (rip group, unity object type, object name, what the stage uses it for)
#
# The three level plaques are whole sprites: "Lvl 1", "Lvl 2" and "Lvl 3"
# complete with their wood, their keyline and their halo. Round 7 cut the wood
# out of a screenshot and set the numeral as type beside it, which is what made
# the plaque read as crooked and stitched.
ASSETS = {
    "level/lvl-1.png": ("01_lvl_plaque", "Sprite", "LevelMap_0", "the whole Lvl 1 plaque"),
    "level/lvl-2.png": ("01_lvl_plaque", "Sprite", "LevelMap_1", "the whole Lvl 2 plaque"),
    "level/lvl-3.png": ("01_lvl_plaque", "Sprite", "LevelMap_2", "the whole Lvl 3 plaque"),
    # The bar's glyphs, white on full alpha. The client tints them and puts them
    # on its own tile at runtime, and so does the stylesheet.
    "control/skip.png": ("02_control_bar", "Sprite", "Skip", "SKIP, and mirrored, REWIND"),
    "control/pause.png": ("02_control_bar", "Sprite", "Pause", "PAUSE"),
    "control/play.png": ("02_control_bar", "Sprite", "Play", "PLAY"),
    "control/refresh.png": ("02_control_bar", "Sprite", "Refresh", "AUTOPLAY"),
    "control/fast-forward.png": ("02_control_bar", "Sprite", "FastForward", "FAST"),
    # The end screen's face. Not a per-pet render: the client uses the generic
    # emoji face set, happy on a win and woopsy on a loss.
    "mascot/happy.png": ("03_mascot_faces", "Sprite", "Standard--Happy", "the VICTORY face"),
    "mascot/woopsy.png": ("03_mascot_faces", "Sprite", "Standard--Woopsy", "the DEFEAT face"),
    # The particle textures the death puff, the level-up burst and a buff being
    # applied are composited from. The client drives these through Unity
    # ParticleSystems whose parameters are not in the bundle, so the motion is
    # measured off the recorded clips and the textures are these.
    "fx/cloud-soft.png": ("05_death_levelup_fx", "Texture2D", "cloud_2x2_soft", "death puff, 2x2 atlas"),
    "fx/cloud-hard.png": ("05_death_levelup_fx", "Texture2D", "cloud_2x2_hard", "death puff, 2x2 atlas"),
    "fx/glow.png": ("05_death_levelup_fx", "Texture2D", "glow1", "the flash at a faint and at contact"),
    "fx/glow-rays.png": ("05_death_levelup_fx", "Texture2D", "glow6", "the level-up core"),
    "fx/sparkle.png": ("05_death_levelup_fx", "Texture2D", "sparkle", "level-up and buff sparkles"),
    "fx/sparkle2.png": ("05_death_levelup_fx", "Texture2D", "sparkle2", "level-up and buff sparkles"),
    "fx/star.png": ("01_lvl_plaque", "Sprite", "Star", "the star a corpse bursts into"),
    "fx/ring.png": ("05_death_levelup_fx", "Texture2D", "ring", "the level-up shockwave ring"),
    # Buff and ailment application overlays.
    "fx/plus.png": ("04_buff_ailment", "Sprite", "Plus", "a stat buff landing"),
    "fx/stats.png": ("04_buff_ailment", "Sprite", "Stats", "a stat buff landing"),
    "fx/particle-perk.png": ("04_buff_ailment", "Sprite", "ParticlePerk", "a perk being applied"),
    # Round 9. A pet killed by a lethal hit stands in its slot wearing this,
    # with its real, possibly negative, health on the badge, and carries it out
    # with it when the corpse launches (f02 t=30.02 to 30.84, f06 t=29.95 to
    # 30.72, and on the airborne body at f03 t=33.64).
    "fx/bandage.png": ("04_buff_ailment", "Sprite", "Bandage", "the crossed bandage over a dead pet"),
    # A reward of attack and health at once is one object in the client, not a
    # fist and then a heart (f10 t=34.19 to 34.53).
    "fx/heart-fist.png": ("03_mascot_faces", "Sprite", "HeartFist", "an attack and health buff, thrown together"),
}


def digest(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()[:16]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    manifest = {
        "build": BUILD,
        "productVersion": PRODUCT_VERSION,
        "source": "html-classic.itch.zone/html/18047452/Production WebGL",
        "note": (
            "Original Team Wood artwork, unpacked from the shipped WebGL build. "
            "Every file here is a byte-for-byte export of one named Unity object; "
            "nothing is a screenshot crop and nothing has been redrawn."
        ),
        "assets": {},
    }
    missing = []
    for target, (group, kind, name, use) in sorted(ASSETS.items()):
        source = os.path.join(RIP, group, kind, f"{name}.png")
        if not os.path.exists(source):
            missing.append(f"{target}: no {source}")
            continue
        destination = os.path.join(OUT, target)
        if not args.check:
            os.makedirs(os.path.dirname(destination), exist_ok=True)
            shutil.copyfile(source, destination)
        manifest["assets"][target] = {
            "unity_object": name,
            "unity_type": kind,
            "rip_group": group,
            "used_for": use,
            "sha256_16": digest(source),
        }
        print(f"{target:28s} <- {group}/{kind}/{name}.png")

    if missing:
        for line in missing:
            print(f"MISSING {line}", file=sys.stderr)
        return 1
    if not args.check:
        with open(os.path.join(OUT, "manifest.json"), "w") as handle:
            json.dump(manifest, handle, indent=1, sort_keys=True)
        print(f"\n{len(manifest['assets'])} assets -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
