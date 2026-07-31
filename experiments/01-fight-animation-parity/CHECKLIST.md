# exp01 W0: behaviour parity checklist (draft for Ruihan)

What the real Super Auto Pets client actually does when it animates a battle, read off the W0 reference clips.
Every claim cites a fixture and a timestamp into that fixture's clip, so it can be checked frame by frame.
Timestamps are the `t=` labels on the filmstrips and on the frame filenames, in seconds since the recording started.

This is the target list for W1 (event stream) and W2 (animation director).
It is a description of the real game, not a specification of our code.

Clips: `<scratchpad>/anim01/out/<fixture>.webm` and `<fixture>_filmstrip.jpg`.
Frames: `/root/autodl-tmp/sap-data/anim01/clips/<fixture>/` on the box.
Close-up strips referenced below: `<scratchpad>/anim01/out/z_*.jpg`.

## 0. The two things that jump out

Two mechanisms carry almost the whole animation, and the calculator has neither.

**A trigger banner.**
Every ability activation shows a card at the top of the play area with the acting pet's portrait, its name in orange capitals, a level pill, and the ability's own rules text.
It is not a small badge on the pet, it is a full readable card, and it stays up for the whole activation.
Toys use the same card with the toy icon on both sides instead of a portrait and level pill.

**A grey rock projectile.**
Every ability that reaches a target throws a small grey rock along a high parabolic arc from the source to the target.
The same rock is used for damage, for stat buffs, for stat copying, and for repositioning.
An area effect throws several rocks at once, one per target, fanning out from the source.
This is the game's universal "this ability is travelling from A to B" object, and it is why abilities read as directional rather than instant.

## 1. Simultaneous clash

Two front pets attack each other as one event, not two.

- Wind-up: both front pets get a red outline about 1.5 s before contact, then lean toward the midline. f01 t=29.42 to t=29.67, see `z_f01_clash.jpg`.
- Contact: a single frame at the midline with a white radial flash between the two pets. f01 t=29.84.
- Both damage numbers appear in that same frame, one on each side of the flash, large red digits. f01 t=29.84 shows `3` on the player side and `4` on the opponent side.
- Both pets' stat pills are already updated in the contact frame. f01 t=29.84: Pig 4/10 to 4/7 and Cow 3/4 to 3/0 at once.
- Recoil: both pets are back in their slots about 0.17 s after contact. f01 t=30.01.
- The damage numbers linger for roughly 0.7 s after contact and fade in place, they do not follow the pet.

Parity requirement: one clash frame per exchange, two damage popups in it, never two sequential attack frames.

## 2. Hurt popup and stat change popup

Damage and stat gain use two visually different popups.

- Damage: large red digits, placed between the two pets at the contact point, or over the target for a ranged hit. f01 t=29.84, f02 t=30.18.
- A blocked hit still shows a number, and that number is `0`. f08 t=29.81, the melon pet takes an 8 attack and the popup reads `0`.
- Stat gain: a small grey pill with the number in it, floating just above the pet's level tag, with white sparkles. f10 t=31.15 shows a `3` pill over the Peacock as its attack goes 2 to 5.
- Copied stats are shown as large white text over the pet, in `attack health` form, not as two pills. f05 t=31.08 shows `6 10` over the Butterfly.
- A pet that was hurt keeps a red outline for about a second afterwards. f01 t=30.01, f10 t=31.48.

Parity requirement: damage and stat change are different popup types, and a fully absorbed hit still emits a damage popup with value 0.

## 3. Faint

A faint is a three-stage animation, and the stages overlap with what comes next.

- Stage 1, dead in place: the pet's sprite is replaced by a crossed-out knocked-out sprite and its health pill shows 0 or a negative number. It stays in its slot. f07 t=30.02 shows the Hedgehog at 4/-2 still on the board, f06 t=30.21 shows the Otter at 2/-1.
- Stage 2, launch: the corpse is thrown off the board along a rising arc with a thick white smoke trail behind it, carrying its level tag and stat pill with it. f01 t=30.01 to t=30.33, f03 t=32.00.
- Stage 3, despawn: a yellow star burst at the point where the corpse leaves the screen. f01 t=30.33 to t=30.56, f03 t=32.48.
- The whole faint is about 0.55 s from launch to star burst.
- Critically, stage 1 is held until the entire damage step has resolved. In f07 the three enemies that die to one area effect all sit on the board as crossed-out sprites at t=32.16 and only launch together at t=32.56.

Parity requirement: a pet that dies does not vanish. It becomes a corpse sprite in place, waits for the step to finish, then launches, then bursts.

## 4. Push forward

Survivors slide up while the corpses are still in the air.

- The slide starts during the corpse flight, not after it. f01: corpse launches at t=30.01, the opponent board has already slid forward at t=30.43 while the star burst is still on screen.
- The slide is a smooth translation of each surviving pet by one or more slots, all survivors moving at the same time.
- After a multi faint the survivors cross more than one empty slot in a single slide. f07 t=32.56 to t=32.91, the two rear enemies cross three vacated slots.
- Total settle time after a single faint is about 1.0 s from contact to the next pair being highlighted. f01 t=29.84 to t=30.98.

