# exp01 W0b: event-class footage coverage

One row per event class in the vocabulary of the current animation implementation.
The vocabulary is the `applyLogMutation` switch in `src/app/ui/shell/simulation/fight-animation/mutations.ts` plus the `Log['type']` union in `src/app/domain/interfaces/log.interface.ts`.
Every row says which reference clip shows that class in the real game, at which timestamp.

Timestamps are `t=` seconds into the named clip, the same labels the filmstrips carry.
Clips: `<scratchpad>/anim01/out/<clip>.webm` and `<clip>_filmstrip.jpg`, frames on the box under `/root/autodl-tmp/sap-data/anim01/clips/<clip>/`.
Close-up strips referenced here are `<scratchpad>/anim01/out/z_*.jpg`.

## Coverage table

| # | event class | implementation site | W0 footage | newly recorded in W0b | checklist section |
| --- | --- | --- | --- | --- | --- |
| 1 | attack, melee clash | `applyAttackMutation` | f01 t=29.84 | | 1, 2 |
| 2 | attack, jump attack | `ATTACK_REGEX` `(?:jump-)?attacks` | none | f11 t=29.50 to t=31.12, `z_f11_jump.jpg` | 14 |
| 3 | attack, ranged or snipe | `applyRangedDamageMutation`, `isSnipe` | f02 t=29.55 to t=29.87, f06 t=29.58 to t=29.88 | | 5 |
| 4 | death | `applyDeathMutation` | f01 t=30.01 to t=30.56 | | 3 |
| 5 | push forward after death | `pushSideForward` via `shifts` | f01 t=30.43, f07 t=32.56 to t=32.91 | | 4 |
| 6 | summon | `applySummonMutation` | f04 t=30.53 to t=31.02 | | 7 |
| 7 | transform | `applyTransformMutation` | f05 t=29.40 to t=30.41 | | 8 |
| 8 | stat change, attack | `applyStatMutation`, popup type `attack` | f10 t=33.04 grey `+3` pill | f10 t=34.32 the attack glyph leaves the banner, `z_f10_health.jpg` | 2, 15 |
| 9 | stat change, health | `applyStatMutation`, popup type `health` | f09 t=31.20 red heart | f10 t=34.51 heart leaves the banner, t=34.72 `+3` red pill next to the `+3` grey pill | 2, 15 |
| 10 | stat change, xp | `applyStatMutation`, popup type `exp` | none | f14 t=29.23 to t=30.45, `z_f14_xp.jpg` | 14 |
| 11 | stat change, mana | `applyStatMutation`, popup type `mana` | none | f13 t=29.31 to t=30.45, `z_f13_mana.jpg` | 14 |
| 12 | equipment, worn and consumed | `applyEquipmentMutation`, action `removed` | f08 t=28.61 icon, t=30.14 melon shatters | | 10 |
| 13 | equipment, gained mid battle | `applyEquipmentMutation`, action `added` | f10, expected sequence only | f10 t=36.85 banner, t=37.32 coconut leaves the banner, t=37.40 icon on the pet, `z_f10_coconut.jpg` | 10, 15 |
| 14 | trumpets | `applyTrumpetMutation`, popup type `trumpets` | none | f12 t=30.05 to t=33.02, `z_f12_trumpets.jpg`, `z_f12_counter.jpg` | 14 |
| 15 | move, reposition | `log.type === 'move'` branch, `shifts` | f09 t=30.08 | | 9 |
| 16 | toy | `applyToyMutation` | f09 t=29.04 | | 9 |
| 17 | board and phase | `log.type === 'board'`, board frames | intro lineup only | outro-defeat t=37.58 to t=43.05, `z_intro_full.jpg` | 18 |

## Fixtures added in W0b

| fixture | pack | emitter | what it produces | fork sim determinism |
| --- | --- | --- | --- | --- |
| f11-jump-african-wild-dog | Danger | African Wild Dog, tier 1, start of battle | `African Wild Dog jump-attacks Otter for 3.` | deterministic |
| f12-trumpets-groundhog | Golden | Groundhog, tier 1, faint | `Groundhog gained 1 trumpets. (1)`, log type `trumpets` | deterministic |
| f13-mana-alchemedes | Unicorn | Alchemedes, tier 1 at level 3, start of battle | `Alchemedes gave Pig 3 mana.` | deterministic |
| f14-xp-pug | Star | Pug, tier 3 at level 2, start of battle | `Pug gave Pig 2 exp.` then `Pig leveled up to level 2.` | deterministic |

Each was checked the same three ways as the W0 fixtures by `harness/sim_notes.js`, and all three checks are clean on all four.
Each board was read off the screen before the first clash and matches its payload.
f11: African Wild Dog 3/9 and Pig 3/14 against Cow 3/10, Otter 2/6, Worm 1/9, and the jump takes the Otter from 2/6 to 2/3 while the dog goes 3/9 to 3/7, which is exactly the fork sim's `jump-attacks Otter for 3` plus `Otter attacks African Wild Dog for 2`.
f13: Alchemedes is level 3 on screen and the gift is 3 mana, matching the level 3 ability text the game itself prints in the banner.
f14: the Pig is level 1 at 4/14 before the event and level 2 at 6/16 after it, matching the fork sim's post-level-up board.

Two fixture design notes worth keeping.
f12 carries three friends rather than two because the Golden pack spawns a last-stand Golden Retriever as soon as the player is down to one pet with trumpets in hand, which would have turned the trumpets fixture into a summon fixture.
f14 uses a level 2 Pug rather than a level 1 Pug so the gift is 2 experience, which is exactly a level up, because that is the only way an xp change is legible on screen.

## Not witnessed

Every event class in the table above was witnessed in the real game.
The three entries below are sub-cases of witnessed classes that no fixture reaches, kept here so they are not silently dropped.

| sub-case | implementation site | emitters | why it was not recorded |
| --- | --- | --- | --- |
| trumpets spent | `spendTrumpets`, log type `trumpets` | Pied Tamarin, Squid, Surgeon Fish, Nurse Shark, Wildebeest (Golden), Desert Rain Frog, Jewel Caterpillar, Blue Footed Booby, Giant Isopod, Maltese (Custom) | every spender needs trumpets already banked when the battle starts, which the payload builder cannot set today, so a spend cannot be reached from a fresh board |
| log type `equipment` | equipment classes that log with `type: 'equipment'` | White Truffle, Cocoa Bean, Cod Roe, Geechee Red Pea, Gros Michel Banana, Sudduth Tomato (Danger), Chocolate Cake, Eggplant, Onion, Pita Bread (Golden), Pancakes (Puppy), the five ailments | the two equipment events that were recorded, the melon break in f08 and the coconut gain in f10, are both logged by the engine as `attack` and `ability`, so the `equipment` branch of the switch is real but unexercised by the fixture set |
| log type `move` | the `log.type === 'move'` branch | none | no ability anywhere in the fork emits a `move` log; the one real reposition, f09's Pogo Stick push, is logged as an `ability`, so the branch is dead code that the W1 event stream should replace rather than feed |

## Coverage of the modes, not just the classes

Every class above was recorded at the game's normal speed.
Ten of the fixtures were additionally recorded with FAST engaged, because FAST changes what is drawn and not only how fast: see CHECKLIST section 16.
The fast clips are `fast-<fixture>` and cover clash, death, push forward, snipe, summon, transform, toy, move, stat change, equipment, jump attack, trumpets, mana and xp.
