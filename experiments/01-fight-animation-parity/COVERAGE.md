# exp01 W0b and W0c: event-class footage coverage

One row per event class in the vocabulary of the current animation implementation.
The vocabulary is the `applyLogMutation` switch in `src/app/ui/shell/simulation/fight-animation/mutations.ts` plus the `Log['type']` union in `src/app/domain/interfaces/log.interface.ts`.
Every row says which reference clip shows that class in the real game, at which timestamp.

Timestamps are `t=` seconds into the named clip, the same labels the filmstrips carry.
Clips: `<scratchpad>/anim01/out/<clip>.webm` and `<clip>_filmstrip.jpg`, frames on the box under `/root/autodl-tmp/sap-data/anim01/clips/<clip>/`.
Close-up strips referenced here are `<scratchpad>/anim01/out/z_*.jpg`.

## Coverage table

| # | event class | implementation site | W0 footage | newly recorded in W0b and W0c | checklist section |
| --- | --- | --- | --- | --- | --- |
| 1 | attack, melee clash | `applyAttackMutation` | f01 t=29.84 | W0c: the damage numeral is a running total per engagement, f01 t=31.59 then t=32.19, `z_popup_accumulate.jpg` | 1, 2, 19 |
| 2 | attack, jump attack | `ATTACK_REGEX` `(?:jump-)?attacks` | none | f11 t=29.50 to t=31.12, `z_f11_jump.jpg` | 14 |
| 3 | attack, ranged or snipe | `applyRangedDamageMutation`, `isSnipe` | f02 t=29.55 to t=29.87, f06 t=29.58 to t=29.88 | W0c: a snipe paid for with trumpets uses the same grammar, f15 t=35.09 to t=35.48 | 5, 19 |
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
| 14 | trumpets, gained | `applyTrumpetMutation`, popup type `trumpets` | none | f12 t=30.05 to t=33.02, `z_f12_trumpets.jpg`, `z_f12_counter.jpg`; W0c: f15 t=30.62 to t=31.44, `z_f15_counter_gain.jpg` | 14, 19 |
| 15 | trumpets, spent | `spendTrumpets`, popup type `trumpets` | none | W0c: f15 t=34.14 to t=34.58, `z_f15_spend.jpg`, `z_f15_counter_spend.jpg`, `z_f15_spend_path.jpg` | 19 |
| 16 | move, reposition | `log.type === 'move'` branch, `shifts` | f09 t=30.08 | W0c: f16 t=29.65 to t=30.30, `z_f16_move.jpg`, `z_f16_move_close.jpg` | 9, 19 |
| 17 | toy | `applyToyMutation` | f09 t=29.04 | | 9 |
| 18 | board and phase | `log.type === 'board'`, board frames | intro lineup only | outro-defeat t=37.58 to t=43.05, `z_intro_full.jpg` | 18 |

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

## Fixtures added in W0c

| fixture | pack | emitter | what it produces | fork sim determinism |
| --- | --- | --- | --- | --- |
| f15-trumpet-spend-nyala-nurseshark | Golden | Nyala then Nurse Shark, both tier 5, both faint | `Nyala gained 8 trumpets. (8)`, then `Nurse Shark spent 6 trumpets. (2)` and `Nurse Shark sniped Cow for 18.` | deterministic |
| f16-move-chihuahua | Star | Chihuahua, tier 1, start of battle | `Chihuahua pushed Cow forward 1 space(s).` | deterministic |

Both were checked the same three ways as every earlier fixture by `harness/sim_notes.js`, and all three checks are clean on both.
Both boards were read off the screen before the first clash and match their payloads.
f15: Pig 4/16, Duck 4/20, Nurse Shark 5/7 and Nyala 3/4 against a single Cow 8/30, which the game renders in exactly that order with Nyala at the front.
The Cow then reads 8/27 after Nyala's clash, 8/22 after the shark's clash, and 8/4 after the 18 damage snipe, which is the fork sim's board line for line.
f16: Pig 9/20 and Chihuahua 4/5 against Otter 2/6, Worm 1/4 and Cow 3/16, and after the push the enemy order on screen is Otter, Cow, Worm, which is the fork sim's post-push board.