Parity requirement: push forward is keyed to pet identity and overlaps the faint animation, and N simultaneous deaths produce one slide, not N.

## 5. Snipe and ranged ability

Best seen in f02 (`z_f02_arc.jpg`, `z_f02_snipe.jpg`) and f06 (`z_f06_dolphin.jpg`).

- The trigger banner appears first, roughly 0.5 s before anything moves. f02 t=29.08.
- The source pet gets a green outline while it is the acting source. f02 t=29.31.
- A grey rock leaves the source, rises to an apex around the height of the banner, and descends onto the target. f02 t=29.55 launch, t=29.64 apex, t=29.87 arrival, so about 0.32 s of flight.
- The arc height and duration look the same for a short hop and for a full board crossing, so the arc is not distance scaled in an obvious way. Compare f02 (front source to last enemy, maximum distance) with f06 t=29.58 to t=29.88 (back row source to enemy middle slot).
- Impact: white puff at the target plus the red damage number. f06 t=29.88.
- The banner stays up through the impact and the following faint. f06 t=30.52.

Parity requirement: source to target projectile with a visible arc, banner before launch, damage popup on arrival, not an instant number.

## 6. Area effect

- One rock per target, all launched together from the source, fanning out across both boards. f03 t=30.82 shows four rocks in flight, f07 t=30.35 and t=30.69 show the same for seven targets.
- All impacts land close together and every damage popup is on screen in the same frame. f03 t=31.26, f07 t=31.48 shows six `2` popups at once.
- The area effect hits the caster's own side too, and those popups look identical. f07 t=31.82, the player's Duck and Pig both show `2`.

Parity requirement: an area effect is one event with N popups in one frame, not N sequential frames.

## 7. Summon

Best seen in f04 (`z_f04_summon.jpg`).

- Order is: corpse launch, star burst, then the banner, then the spawn. f04 t=29.90 launch, t=30.21 banner `SHEEP / Faint -> Summon two 2/2 Rams`.
- Spawn: a white cloud puff appears in the empty slot and the new pet resolves out of it. f04 t=30.53 puff, t=30.75 first Ram visible.
- Two summons from one ability appear one after the other in the same puff sequence, roughly 0.3 s apart, not simultaneously. f04 t=30.75 one Ram, t=31.02 two Rams.
- A reaction to the summon gets its own banner afterwards. f04 t=31.59 `HORSE / Friend summoned -> Give it +1 attack until next turn`, then a rock flies from the Horse to the Ram at t=32.05.
- The reaction fires once per summoned pet, so the Horse banner and rock repeat.

Parity requirement: summon is puff then pet, staged per summoned pet, and downstream reactions are separate banner plus projectile events.

## 8. Transform

Best seen in f05 (`z_f05_transform.jpg`).

- Banner for the source pet first, with the source outlined green. f05 t=29.40 `CATERPILLAR / Start of battle -> Transform into a 1/1 Butterfly and copy stats of the strongest enemy`.
- The source sprite is replaced by the same white cloud puff used for summons, in place, keeping the slot and the level pill. f05 t=29.75.
- The banner switches to the NEW pet and its own ability before the new sprite is fully visible. f05 t=30.09 `BUTTERFLY / Transformed -> Copy 100% attack and health from the strongest enemy`.
- New sprite resolves out of the puff. f05 t=30.41.
- Any follow-on effect then plays as a normal projectile plus popup. f05 t=30.75 rock in flight, t=31.08 white `6 10` stat text.

Parity requirement: transform reuses the summon puff in place, and the transformed pet's own trigger is a separate banner, so it is two events not one.

## 9. Move and reposition

Only f09 produces a pure reposition, and the calculator emits no move event at all today.

- Toy banner first. f09 t=29.04 `POGO STICK / Start of battle -> Push the last enemy up front and give it +100% attack and +100% health`.
- Rock travels to the target. f09 t=29.74.
- The moved pet arcs over its neighbours to its new slot, it does not slide through them. f09 t=30.08 shows the Worm airborne above the two pets it is passing.
- The pets it passed close up behind it, so this is a rotation of the whole board segment, not a swap.
- The buff lands after the move, as its own popup. f09 t=31.20 shows a red heart icon over the moved pet.

Parity requirement: repositioning is an animated arc of the moved pet with the rest of the segment closing up, and it is a distinct event from the buff that accompanies it.

## 10. Equipment

Best seen in f08 (`z_f08_equip.jpg`).

- Equipment is drawn as a small perk icon attached to the pet sprite, visible for the whole battle. f08 t=28.61 shows a green melon on the front pet and a brown peanut on the pet behind.
- On a blocked hit the damage popup reads `0` in the normal clash frame. f08 t=29.81.
- The melon then shatters into green fragments that scatter around the pet, and the icon is gone from that point on. f08 t=30.14.
- Equipment gained during battle arrives through the normal banner plus projectile path, it is not instant. f10 expected sequence has `Gorilla gave Gorilla a Coconut` after a hurt trigger.

