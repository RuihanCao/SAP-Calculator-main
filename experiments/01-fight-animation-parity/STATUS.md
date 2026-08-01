# STATUS

## Current

W3 round 6 applied on feature/anim01-w2-director: the critic re-read round 5 and named three misses, two of which the reference frames confirm and one of which they overrule.
Confirmed and fixed: a contact frame now paints both combatants out in flat white along their own silhouettes instead of only floating a soft glow between them, which takes the near-white share of the contact band from 11.0% to 48.5% against the reference's 47.5% (clips/f01-plain-trades/f_00882_0031156.jpg); and the end screen's veil now comes down over 1.0 s with a squared ease-out rather than 0.7 s in a straight line, measured 90% to 10% at 0.618 s against the reference's 0.633 s, where round 5 measured 0.568 s.
Overruled: the critic asked for a jump attacker to reach directly over its target, reporting round 5 peaking at midfield, 0.52 of the width and 0.8 of a lane pitch. Tracked by its own green outline, round 5 already hangs the dog at 0.665 of the width over an otter whose slot is 0.658, which is 2.36 lane pitches from home against the reference's 2.13, and 0.52 is where the reference is too while it is still climbing (f_00849_0029941 puts it at 0.525). What the same frames do show is the arc's height: the reference rises 0.349 of the play area and round 5 rose 0.252, because round 5 had only the contact frame and took it for half the arc. Round 6 reads the apex frame instead, so a jump rises 1.34 of a move's arc and hits from 0.515 of one, and the recording now rises 0.346.
W3 round 6 evidence: recordings, filmstrips and clips under `/root/autodl-tmp/sap-data/anim01/calc-r6/`, measured against `clips/` with the three probes kept beside them (`m_contact.py` the contact band, `m_jump.py` the green-outline tracker, `m_fade.py` the veil).
W3 round 6 also de-flaked `tests/specs/simulation/abomination-darwin-priority-repro.test.ts`, which failed one full-suite run in three on `jumpIdx > -1` rather than on the ordering it exists to check; it now takes battles until one contains the jump.
W3 round 6 does not touch the end screen's caption and buttons, which arrive at 0.9 s while the veil is still falling; that is Ruihan's tool-side choice and is flagged rather than changed.

W3 round 5 applied on feature/anim01-w2-director: the pixel critic read round 4 against the reference frames and called seventeen things, and all seventeen are in, headed by REWIND restarting the animation from the entrance instead of freezing the stage, a 16:9 play area inside black bars so nothing drifts with the window, pets and slot pitch measured against the lane, stat badges rebuilt as a numeral inside a rock and inside a heart, a fainting pet that whites out and launches instead of taking a red cross, the other player's avatar standing at the field's right, and an end screen veil fitted per band.
W3 round 5 also fixed four things the reference frames showed while checking those: the field sheet was drawn 123.8% of the play area where the lane says 135.9%, the corpse trail's clouds were being clipped into rectangles, the damage numerals' text stroke was eating their own fill, and f11's toast drew two attack rocks because the parser read the verb as the stat.
W3 round 5 deviates from the critic on one item, with the frame as the reason: it asked for a corpse in flight to drop its stat pills and its level plaque and to hide a negative health, and the reference launches the whole card with the health badge reading -5 (f01 t=32.01, clips/f01-plain-trades/f_00905_0032006.jpg), so the card is kept.
W3 round 5 evidence: filmstrips and probes under `/root/autodl-tmp/sap-data/anim01/calc-r5/`, including a REWIND probe that hashes a ladder of frames after each press, 8 of 8 distinct on the bar and on the end screen with the outro reached a second time.

W3 round 4 applied on feature/anim01-w2-director: Ruihan rejected four things after using the live app, and all four are in, the field is the game's own `FieldBattle` art with a random field option beside the button, both boards face each other the way the reference frames have them, one press opens a fullscreen animation that plays itself from the entrance, and the end screen is the outcome with REWIND and EXIT and no shop-run score.
W3 round 4 also fixed two things the reference frames showed while checking those four: the entrance shutter closed out of the middle instead of squeezing the scene into a band from the edges, and the end screen kept 32% of the field's light where the real one keeps 23%.

W3 round 3 applied on feature/anim01-w2-director: the critic scored round 2 at 13/16, and all sixteen fixes it asked for are in, headed by the level-up reaching the pet's own stat pills, damage numerals riding with the pet rather than with its slot, and REWIND becoming a real step back.

W3 round 2 applied on feature/anim01-w2-director: the parity critic scored round 1 at 2/16, and the seventeen fixes it asked for are in, headed by an outcome driven clash cadence that makes the per-hit popup merge actually fire.

W2 done on feature/anim01-w2-director, based on the W1 branch: the fight animation is rebuilt as a consumer of `Battle.events`.
A director walks the stream once and writes a cue timeline with the checklist's own beats and overlaps, a pure sampler turns that timeline plus one millisecond into the frame on screen, and the stage component only places what the frame says.
The prose parsing renderer stays reachable behind `?legacyAnimation=1` and a Legacy view button until W3 signs the new one off.
Calculator-side clips for all 16 fixtures are recorded with `harness/record_calc.py`, which is W3's input.

W1 done on feature/anim01-w1-event-stream: the engine now emits a structured `AnimationEvent[]` alongside the logs, with golden streams for all 16 fixtures.
The codex review of that stream reported nine findings, all nine reproduced and all nine fixed on the same branch.

