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
Refined in W0b, section 15: the grey rock is the attack stat's own icon, and the general rule is that the projectile is the icon of whatever is being delivered, pulled out of the banner's rules text.

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

## 14. Event classes first recorded in W0b

Four event classes had no W0 footage.
Each now has one fixture, and each turns out to have its own visual vocabulary rather than reusing the generic one.

**Jump attack.** f11, `z_f11_jump.jpg`.

- Banner first, exactly like a snipe. f11 t=29.50, `AFRICAN WILD DOG / Start of battle -> Jump attack the second enemy for 3 damage`, source outlined green in its slot.
- The pet itself is the projectile. It leaves the ground and rises to roughly banner height, carrying its level tag and stat pill with it. f11 t=29.83.
- Apex is over the enemy board, above the pet it is jumping over. f11 t=30.05.
- Contact is a normal clash frame at the target's slot: white radial flash, the attacker's damage and the target's counter-attack in the same frame. f11 t=30.17 shows `3` on the Otter and `2` on the dog, and both stat pills are already updated, Otter 2/6 to 2/3 and dog 3/9 to 3/7.
- Return is a second arc back to the attacker's own slot, with a white puff where it lands. f11 t=30.79 to t=31.12.
- Total flight is about 0.95 s out and back, roughly three times a snipe projectile.

Parity requirement: a jump attack is one event that moves the attacker over the intervening pets and back, and its contact frame is a two-sided clash at the target's slot, not a one-way ranged hit.

**Trumpets.** f12, `z_f12_trumpets.jpg`, `z_f12_counter.jpg`.

- Banner with the acting pet, over its corpse, because the trigger is a faint. f12 t=30.05, `GROUNDHOG / Faint -> Gain +1 trumpet`.
- A trumpet icon detaches from the banner's own text and travels left out of the card. f12 t=30.55 to t=30.78.
- A pill appears to the left of the banner, green while it is landing. f12 t=30.99 to t=31.11.
- The pill settles white and stays for the rest of the battle: a card with a trumpet on each side and the running total in the middle. f12 t=31.36, still there at t=33.02.
- This is the one event class with no pet target, so there is no source to target motion at all: the motion is banner to counter.

Parity requirement: trumpets need a persistent per-side counter widget on the play area, not a popup over a pet.

**Mana.** f13, `z_f13_mana.jpg`.

- Banner with the level pill reading the pet's real level. f13 t=29.31, `ALCHEMEDES 3 / Start of battle -> Give the nearest friend ahead +3 mana`.
- A blue mana potion detaches from the banner text and flies to the target on the usual high arc. f13 t=29.99 launch, t=30.14 apex, t=30.30 arrival.
- Impact is a white flash plus a large blue `3` over the target.
- The target then carries a small blue mana pill between its attack and health pills for the rest of the battle. f13 t=30.45 onward.

Parity requirement: mana is both a popup and a persistent third stat pill on the pet.

**Experience.** f14, `z_f14_xp.jpg`.

- Banner. f14 t=29.23, `PUG 2 / Start of battle -> Give the nearest friend ahead +2 experience`.
- From the moment the xp event starts, every level plaque on both boards grows a progress bar under the level number, and keeps it for the rest of the battle. f14 t=29.41 compared with t=28.80.
- A red book detaches from the banner text and flies to the target. f14 t=29.64 to t=29.77.
- There is no number popup for xp. The arrival is a gold radial burst with an expanding gold ring, and the target's level plaque and stat pills change inside that burst. f14 t=30.02 shows Pig at Lvl 2 and 6/16, up from Lvl 1 and 4/14.
- The burst runs about 0.45 s. f14 t=30.02 to t=30.45.

Parity requirement: xp is not a stat popup. A gain that crosses a level shows as a gold level-up burst plus a changed level plaque, and the plaques carry a progress bar once any xp is in play.

## 15. What the projectile actually is

W0 section 0 called the projectile a grey rock and said the same rock is used for damage, buffs, copying and repositioning.
With the four new classes on screen that is one case of a more general rule, and the general rule is what W2 has to implement.