Two fixture design notes worth keeping.
f15 solves the problem W0b recorded as unsolvable: a spender needs trumpets already banked, and the payload builder cannot set a starting trumpet count, so the trumpets are banked inside the same battle by a Nyala that faints one clash earlier.
The opponent is a single Cow so the spender's random enemy target is forced, which is what keeps the fixture deterministic, and two friends are kept alive so the Golden pack last stand Golden Retriever never spawns.
f16 uses a one space push rather than a push to the front, and gives every enemy a different health, so the target is not a random pick and the animation cannot be confused with the ordinary shift forward after a death.

## Does the pet reposition use f09's arc-over grammar

Yes, and the delta is only in the source and the distance.
The Chihuahua push is the same three beats as the Pogo Stick push in f09: a grey rock leaves the source pet, arcs over the boards, and lands on the target, and the target then lifts off the ground and arcs over the pet it is passing rather than sliding through it.
f16 t=29.65 launch, t=30.05 impact, t=30.13 the Cow airborne above the Worm, t=30.30 landed.
Two differences worth writing into W2.
The banner is a pet card with a portrait and a level pill rather than the toy card f09 shows, which is the ordinary pet-versus-toy banner difference, not a reposition difference.
A one space push is an exchange: the passed pet slides backwards into the slot the moved pet just left, in the same beat, where f09's push to the front rotated the whole segment.

## Not witnessed

Every event class in the coverage table was witnessed in the real game.
W0b listed three sub-cases of witnessed classes that no fixture reached.
Two of them are now closed, one by new footage and one by equivalence, and one remains open.

| sub-case | implementation site | status |
| --- | --- | --- |
| trumpets spent | `spendTrumpets`, log type `trumpets` | closed by footage, f15, CHECKLIST section 19 |
| log type `equipment` | equipment classes that log with `type: 'equipment'` | closed by equivalence, see below |
| log type `move` | the `log.type === 'move'` branch | still unreached, and still dead code |

**Equipment, closed by equivalence.**
No fixture emits a log with `type: 'equipment'`, because the two equipment events that were recorded are logged by the engine as `attack` and `ability`: the melon break in f08 and the coconut gain in f10.
An equipment effect is nevertheless rendered by the real game with the same grammar as a pet ability effect, which is what the recorded footage already shows.
f10 t=36.85 is a banner for a granted perk with the same layout as any ability banner, including the grey italic second line explaining the perk, and t=37.32 is the coconut icon leaving that banner's rules text on the ordinary projectile arc, which is section 15's rule that the projectile is the icon of whatever is being delivered.
f08 t=28.61 to t=30.14 is the persistent perk icon and its break animation, which is the equipment-specific part and is already recorded.
So the row is covered by equivalence and no fixture was recorded for it: what the `equipment` branch of the switch has to draw is exactly what the `ability` branch draws, plus the icon and break behaviour f08 already documents.

**Move, still open.**
No ability anywhere in the fork emits a log with `type: 'move'`.
Both real repositions, f09's Pogo Stick push and f16's Chihuahua push, are logged as `ability`, so the `move` branch is dead code that the W1 event stream should replace rather than feed.
The animation itself is now recorded twice, from a toy source and from a pet source, so W2 has what it needs regardless of which log type carries it.

## Coverage of the modes, not just the classes

Every class above was recorded at the game's normal speed.
Eleven of the fixtures were additionally recorded with FAST engaged, because FAST changes what is drawn and not only how fast: see CHECKLIST section 16.
The fast clips are `fast-<fixture>` and cover clash, death, push forward, snipe, summon, transform, toy, move, stat change, equipment, jump attack, trumpets gained, trumpets spent, mana and xp.

f15 was recorded with FAST because the spend has a beat that f12's gain does not, the counter counting down, and the question was whether that beat survives FAST.
It does, and it is the only thing that does: fast-f15 t=29.59 is the green gain flash and t=30.67 the yellow spend flash, both with no banner and no trumpet token in flight, so under FAST a trumpet spend is readable only from the counter widget.
That is one beat more than fast-f12 shows, which is why the clip was kept.