W0c done on feature/anim01-w0-ground-truth: the last three COVERAGE.md gaps are closed.
Trumpet spend and a pet-driven reposition are now recorded as f15 and f16, the `equipment` log type is marked covered by equivalence from the f08 and f10 footage, and CHECKLIST.md gained section 19.
Awaiting Ruihan approval of clips plus checklist plus W1/W2 fine specs.

## History

2026-07-31 W3 round 3: the three verdict fixes are the level-up carrying its own stats onto the board (`levelAttack`/`levelHealth` on the exp event, f14's Pig reads Lvl2 6/16 in the gold burst), a popup anchored to the pet's on-screen place rather than to its slot (f11's jump lands `3` and `2` side by side at the Otter's slot), and a popup lifetime that no longer follows the speed factor plus a shattered perk that no longer gates the next clash (f10's last pair merges to `2` and `14`, normal and FAST).
2026-07-31 W3 round 3: REWIND now steps back exactly one board state per press and stops there, PLAY resumes; SKIP plays out only the beat in flight and then jumps to the final board instead of fast forwarding through the clashes it is abandoning.
2026-07-31 W3 round 3: `harness/record_calc_controls.py` is the calculator side mirror of `controls_probe.py`, so a control press is recorded as frames plus an in-page clock trace.

2026-07-31 W3 round 2: the clash cadence became outcome driven, 0.62 s from trade to trade and about 1.32 s when a pet died, which is what puts the second hit inside the first popup's life and makes the merge visible (f01 reads 6/4 then 12/8), plus sixteen further fixes from the critic's list.

2026-07-31 W2: one timeline, no delay table. Cue durations are the beats, the clash cadence is a floor the next clash may not contact before, so a faint plus its slide fits inside it instead of adding to it, and the x2 fudge is gone.
2026-07-31 W2: the board is rebuilt from the stream by applying each event's own delta rather than by trusting a pet ref's stats, because the two halves of one clash disagree about the pet being hit twice in that beat.
2026-07-31 W2: 58 director specs over the 16 golden streams, including the per-hit popup merge, the corpse group hold, the FLIP slide inside the corpse flight and the FAST collapse; the four recorded end-of-battle boards are asserted against the reconstruction.
2026-07-31 W2: FAST is built as a second timeline rather than a rate, and comes out at 2.4x over the ten fixtures the reference clips measured at 2.54x.
2026-07-31 W2: REWIND steps back one board state and stays playable, which is deliberately not the real client's stall.
2026-07-31 W1 review: nine codex findings, each reproduced with a headless `--dump-events` probe before it was touched, each fixed with a regression case in `tests/specs/animation/animation-event-review-fixes.test.ts`.
2026-07-31 W1 review: the two structural ones were a projectile that was flushed before the effect it delivers, so f09 buffed the Worm before moving it, and a clash merge that gave up whenever a perk landed damage inside the same window.
2026-07-31 W1 review: the deepest one is that hundreds of abilities write `pet.health` or `pet.attack` straight rather than through the increase helpers, so the recorder now settles pet stats against what the stream already said, at activation and clash boundaries, and draws whatever is left over.
2026-07-31 W1 review: only f09, f10 and f15 goldens moved, all three by staging order plus Gorilla's perk note, and `check_fixtures.sh` parity is unchanged.
2026-07-31 W1: 16 event classes emitted from the engine, not parsed from prose, with the banner opened once in `Ability.execute` so no catalog class was touched.
2026-07-31 W1: goldens under `harness/expected/events/`, compared order-insensitively inside simultaneous groups, which exposed one more order-only ambiguity than the logs did (f04's two summon reactions, hidden by log collapse).
2026-07-31 W1: behaviour unchanged, `check_fixtures.sh` reproduces all 16 committed expected logs byte for byte apart from f07's documented faint order.
2026-07-31 W0c: f15 banks trumpets with a Nyala faint and spends them with a Nurse Shark faint in the same battle, which is how the spend was reached without a starting trumpet count.
2026-07-31 W0c: the spend is the gain mirrored, counter to pet instead of banner to counter, with a yellow flash instead of green, and the effect it pays for is an ordinary snipe.
2026-07-31 W0c: f16 confirms the reposition arc-over grammar is the same for a pet source as for f09 toy source, with a one space push reading as an exchange rather than a segment rotation.
2026-07-31 W0c: correction to the W0 checklist, a clash damage numeral is the running total for that pairing and not the damage of that clash, found in f16 and confirmed in f01 and f12.
2026-07-31 W0b: four fixtures added for the classes with no footage (jump attack f11, trumpets f12, mana f13, xp f14), all deterministic and board-verified.
2026-07-31 W0b: FAST measured at about 2.5x over ten fixtures recorded both ways, and found to be a second grammar rather than a rate change: the trigger banner is suppressed and replaced by an icon over the source pet, and per-target staging collapses.
2026-07-31 W0b: PAUSE, SKIP and REWIND documented; REWIND leaves an injected replay permanently stalled with a live-looking but inert control bar.
2026-07-31 W0b: victory and defeat screens reached by clearing WatchedOn on the payload; the replay path has no end screen at all.
2026-07-31 W0 ground truth recorded: real client animating injected battles via page.route on /api/battle/get, 10 fixtures, no divergence from the fork sim found.
2026-07-31 plan approved by Ruihan, experiment created.
2026-07-31 W3 final: 16/16 PASS confirmed; RESULTS.md created; decision gate with Ruihan (merge order, style polish, shop line next).
