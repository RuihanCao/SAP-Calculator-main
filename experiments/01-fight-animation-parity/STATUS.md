# STATUS — exp01 fight-animation-parity
Updated: 2026-08-02 (round 9)

## Current
- **Round 9 (death sequence, snipe, trail, buff):** the bandage stage exists, a body that nothing threw now fades in its slot instead of flying, the snipe throws the client's own rock over the measured arc for the measured 410 ms, the trail is the reference's thickness, and a buff throws one `HeartFist` and lands in a flash with the client's own chips. Branch `feature/anim01-w8-ripped-assets`. Evidence: 1:1 strips built by the new `harness/pair_strip.py`, both sides captured at 960x600 so neither is resampled. Animation suite 324/324, functional gate 3/3, eslint clean.
- **Round 8 (ripped originals):** every screenshot cut that had a counterpart in the client's own build was replaced by the original sprite. Provenance in `EXTRACTION.md` and `art/Ripped/manifest.json`.
- **Round 7 (asset extraction):** every hand-drawn SVG/CSS element replaced by real game art; ailment icon bug found and fixed.
- **Rounds 4-6:** pixel-standard pass; event axis 16/16, visual axis aligned; residuals in RESULTS.md.
- **Running:** ng serve :4202 (work) and :4200 (preview) on the box; harness driver daemon up; no batch runs, no monitors.
- **Next:** the round 9 residuals below, then Ruihan's calls.
- **Waiting on Ruihan:** chrome scope (the "Replaying..." pill, the hamburger, the ability card's border and font, which the round 9 critic named on three sheets and which nobody has decided to reproduce); end-screen UI timing; PR merge order; legacy renderer retirement.

## Round 9 residuals, measured
1. The blind critic still names the real client on all five sheets, so the whole-frame blind gate is not passed. It is now doing it off the ability card's styling, the missing "Replaying..." pill and a whole-board vertical offset of 15-19px rather than off the effects.
2. The board sits 15-19px high of the reference inside the same crop, on every sheet, at the same scale. `GROUND_Y` is worth one more measurement.
3. A lethal ranged hit throws white shards in the reference (f02 t=30.02 to 30.44) and ours throws none. Round 8 measured them and nothing draws them for a ranged impact.
4. The reference washes the whole right of the frame gold at a corpse's star spray (f02 t=32.13); ours does not light the background at all.
5. The attack stat badge and the attack half of a buff chip use `Icons/fist.png`, a fist; the client's is the grey damage token. Same sprite question as `damage-rock.png`.
6. The green ability ring is about twice the reference's weight on the acting pet.

## History
- 2026-08-02: round 9, death bandage stage / snipe throw / trail / buff, this file.
- 2026-08-02: round 8, ripped originals replace the screenshot crops.
- 2026-08-01: rounds 4-6 pixel pass, delivery v2, game-replication skill written.
- 2026-07-31: W0-W3 done, event axis 16/16 (2-13-16), RESULTS.md created.
- 2026-07-31: plan approved, experiment created.
