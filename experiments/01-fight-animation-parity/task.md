# task.md — exp01 fight-animation-parity (update every handoff)

## Now
- [ ] Re-record all 16 fixtures + the FAST set on the round-7 skin (the recorder itself is fixed; this is the remaining evidence gap) (added 2026-08-01)
- [ ] Capture the end screen's losing face: one `capture_refs.py --pausestep` run on the `outro-defeat` payload, then add it to `OUTRO_FACES`. Until then a loss and a draw carry the caption with no face (added 2026-08-01; context: EXTRACTION.md "Known gap")
- [ ] Ruihan's call on chrome scope, now the top blind-judgement tell: the "Replaying..." pill, the hamburger and the two bottom team strips are in every reference frame and in none of ours (added 2026-08-01; context: round-7 critic)
- [ ] Residual sweep list, ready to run as round 7 if Ruihan approves: Lvl plaque 35 percent short + missing per-side offset; entrance plates 31 percent short + VS plate geometry; attack badge octagon -> irregular rock (also toast icon); corpse card rotation direction; smoke puffs opacity/arc; AUTOPLAY glyph shape; damage red too pink; pets 6 percent narrow; heart badge square; veil 10 percent light; negative-HP flip 180ms early; toast arrow/border; mascot ground shadow (added 2026-08-01; context: delivery artifact red flags)

## Blocked
- [ ] Round 7 execution — waiting on Ruihan's accept-or-sweep call
- [ ] PR #1 -> #2 -> #3 merge + legacy renderer retirement — waiting on Ruihan review
- [ ] Shop-animation line kickoff (play-web, SAP-PPO repo, separate experiment: replay shop segments as ground truth, reuse battle grammar, fix level-up mirror bug + frozen look) — waiting on Ruihan go

## Backlog
- [ ] Sounds (per-pet oggs exist in the pack, out of scope so far)
- [ ] FAST-mode entrance compression (real client appears to compress the intro under FAST; ours does not)
- [ ] Pacing residual: normal mode +7.3 percent on the bar-window yardstick

## Done
- [x] 2026-08-01 round 7 asset extraction -> no hand-drawn element left in the stage, ailment icon bug fixed, recorder fixed, functional gate over ailments/equipment/effects
- [x] 2026-08-01 rounds 4-6 pixel pass -> background/facing/entry/exit aligned, measured
- [x] 2026-07-31 W3 critic loop -> 16/16 event parity
- [x] 2026-07-31 W2 event-driven renderer; W1 event stream + 9/9 codex findings fixed; W0/b/c ground truth + checklist