The projectile is the icon of the thing being delivered, and it is physically pulled out of the banner's own rules text.

- Attack buff: the grey attack glyph. f10 t=34.32, it leaves the `+3 attack` phrase in the Hippo banner.
- Health buff: a red heart. f10 t=34.51, it leaves the `+3 health` phrase in the same banner, one beat after the attack glyph.
- Mana: a blue potion. f13 t=29.99.
- Experience: a red book. f14 t=29.64.
- Equipment: the perk icon itself. f10 t=37.32, a coconut leaves the `Gain Coconut perk` phrase.
- Trumpets: a trumpet. f12 t=30.55.

Two consequences.

A multi part effect throws one object per part, staggered, and lands one pill per part.
f10 t=34.72 shows a grey `+3` and a red `+3` side by side over the Hippo, from the single log `Hippo gave Hippo 3 attack and 3 health`.

Stat pills carry a sign.
Damage popups are bare red digits, stat pills are signed, `+3`, on a grey chip for attack and a red heart chip for health.

The banner itself carries more than W0 recorded.
It has an optional second line in grey italics explaining a granted perk, f10 t=36.85 `Coconut = Block damage, once.`, and a uses-remaining tab on its right edge for limited abilities, f10 t=34.01 for `Works 3 times per battle`.

## 16. Speed mode grammar

The control bar's `FAST` button is a toggle whose state survives from one battle to the next.
Engaged is drawn as a dimmed glyph, the same treatment `AUTOPLAY` uses when it is on.
Hovering a button draws a black focus ring, which is not the engaged state and is easy to misread; every reading here was taken with the cursor parked off the bar.

**What it costs.** Measured as the time the control bar is on screen, which is exactly the battle animation, over ten fixtures recorded both ways.

| fixture | normal | FAST | ratio |
| --- | --- | --- | --- |
| f01-plain-trades | 9.12 s | 3.90 s | 2.34 |
| f02-snipe-crocodile | 5.39 s | 2.09 s | 2.58 |
| f04-summon-sheep | 10.65 s | 4.34 s | 2.45 |
| f05-transform-caterpillar | 8.37 s | 3.14 s | 2.66 |
| f09-toy-pogo-stick | 10.51 s | 4.29 s | 2.45 |
| f10-hurt-knockout | 11.98 s | 4.21 s | 2.85 |
| f11-jump-african-wild-dog | 10.46 s | 4.23 s | 2.48 |
| f12-trumpets-groundhog | 7.98 s | 3.14 s | 2.54 |
| f13-mana-alchemedes | 6.41 s | 2.59 s | 2.48 |
| f14-xp-pug | 5.80 s | 2.15 s | 2.70 |
| total | 86.67 s | 34.08 s | 2.54 |

**What is suppressed.** The trigger banner, entirely.

- No banner card is drawn at any point in any fast clip. Compare f10 t=33.04, t=34.01, t=36.85 with fast-f10, which has no card at all.
- In its place the ability's icon appears over the acting pet, small, for about 0.2 s. fast-f10 t=28.52 the attack glyph over the Peacock, t=29.63 the heart over the Hippo, t=30.57 the coconut over the Gorilla.
- Because the banner is gone, the projectile has nowhere to come from, so there is no travel: the icon appears at the source and the pill appears at the target.
- This is why the banner heavy fixture compresses the most, f10 at 2.85, and the banner free one the least, f01 at 2.34.

**What is compressed rather than suppressed.**

- Clash flash, damage popups, red hurt outline, green source outline: all still drawn. fast-f10 t=28.73, t=29.38.
- Corpse in place, corpse launch, star burst, push forward: all still drawn. fast-f10 t=29.82 to t=30.33.
- Stat pills: still drawn, still signed, still one per stat. fast-f10 t=29.82 shows `+3` and `+3` over the Hippo.
- Persistent widgets, the trumpet counter and the mana pill, are unaffected.

**What stops being staged.** Sub-steps that are sequential at normal speed become simultaneous.

