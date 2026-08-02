# Battle animation parity fixtures

The corpus `tests/specs/animation/` runs against.
Every board here was played through the real Super Auto Pets client and recorded frame by frame, so these files are ground truth about the game rather than a guess about our own engine.

| path | what it is |
| --- | --- |
| `cases/f*.json` | 16 board specs: the two teams, the turn, the toys and the perks that make up one recorded battle. `covers` names the behaviours that battle was chosen to exercise. |
| `goldens/f*.json` | the structured `AnimationEvent[]` stream each case is expected to produce, normalised for the orderings the real game leaves free. |
| `sim-config.js` | translates a case spec into a `SimulationConfig`. Plain CommonJS because the specs `require` it at run time. |

Case pet arrays are written front-to-back: index 0 is the pet that attacks first, which is the same convention `PetConfig[]` uses, so nothing is reordered on the way in.

## Regenerating the goldens

A golden changes only when the engine's event stream is meant to change.
Regenerate deliberately, then read the whole diff:

```bash
UPDATE_ANIMATION_GOLDENS=1 npx vitest run --config config/vitest.config.ts tests/specs/animation
```

A diff that was not the point of the change is a regression, not a new baseline.

## Adding a case

A new case is only worth adding if the behaviour it covers was observed in the real client, otherwise it pins our own engine to itself.
Add `cases/<id>.json`, run the regeneration above to write `goldens/<id>.json`, and check the produced stream against the recording before committing it.
