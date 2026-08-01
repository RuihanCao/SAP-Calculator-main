# Extracted art: what came from where

Every visual element the battle animation draws is game art.
The rule it follows is the game-replication skill's rule 4: official asset pack first, a crop of a reference frame second, and never a hand-drawn approximation.

Regenerate everything under `src/assets/art/Extracted/` with:

```bash
ANIM01_SCALE=3 experiments/01-fight-animation-parity/harness/driver.py   # the real client
experiments/01-fight-animation-parity/harness/capture_refs.py f11-jump-african-wild-dog --seconds 46
experiments/01-fight-animation-parity/harness/extract_assets.py
```

## From the official asset pack

These are the client's own text-map sprites, the same ones it prints inside ability text.
No processing at all: the stylesheet points at the file in place.

| element | file |
| --- | --- |
| attack badge, attack payload glyph | `art/Public/Public/Icons/TextMap-resources.assets-31-split/fist.png` |
| health badge, heart payload | `.../heart.png` |
| mana badge, mana payload | `.../mana.png` |
| experience payload, corpse burst star | `.../xp.png` |
| perk payload | `.../perk.png` |
| trumpet counter and tokens | `.../trumpet.png` |
| the toast's gold level disc | `.../gold.png` |
| pets, food, ailments, toys, background, mascot | the pack's own directories, as before |

## Cropped from the real client

Cut by `harness/extract_assets.py` from 3x CDP captures taken by `harness/capture_refs.py`.
The captures are at `/root/autodl-tmp/sap-data/anim01/w3b/ref/`, outside git; the boxes below are in CSS pixels of the 1280x800 viewport the client was driven at, and are also written to `src/assets/art/Extracted/manifest.json` next to the art.

| asset | source still | fixture | box (css) |
| --- | --- | --- | --- |
| `level-plaque.png` | `f11-jump-african-wild-dog/r_003_0003000.png` | f11, t=3.00 s | 494, 376, 45.5, 40 |
| `glyph-rewind.png` | same still | f11, t=3.00 s | 462, 66, 46, 36 |
| `glyph-pause.png` | same still | f11, t=3.00 s | 539, 66, 46, 36 |
| `glyph-autoplay.png` | same still | f11, t=3.00 s | 617, 66, 46, 36 |
| `glyph-fast.png` | same still | f11, t=3.00 s | 695, 66, 46, 36 |
| `glyph-skip.png` | same still | f11, t=3.00 s | 772, 66, 46, 36 |
| `glyph-play.png` | same still | f11, t=3.00 s | 772, 66, 30, 36 |
| `plate-name.png` | `f11-jump-african-wild-dog/r_001_0001000.png` | f11, t=1.00 s | 176, 255, 176, 74 |
| `plate-vs.png` | same still | f11, t=1.00 s | 594, 247, 92, 90 |
| `cloud.png` | `f11b/r_009_0006550.png` | f11 dense pass, t=6.55 s | 893, 306, 170, 122 |
| `outro-face.png` | `outro/r_030_0022455.png` | outro-victory, t=22.46 s | 498, 192, 284, 284 |

Notes on the cuts that are not a plain rectangle:

- The bar glyphs are keyed rather than cropped: the tile they sit on is a flat translucent rectangle the stylesheet redraws, so what is kept is the white printing, lifted by how far each pixel travels from the tile's own colour (measured `rgb(77 150 173)` over the client's sky) towards white. A control the client draws disengaged prints grey, so the alpha is normalised on its strongest tenth; the stylesheet puts the dimming back.
- `glyph-play.png` is the SKIP triangle with the stop bar cropped off. A capture of a running replay never shows the bar in its paused state, so this is the client's own triangle rather than a redrawn one.
- `plate-name.png` is a nine-slice frame and its middle is blanked to white. Left alone, the `fill` keyword stretched the reference team's own name across every card the stage draws.
- `level-plaque.png` is cut by palette, not by a border walk: the box has to stop at the numeral's left edge, which leaves no margin for a flood to start from, and the plaque carries no green while the bush band behind it is nothing but green. What it carries is the whole widget except the numeral, cap and "Lvl" included, because only the numeral changes.

## Still drawn, and why

- The white rounded rectangle a pair of stat badges stands on. It is a bare white rounded rectangle in the client too, with no keyline of its own.
- The replay tile: a flat translucent rectangle, reproduced from its measured fill and corner rather than baked with a rectangle of the client's sky inside it.
- Type. The client sets "Lvl", the control labels, the team names, the tally and every numeral as text, and the calculator already ships the client's own face (`Lapsus Pro`).
- Glows and blooms (the contact flash, the impact puff, the level-up burst). These are additive light in the client, not sprites.

## Known gap

The end screen's face has only been captured on a win.
A loss and a draw keep the caption alone rather than wearing a face invented for them; the missing capture is one `capture_refs.py --pausestep` run on the `outro-defeat` payload and is in `task.md`.