- Two summons from one ability appear together instead of about 0.3 s apart. fast-f04 t=28.91 has both Rams already on the board in the same frame as the star burst, against f04 t=30.75 and t=31.02.
- Repeated reactions to those summons resolve together. fast-f04 t=29.60 shows both `+1` pills at once, against f04 t=31.59 and a second banner later.

Parity requirement: FAST is not a playback rate multiplier applied to the same timeline. It is a second grammar in which the banner is replaced by an icon over the source, per-target staging collapses, and the remaining beats run about 2.5 times faster.

## 17. Replay controls

The bar sits at the top of the play area, at y=77 in a 1280x800 viewport, with the buttons about 78 px apart at x=483, 562, 640, 716, 794.
It fades in about 3.4 s after the client is served the battle and about 1.5 s before the first clash, and it disappears at the moment the battle ends.

Which buttons exist depends on how the battle was reached.

- A battle the client treats as a replay shows five: `REWIND`, `PAUSE`, `AUTOPLAY`, `FAST`, `SKIP`. All the coverage fixtures are this path, top right reads `Replaying...`. f01 t=28.55.
- A battle the client treats as new shows three: `PAUSE`, `AUTOPLAY`, `FAST`. No rewind and no skip. outro-victory t=43.97.

There is no button labelled stop. `PAUSE` is the stop control.

**PAUSE.** Freezes the animation in place and relabels itself to `PLAY` with a play triangle.
`shots/ctl-pause_bar0040.jpg` and `ctl-pause_bar0070.jpg` are three seconds apart and identical, board and popups both.
Pressing it again relabels back to `PAUSE` and the battle resumes from exactly where it stopped, with no re-run of the interrupted beat.
`shots/ctl-pause_bar0100.jpg`.
Measured cost: the ctl-pause run's bar was up for 15.14 s against 10.65 s for the same fixture unpaused, which is the pause duration and nothing else.
State left behind: none, the battle finishes normally and exits to the shop.

**SKIP.** Abandons the rest of the animation.
Pressed at bar+2.55 s in the ctl-skip run, the bar went away at bar+3.38 s, so about 0.8 s later.
In that 0.8 s the animation does not fast forward through the remaining clashes, it plays out only the beat that was already in flight, then wipes out.
State left behind: the shutter wipe straight back to the shop, no result screen, and the remaining clashes are never shown.
ctl-skip t=30.35 to t=32.05.

**REWIND.** On this path it is a trap, and W2 should not copy it.
Pressed at bar+5.0 s in the ctl-rewind run, the animation stepped back to the previously completed board state and then stopped advancing.
The board sat unchanged from t=34.5 s to t=54.0 s, the whole rest of the recording, with the bar still on screen and still reading `PAUSE` as if it were playing.
`shots/after_rewind.jpg`.
Pressing `PAUSE` and pressing it again did nothing, and the label never changed, so the whole bar is dead after a rewind.
The client issued no network request when rewind was pressed, so nothing was being waited on.
Recovery needed a page reload; the run itself survived that.
Caveat worth stating plainly: this was observed on an injected replay where only one battle id is ever served, so the intended behaviour, stepping back to the previous turn's battle, may simply have nothing to step back to.
What is certain is the state it leaves: frozen board, live looking but inert control bar, no way out from inside the battle.

**AUTOPLAY.** A toggle, on for every recording here.
Off, the battle advances one clash per `PLAY` press, which is why the W0 setup turns it on once per browser session.

**FAST.** See section 16.

## 18. Battle intro and end screens

**Intro, from the click to the first clash.** outro-defeat, `z_intro_full.jpg`.

