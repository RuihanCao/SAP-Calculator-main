# STATUS

## Current

W0b done on feature/anim01-w0-ground-truth: event-class coverage closed, speed mode and replay controls recorded, battle intro and both end screens recorded.
COVERAGE.md has one row per event class in the current implementation's vocabulary; CHECKLIST.md gained sections 14 to 18.
Awaiting Ruihan's approval of clips plus checklist plus W1/W2 fine specs.

## History

2026-07-31 W0b: four fixtures added for the classes with no footage (jump attack f11, trumpets f12, mana f13, xp f14), all deterministic and board-verified.
2026-07-31 W0b: FAST measured at about 2.5x over ten fixtures recorded both ways, and found to be a second grammar rather than a rate change: the trigger banner is suppressed and replaced by an icon over the source pet, and per-target staging collapses.
2026-07-31 W0b: PAUSE, SKIP and REWIND documented; REWIND leaves an injected replay permanently stalled with a live-looking but inert control bar.
2026-07-31 W0b: victory and defeat screens reached by clearing WatchedOn on the payload; the replay path has no end screen at all.
2026-07-31 W0 ground truth recorded: real client animating injected battles via page.route on /api/battle/get, 10 fixtures, no divergence from the fork sim found.
2026-07-31 plan approved by Ruihan, experiment created.
