# exp01 RESULTS: fight animation parity (2026-07-31)

## Verdict

All 16 fixtures PASS event-sequence parity against the real client, confirmed by a fresh-context critic on round-3 footage plus live re-recordings.
Trajectory across the W3 loop: 2/16 (round 1) -> 13/16 (round 2) -> 16/16 (round 3).
FAST mode, intro, victory and defeat outros, and the control bar (REWIND working step-back, SKIP abandon semantics, AUTOPLAY toggle) confirmed against the checklist.

## What was built (PR chain, merge bottom-up)

PR #1 (W0): injection+recording harness, 16 deterministic fixtures, CHECKLIST.md grammar with per-class citations, COVERAGE.md over the 17 event classes.
PR #2 (W1): structured AnimationEvent stream from the engine (16-type union, plain data through the worker), golden event tests, 9 codex review findings all confirmed and fixed with mutation-checked regression specs.
PR #3 (W2+W3): event-driven renderer (director/timeline/sampler/playback, banner cards, payload-icon projectiles, merge-while-visible popups, corpse groups with FLIP push-forward, staged summons, two-stage transform, jump and move arcs, trumpet counter, FAST second grammar, intro/outro, full control bar), plus the three W3 fix rounds.
The old prose-parsing renderer stays reachable via ?legacyAnimation=1 until Ruihan retires it.

## Evidence qualifiers (honest state)

f04, f05, f09 and fast-f01/fast-f05 footage is round-2 vintage: record_calc.py has a DOM fragility (stage reparent kills the .anim-clock read) that blocks re-recording those on the VPS; the animation itself plays fully (verified live).
Fix the recorder before trusting any future re-record.
Pacing runs +7.3 percent long on the bar-window yardstick (worst fixture +16.2 on a round-2 clip); FAST ratio 2.46 vs real 2.54 on round-3 clips.
The checklist sets no numeric pacing gate and all qualitative timing rules hold.
Six tests/generated/equipment specs fail identically on master; out of scope.

## Residual style gaps (recorded for a possible polish pass, none affects verdicts)

f11 contact z-order inverted (attacker hides target pills; real hides the attacker's).
Level-up burst is a plaque ring, not a full-pet radial burst; xp bars appear at impact not event start.
Trumpet counter never occluded by the banner (real lets the banner cover part of it).
Corpses/projectiles can overdraw the control bar; damage numerals thinner than the real black-outlined digits.
SKIP ends in our outro (real replay path wipes to the shop; ours is a documented tool deviation, same for playable REWIND).
No background art, team name plates, or Replaying chrome.
Bar lingers ~0.15 s into the SKIP jump frame.

## Where to look

Side-by-side verdict artifact: see STATUS.md link.
Live: ng serve on the box :4200 (tunnel), real-game clips /root/autodl-tmp/sap-data/anim01/, calculator clips .../anim01/calc/ and /var/tmp/anim01w2/calc/webm.