Parity requirement: a persistent icon on the pet, a `0` damage popup when the hit is absorbed, and a distinct break animation when the equipment is consumed.

## 11. Trigger banner details

- Anchored at a fixed position at the top of the play area, under the replay controls, horizontally left of centre. It does not follow the pet.
- Layout is portrait, name in orange capitals, level pill on the right, ability text underneath with inline stat icons.
- It appears about 0.4 to 0.5 s before the effect and stays until the effect finishes.
- Repeated triggers of the same ability show the banner again each time. f10 t=30.11 and t=32.18 are two separate Peacock hurt banners.
- The acting pet is outlined green while its banner is up, which is a different colour from the red hurt outline. f02 t=29.31 green, f01 t=30.01 red.
- A dead pet still gets the green source outline for its own faint ability. f03 t=30.43.

## 12. Timing feel

Measured from the clips, at the game's normal speed with autoplay on.

| beat | duration | evidence |
| --- | --- | --- |
| idle before a clash | about 1.5 s | f01 t=29.42 to t=29.84 wind-up, t=30.98 next highlight |
| contact to recoil | about 0.17 s | f01 t=29.84 to t=30.01 |
| damage popup lifetime | about 0.7 s | f01 t=29.84 to t=30.56 |
| corpse launch to star burst | about 0.55 s | f01 t=30.01 to t=30.56 |
| projectile flight | about 0.32 s | f02 t=29.55 to t=29.87 |
| banner lead-in before effect | about 0.45 s | f02 t=29.08 banner, t=29.55 launch |
| summon puff to pet visible | about 0.22 s | f04 t=30.53 to t=30.75 |
| clash to next clash | about 1.6 s | f01 t=29.84 to t=31.16 |

The whole battle is paced by these overlapping beats, not by a fixed per-event delay.
Nothing waits for the previous thing to fully finish: the push forward starts during the corpse flight, and the next banner appears while the previous popups are still fading.

Parity requirement: kill the hard-coded setTimeout table and the x2 fudge, and drive timing from the animations themselves, with the overlaps above preserved.

## 13. What the real game does NOT do

Useful negatives, because the current calculator does some of these.

- It never merges N hits into one popup. Every hit gets its own number.
- It never shows two sequential frames for one mutual attack.
- It never removes a dead pet before the damage step is finished.
- It does not scale the projectile arc obviously with distance.
- It does not put the ability text on the pet. All ability text is in the banner.

## Fixture coverage and status

| fixture | covers | fork sim determinism | boards verified on screen | divergence |
| --- | --- | --- | --- | --- |
| f01-plain-trades | plain trades, simultaneous clash, hurt popup, single faint, push forward | deterministic | yes | none |
| f02-snipe-crocodile | snipe, start of battle trigger, maximum distance projectile | deterministic | yes | none |
| f03-faint-chain | faint trigger chain, area damage, cascading faint | deterministic | yes | none |
| f04-summon-sheep | summon, double summon staging, friend-summoned reaction | deterministic | yes | none |
| f05-transform-caterpillar | transform, stat copy staging | deterministic | yes | none |
| f06-snipe-dolphin | snipe from the back row to a mid board target | deterministic | yes | none |
| f07-pushforward-multi | three simultaneous faints, multi slot push forward | order-only ambiguity | yes | none |
| f08-equipment-melon-peanut | equipment icon, melon absorb and break, peanut knockout | deterministic | yes | none |
| f09-toy-pogo-stick | toy, toy start of battle trigger, move event | deterministic | yes | none |
| f10-hurt-knockout | hurt trigger, knock out trigger, mid battle equipment, stat pill | deterministic | yes | none |

Determinism was measured three ways per fixture, by `harness/sim_notes.js`.
`randomDecisions` is the engine's own capture of every point where it consulted the RNG.
`randomEventLogs` is the engine's own tagging of logs as random.
`stableOver25Runs` reruns the battle 25 times unseeded and requires the winner and the whole log text to be identical.
Nine fixtures are clean on all three.

f07 is marked order-only: its winner and the multiset of log lines never change over 25 runs, and the only thing that varies is which of three simultaneous faints the engine writes first.
That is inherent to the fixture, whose whole point is three pets dying in one step, and the real game shows them as one simultaneous step anyway.
Full reports are in `harness/expected/<fixture>.txt`.

## Divergence check, and what was not checked

No divergence was found.

What was actually compared, per fixture: the injected board against what the game rendered before the first clash, and every animation beat inspected in the close-up strips against the fork sim's expected line for that beat, including damage values and resulting health values.
Five fixtures were additionally confirmed at the outcome level by reading the surviving pets off the last battle frame, and all five match the fork sim exactly.
f01 leaves the Swan alone, f02 leaves Pig 3/10 and Crocodile 8/1, f03 leaves Pig 5/4, f08 leaves Duck 4/1, f10 leaves Gorilla 7/1.

What was not done here: a full event-by-event alignment of the real animation against the fork sim log for all ten fixtures.
That is W3's job and it needs the W1 event stream to compare against.