| beat | time | what happens |
| --- | --- | --- |
| shutter closes | t=36.22 | the shop collapses into a horizontal band and goes black, about 0.7 s |
| shutter opens | t=37.58 | an empty battlefield, and the player's team name card slides in from the left |
| player board arrives | t=38.33 | the player's pets slide in from the left as a staggered line under their level plaques |
| player board settles | t=39.07 | |
| VS card | t=39.79 | a `VS` card pops in at the centre between the two name cards |
| opponent arrives | t=40.53 | the opponent's team name card appears and the opponent's pets are delivered from the top right riding a rocket |
| opponent board settles | t=42.25 | |
| name cards clear | t=43.05 | both boards fully lined up, the three cards gone |
| controls appear | t=43.75 | the control bar fades in at the top and the two player name plates fade in at the bottom corners |
| first wind-up | t=44.44 | the two front pets take the red outline |

Total from the shutter to the first wind-up is about 8.2 s.

The replay path is the same sequence without the rocket delivery and about half as long, roughly 4.5 s from the payload being served to the first wind-up.
f01 t=25.00 player card, t=25.94 both cards, t=26.78 both boards, t=28.55 control bar, t=29.42 first wind-up.

**End screens.** Only the new-battle path has them.
The replay path has no result screen at all: the last star burst, then the shutter wipe, then the shop.
f01 t=38.31 last frame of the battle, t=39.10 shutter, t=39.55 shop.

Victory, outro-victory, `z_outro_victory2.jpg`.

| beat | time | what happens |
| --- | --- | --- |
| battle ends | t=53.38 | last star burst, survivor alone on the field |
| dim | t=54.33 | the field darkens in place, it is not a wipe, the survivor stays visible and greys out |
| trophies fly in | t=55.47 | a row of ten trophy outlines flies in from the right across the top |
| hearts fly in | t=55.47 | a row of five heart slots flies in from the right across the bottom, filled to the player's current lives |
| face and caption | t=56.52 | a large yellow smiling face scales up at the centre with `VICTORY` under it |
| trophy awarded | t=57.68 | the first trophy fills gold with a sparkle burst |
| settled | t=58.84 | |

Defeat, outro-defeat, `z_outro_defeat.jpg`.

| beat | time | what happens |
| --- | --- | --- |
| battle ends | t=52.60 | last star burst |
| dim starts | t=52.95 | |
| near black | t=53.86 | |
| trophies fly in | t=54.39 | ten trophy outlines, none filled |
| hearts fly in | t=54.84 | |
| face and caption | t=55.36 | the same face with a blue sweat drop, `DEFEAT` under it |
| life lost | t=56.96 | an explosion bursts on the rightmost filled heart |
| settled | t=57.52 | one more heart is broken |

So the two screens share one layout, a trophy row, a face, a caption and a heart row, and differ in the face decoration, the caption, and which row animates: victory fills a trophy, defeat destroys a heart.
The delay from the screen appearing to that animation is about 2.2 s in both.

Parity requirement for W2: the animation button has to wrap the battle in this shutter, lineup, VS, controls-appear opening and in one of the two end screens, and the end screen has to be driven by the simulation's own winner rather than by a separate result field.

Note on how these were recorded, because it matters for reproducing them.
The client decides replay against new battle from the payload's `WatchedOn` field.
Every coverage fixture is served with `WatchedOn` set, which is the replay path, which is why one arena battle slot can be re-injected forever.
The two end-screen clips were served with `WatchedOn` cleared, which makes the client accept the battle as real, show the end screen, and consume the turn.
`Outcome` in the payload, 1 win and 2 loss, is what the end screen reads, so it has to be set to agree with the boards.

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
| f11-jump-african-wild-dog | jump attack, attack over an intervening pet | deterministic | yes | none |
| f12-trumpets-groundhog | trumpets, faint trigger with no pet target | deterministic | yes | none |
| f13-mana-alchemedes | mana change, persistent mana pill | deterministic | yes | none |
| f14-xp-pug | xp change, level up during battle | deterministic | yes | none |

Determinism was measured three ways per fixture, by `harness/sim_notes.js`.
`randomDecisions` is the engine's own capture of every point where it consulted the RNG.
`randomEventLogs` is the engine's own tagging of logs as random.
`stableOver25Runs` reruns the battle 25 times unseeded and requires the winner and the whole log text to be identical.
Thirteen fixtures are clean on all three.

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
