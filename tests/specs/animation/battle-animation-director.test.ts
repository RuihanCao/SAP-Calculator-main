import { describe, expect, it } from 'vitest';
import {
  AnimationEvent,
  AnimationSide,
} from '../../../src/app/domain/interfaces/animation-event.interface';
import {
  AnimationBoardState,
  AnimationCue,
  AnimationTimeline,
  BannerCue,
  ClashCue,
  CorpseLaunchCue,
  DamagePopupCue,
  ImpactPuffCue,
  MoveArcCue,
  OutlineCue,
  ProjectileCue,
  SlideCue,
  StatPillCue,
  CLASH_WHITEOUT_MS,
  INTRO_BEATS,
  JUMP_ARC_LIFT,
  JUMP_CONTACT_LIFT,
  TimelineSampler,
  TrumpetCounterFlashCue,
  TrumpetTokenCue,
  buildBattleTimeline,
  buildSeedBoard,
  advancePlayback,
  boardStateTimes,
  getBeats,
  initialPlayback,
  nextCheckpointMs,
  parseBannerText,
  pause,
  play,
  popupValueAt,
  previousBoardStateMs,
  rewind,
  skip,
  parseSeedBoardMessage,
} from '../../../src/app/ui/shell/simulation/battle-animation';
import { isAilmentEquipmentName } from '../../../src/app/integrations/equipment/equipment-categories';
import { listFixtureIds, loadFixture, readGolden } from '../../support/animation-event-fixtures';

interface FixturePet {
  pet: string;
  attack: number;
  health: number;
  level?: number;
  perk?: string;
}

interface FixtureBoards {
  player?: FixturePet[];
  opponent?: FixturePet[];
}

const seedFor = (id: string): AnimationBoardState => {
  const fixture = loadFixture(id) as FixtureBoards & { id: string };
  const toSeed = (pets: FixturePet[] | undefined) =>
    (pets ?? []).map((pet) => ({
      name: pet.pet,
      attack: pet.attack,
      health: pet.health,
      level: pet.level ?? 1,
      equipment: pet.perk ?? null,
    }));
  return buildSeedBoard(toSeed(fixture.player), toSeed(fixture.opponent));
};

const timelineFor = (
  id: string,
  mode: 'normal' | 'fast' = 'normal',
): AnimationTimeline =>
  buildBattleTimeline(readGolden(id), {
    initialBoard: seedFor(id),
    mode,
    includeIntro: false,
    includeOutro: false,
  });

const cuesOfKind = <T extends AnimationCue>(
  timeline: AnimationTimeline,
  kind: AnimationCue['kind'],
): T[] => timeline.cues.filter((cue) => cue.kind === kind) as T[];

const survivors = (board: AnimationBoardState, side: AnimationSide) =>
  (side === 'player' ? board.player : board.opponent)
    .filter((pet) => !pet.fainted)
    .map((pet) => `${pet.name} ${pet.attack}/${pet.health}`);

const fixtureIds = listFixtureIds();

describe('battle animation director', () => {
  it('covers every parity fixture', () => {
    expect(fixtureIds.length).toBeGreaterThanOrEqual(16);
  });

  for (const id of fixtureIds) {
    it(`${id} builds a well formed timeline`, () => {
      const timeline = timelineFor(id);
      const events = readGolden(id);
      expect(timeline.steps).toHaveLength(events.length);
      expect(timeline.cues.length).toBeGreaterThan(0);
      for (const cue of timeline.cues) {
        expect(cue.endMs).toBeGreaterThanOrEqual(cue.startMs);
        expect(cue.startMs).toBeGreaterThanOrEqual(0);
        expect(cue.endMs).toBeLessThanOrEqual(timeline.durationMs);
      }
      // Every event keeps its own step, and every step keeps its board.
      for (const step of timeline.steps) {
        expect(step.board).toBeTruthy();
        expect(step.commitMs).toBeGreaterThanOrEqual(0);
      }
    });
  }

  describe('clash, checklist 1', () => {
    it('draws one contact frame per exchange, never two sequential attacks', () => {
      const timeline = timelineFor('f01-plain-trades');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      const clashEvents = readGolden('f01-plain-trades').filter(
        (event) => event.type === 'clash',
      );
      expect(clashes).toHaveLength(clashEvents.length);
      for (const clash of clashes) {
        expect(clash.hits).toHaveLength(2);
        expect(clash.contactMs).toBeGreaterThan(clash.startMs);
      }
    });

    it('puts both damage popups and both stat pills in the contact frame', () => {
      const timeline = timelineFor('f01-plain-trades');
      const sampler = new TimelineSampler(timeline);
      const clash = cuesOfKind<ClashCue>(timeline, 'clash')[0];
      const frame = sampler.frameAt(clash.contactMs);
      expect(frame.popups.filter((popup) => popup.kind === 'damage')).toHaveLength(2);
      expect(frame.flash).not.toBeNull();
      // Pig 4/10 takes 3 and Cow 3/4 takes 4, both already on the board.
      const pig = frame.board.player.find((pet) => pet.name === 'Pig');
      const cow = frame.board.opponent.find((pet) => pet.name === 'Cow');
      expect(pig?.health).toBe(7);
      expect(cow?.health).toBe(0);
    });

    it('paces the cadence by what happened, 0.6 s on a trade and 1.3 s on a faint', () => {
      const timeline = timelineFor('f01-plain-trades');
      const events = readGolden('f01-plain-trades');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      const clashSeqs = events
        .filter((event) => event.type === 'clash')
        .map((event) => event.seq);
      /** Did anything die between this clash and the next one? */
      const deadly = clashSeqs.map((seq, index) => {
        const next = clashSeqs[index + 1] ?? Number.MAX_SAFE_INTEGER;
        return events.some(
          (event) => event.type === 'faint' && event.seq > seq && event.seq < next,
        );
      });
      expect(deadly.filter(Boolean).length).toBeGreaterThan(0);
      expect(deadly.filter((died) => !died).length).toBeGreaterThan(0);

      for (let index = 1; index < clashes.length; index += 1) {
        const gap = clashes[index].contactMs - clashes[index - 1].contactMs;
        if (deadly[index - 1]) {
          // f01 t=29.84 to t=31.16, the faint and the slide inside the beat.
          expect({ index, gap: gap >= 1250 && gap <= 1500 }).toEqual({
            index,
            gap: true,
          });
        } else {
          // f01's back to back trades, 0.59 s apart on the reference clip.
          expect({ index, gap: gap >= 590 && gap <= 700 }).toEqual({
            index,
            gap: true,
          });
        }
      }
    });

    it('outlines both front pets red half a second before the contact frame', () => {
      const timeline = timelineFor('f01-plain-trades');
      const clash = cuesOfKind<ClashCue>(timeline, 'clash')[1];
      const windups = timeline.cues.filter(
        (cue): cue is OutlineCue =>
          cue.kind === 'windupOutline' && cue.seq === clash.seq,
      );
      expect(windups).toHaveLength(2);
      for (const cue of windups) {
        expect(clash.contactMs - cue.startMs).toBeGreaterThanOrEqual(400);
        expect(cue.endMs).toBe(clash.contactMs);
      }
      const frame = new TimelineSampler(timeline).frameAt(clash.contactMs - 300);
      expect(frame.pets.filter((pet) => pet.outline === 'windup')).toHaveLength(2);
    });

    /**
     * The contact frame itself, checklist 1. The reference does not only put a
     * glow between the two pets: it paints the two sprites out in white along
     * their own silhouettes. Measured on the contact band of
     * clips/f01-plain-trades, the near-white pixel count runs 85 through the
     * wind-up (f_00880_0031086), 6985 on the contact frame (f_00882_0031156),
     * 1855 on the next one (f_00883_0031228) and 130 by f_00884_0031277.
     */
    it('paints both combatants out in white on the contact frame', () => {
      const timeline = timelineFor('f01-plain-trades');
      const clash = cuesOfKind<ClashCue>(timeline, 'clash')[1];
      const sampler = new TimelineSampler(timeline);
      const ids = clash.hits.map((hit) => hit.sourceId).sort();
      expect(ids).toHaveLength(2);
      const flashOf = (frame: ReturnType<TimelineSampler['frameAt']>, id: number) =>
        frame.pets.find((pet) => pet.pet.id === id)?.impactFlash;

      // nothing before contact, however deep into the wind-up
      const windup = sampler.frameAt(clash.contactMs - 40);
      for (const id of ids) {
        expect(flashOf(windup, id)).toBe(0);
      }

      // full white on the contact frame, on both of them and on nobody else
      const contact = sampler.frameAt(clash.contactMs);
      for (const id of ids) {
        expect(flashOf(contact, id)).toBe(1);
      }
      expect(
        contact.pets
          .filter((pet) => pet.impactFlash > 0)
          .map((pet) => pet.pet.id)
          .sort(),
      ).toEqual(ids);

      // it fades rather than cutting, and it is over inside two frames
      const half = sampler.frameAt(clash.contactMs + CLASH_WHITEOUT_MS / 2);
      for (const id of ids) {
        expect(flashOf(half, id)).toBeCloseTo(0.5, 2);
      }
      expect(CLASH_WHITEOUT_MS).toBeLessThanOrEqual(140);
      const done = sampler.frameAt(clash.contactMs + CLASH_WHITEOUT_MS);
      expect(done.pets.every((pet) => pet.impactFlash === 0)).toBe(true);
    });

    it('sends only the attacker on a jump, to the target slot and back', () => {
      const timeline = timelineFor('f11-jump-african-wild-dog');
      const jump = cuesOfKind<ClashCue>(timeline, 'clash').find((cue) => cue.jump);
      expect(jump).toBeTruthy();
      const cue = jump as ClashCue;
      expect(cue.hits).toHaveLength(2);
      expect(cue.endMs - cue.startMs).toBeGreaterThan(1200);
      const sampler = new TimelineSampler(timeline);

      const apex = sampler.frameAt((cue.startMs + cue.contactMs) / 2);
      const flyer = apex.pets.find((pet) => pet.pet.id === cue.jumperId);
      const target = apex.pets.find((pet) => pet.pet.id === cue.jumpTargetId);
      /**
       * The height of the arc, read off the apex frame rather than doubled out
       * of the contact one. Tracking the attacker's green outline through
       * clips/f11-jump-african-wild-dog: standing at 0.599 of the play area
       * (f_00830_0029371), apex 0.250 (f_00849_0029941), hitting from 0.465
       * (f_00862_0030453). So the arc rises 0.349 of the play area and the
       * contact hangs 0.134 up it, which is 1.34 and 0.515 of the 0.26 a
       * move's arc rises, and the contact is two fifths of the arc, not half.
       */
      expect(flyer?.lift).toBeCloseTo(JUMP_ARC_LIFT, 5);
      expect(JUMP_ARC_LIFT).toBeCloseTo(1.34, 5);
      expect(JUMP_CONTACT_LIFT / JUMP_ARC_LIFT).toBeCloseTo(0.384, 2);
      // The target never leaves its slot, checklist 14.
      expect(target?.lift).toBe(0);
      expect(target?.lean).toBe(0);

      /**
       * The attacker hits from the air, checklist 14. On the reference contact
       * frame (f11 t=30.45, clips/f11-jump-african-wild-dog/
       * f_00862_0030453.jpg) the African Wild Dog hangs over the otter with its
       * art centred at 0.472 of the play area against the 0.602 a standing pet
       * sits at, half the arc's height, and the otter is still visible under
       * it. A jumper planted in the slot would occlude its own target.
       */
      const contact = sampler.frameAt(cue.contactMs + 1);
      const landed = contact.pets.find((pet) => pet.pet.id === cue.jumperId);
      expect(landed?.lean).toBe(1);
      expect(landed?.lift).toBe(JUMP_CONTACT_LIFT);
      expect(JUMP_CONTACT_LIFT).toBeGreaterThan(0);
      expect(contact.pets.find((pet) => pet.pet.id === cue.jumpTargetId)?.lift).toBe(0);
      // A jump attack is an ability, so its attacker wears the green source
      // outline for the whole of it, not the red one an ordinary front pet
      // takes and not the red one its own counter damage would give it.
      expect(landed?.outline).toBe('source');
      expect(
        sampler.frameAt((cue.startMs + cue.contactMs) / 2).pets.find(
          (pet) => pet.pet.id === cue.jumperId,
        )?.outline,
      ).toBe('source');
      expect(landed?.jumpTargetSlot).toBe(
        contact.pets.find((pet) => pet.pet.id === cue.jumpTargetId)?.slot,
      );
      // The flash is at the target's slot and both numbers are in that frame.
      expect(contact.flash?.aSlot).toBe(contact.flash?.bSlot);
      expect(contact.flash?.aSlot).toBe(landed?.jumpTargetSlot);
      // A jump contact whites the pair out the way a trade's does: on
      // clips/f11-jump-african-wild-dog the band round the target's slot goes
      // from 5.7% near-white to 30.9% on f_00856_0030173 and back under 10%
      // two frames later.
      const struck = sampler.frameAt(cue.contactMs);
      expect(
        struck.pets
          .filter((pet) => pet.impactFlash > 0)
          .map((pet) => pet.pet.id)
          .sort(),
      ).toEqual([cue.jumperId, cue.jumpTargetId].sort());
      expect(contact.popups.filter((popup) => popup.kind === 'damage')).toHaveLength(2);

      const back = sampler.frameAt((cue.returnStartMs + cue.endMs) / 2);
      expect(back.pets.find((pet) => pet.pet.id === cue.jumperId)?.lift).toBeGreaterThan(
        0.8,
      );
      const home = sampler.frameAt(cue.endMs + 10);
      const settled = home.pets.find((pet) => pet.pet.id === cue.jumperId);
      expect(settled?.jumpTargetSlot).toBeNull();
      expect(settled?.lift).toBe(0);
      expect(home.puffs.some((puff) => puff.kind === 'landing')).toBe(true);
    });
  });

  describe('damage popups, checklist 2 and 19', () => {
    it('merges a second hit into a live popup instead of spawning another', () => {
      const stream: AnimationEvent[] = [
        {
          type: 'projectile',
          seq: 0,
          group: 0,
          source: {
            kind: 'pet',
            pet: {
              id: 1,
              name: 'Pig',
              side: 'player',
              index: 0,
              level: 1,
              attack: 4,
              health: 10,
            },
          },
          payload: 'attack-glyph',
          targets: [
            {
              id: 11,
              name: 'Cow',
              side: 'opponent',
              index: 0,
              level: 1,
              attack: 3,
              health: 12,
            },
          ],
        },
        {
          type: 'hit',
          seq: 1,
          group: 0,
          kind: 'snipe',
          source: null,
          target: {
            id: 11,
            name: 'Cow',
            side: 'opponent',
            index: 0,
            level: 1,
            attack: 3,
            health: 12,
          },
          damage: 6,
          blocked: false,
        },
        {
          type: 'hit',
          seq: 2,
          group: 0,
          kind: 'snipe',
          source: null,
          target: {
            id: 11,
            name: 'Cow',
            side: 'opponent',
            index: 0,
            level: 1,
            attack: 3,
            health: 6,
          },
          damage: 6,
          blocked: false,
        },
      ];
      const timeline = buildBattleTimeline(stream, {
        initialBoard: buildSeedBoard(
          [{ name: 'Pig', attack: 4, health: 10 }],
          [{ name: 'Cow', attack: 3, health: 12 }],
        ),
        includeIntro: false,
        includeOutro: false,
      });
      const popups = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup');
      expect(popups).toHaveLength(1);
      expect(popups[0].value).toBe(12);
      expect(popups[0].merges).toBe(1);
    });

    it('fires the merge on the real f01 cadence, 6/4 then 12/8', () => {
      const timeline = timelineFor('f01-plain-trades');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      // The second and third clashes of f01 are the pair with nothing dying
      // between them, which is what puts the second hit inside the first
      // popup's 0.7 s life.
      const first = clashes[1];
      const second = clashes[2];
      expect(second.contactMs - first.contactMs).toBeLessThan(700);

      const sampler = new TimelineSampler(timeline);
      const read = (atMs: number) =>
        sampler
          .frameAt(atMs)
          .popups.filter((popup) => popup.kind === 'damage')
          .map((popup) => popup.text)
          .sort();
      expect(read(first.contactMs + 1)).toEqual(['4', '6']);
      expect(read(second.contactMs + 1)).toEqual(['12', '8']);

      // Two popups, incremented in place, not four spawned.
      const spawned = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup').filter(
        (popup) =>
          popup.startMs >= first.contactMs && popup.startMs <= second.contactMs,
      );
      expect(spawned).toHaveLength(2);
      expect(spawned.map((popup) => popup.merges)).toEqual([1, 1]);
      // A merge does not rewrite the frames the first hit already played.
      expect(spawned.map((popup) => popup.value).sort()).toEqual([12, 8]);
      expect(
        sampler
          .frameAt(second.contactMs - 1)
          .popups.filter((popup) => popup.kind === 'damage')
          .map((popup) => popup.text)
          .sort(),
      ).toEqual(['4', '6']);
      expect(read(second.contactMs + 1).every((text) => text.length > 0)).toBe(true);
      const merged = sampler
        .frameAt(second.contactMs + 1)
        .popups.filter((popup) => popup.kind === 'damage');
      expect(merged.every((popup) => popup.merged)).toBe(true);
    });

    it('starts a fresh popup once the previous one has faded', () => {
      const timeline = timelineFor('f10-hurt-knockout');
      const popups = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup');
      const perPet = new Map<number, DamagePopupCue[]>();
      for (const popup of popups) {
        perPet.set(popup.petId, [...(perPet.get(popup.petId) ?? []), popup]);
      }
      const repeated = [...perPet.values()].find((list) => list.length > 1);
      expect(repeated).toBeTruthy();
      for (const list of perPet.values()) {
        for (let index = 1; index < list.length; index += 1) {
          // A new popup only exists because the previous one had ended.
          expect(list[index].startMs).toBeGreaterThanOrEqual(list[index - 1].endMs);
        }
      }
    });

    it('pops a 0 for a hit the equipment absorbed', () => {
      const timeline = timelineFor('f08-equipment-melon-peanut');
      // The numeral is a running total for the pairing, so a later hit merges
      // into it: what has to be on screen is the 0 in its own frames.
      const blocked = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup').filter(
        (popup) => popup.steps[0].value === 0,
      );
      expect(blocked.length).toBeGreaterThan(0);
      expect(popupValueAt(blocked[0], blocked[0].startMs + 10).value).toBe(0);
    });
  });

  describe('faint and push forward, checklist 3 and 4', () => {
    it('holds every corpse in place until the whole damage step resolves', () => {
      const timeline = timelineFor('f07-pushforward-multi');
      const launches = cuesOfKind<CorpseLaunchCue>(timeline, 'corpseLaunch');
      const byGroup = new Map<string, CorpseLaunchCue[]>();
      for (const launch of launches) {
        byGroup.set(launch.groupId, [...(byGroup.get(launch.groupId) ?? []), launch]);
      }
      const multi = [...byGroup.values()].find((group) => group.length >= 3);
      expect(multi).toBeTruthy();
      const group = multi ?? [];
      for (const launch of group) {
        expect(launch.startMs).toBe(group[0].startMs);
        expect(launch.endMs).toBe(group[0].endMs);
      }
      // Just before the launch the three of them are still standing as corpses.
      const sampler = new TimelineSampler(timeline);
      const frame = sampler.frameAt(group[0].startMs - 1);
      const corpsePets = frame.pets.filter((view) => view.fainted);
      expect(corpsePets.length).toBeGreaterThanOrEqual(3);
      expect(frame.corpses).toHaveLength(0);
    });

    it('holds a lone corpse in its slot for a beat before it launches', () => {
      const timeline = timelineFor('f01-plain-trades');
      const launches = cuesOfKind<CorpseLaunchCue>(timeline, 'corpseLaunch');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      const alone = launches.filter(
        (launch) =>
          launches.filter((other) => other.groupId === launch.groupId).length === 1,
      );
      expect(alone.length).toBeGreaterThan(0);
      const sampler = new TimelineSampler(timeline);
      for (const launch of alone) {
        const killer = [...clashes]
          .reverse()
          .find((clash) => clash.contactMs <= launch.startMs);
        expect(killer).toBeTruthy();
        // Round 9 re-measured this. Checklist 3's "dead in place first" is
        // right, and how long depends on what killed it: a clash throws its
        // loser on the blow, one frame later, and it is a snipe or an ability
        // that leaves the body standing (f01 t=31.82, f02 t=31.75 to 31.78 and
        // f03 t=33.571 to 33.595 are all one frame; f02's sniped worm holds for
        // 890 ms, which the test above covers).
        const hold = launch.startMs - (killer?.contactMs ?? 0);
        expect({ hold: hold >= 0 && hold <= 90 }).toEqual({ hold: true });
        const before = sampler.frameAt(launch.startMs - 10);
        expect(before.pets.some((pet) => pet.pet.id === launch.petId && pet.fainted)).toBe(
          true,
        );
        expect(before.corpses).toHaveLength(0);
      }
    });

    /**
     * Round 9, item 1. How long a body lies in its slot depends on what killed
     * it, and the two cases are almost a second apart.
     *
     * f02: the snipe lands on the worm at t=29.97 and the corpse leaves at
     * 30.86, 890ms later, with the bandage and a health of 0 on screen for all
     * of it. Two clashes later in the same clip the cow is hit at t=31.85 and
     * is airborne by 31.88.
     */
    it('holds a sniped body far longer than a clash death', () => {
      const timeline = timelineFor('f02-snipe-crocodile');
      const launches = cuesOfKind<CorpseLaunchCue>(timeline, 'corpseLaunch');
      const hits = cuesOfKind<ImpactPuffCue>(timeline, 'impactPuff');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      expect(launches.length).toBeGreaterThanOrEqual(2);

      // The first death in f02 is the crocodile's start of battle snipe.
      const sniped = launches[0];
      const arrival = hits.find((cue) => cue.petId === sniped.petId);
      expect(arrival).toBeTruthy();
      expect(sniped.startMs - (arrival?.startMs ?? 0)).toBeGreaterThanOrEqual(880);

      // Every later death in this clip is a clash, and they leave promptly.
      for (const launch of launches.slice(1)) {
        const killer = [...clashes]
          .reverse()
          .find((clash) => clash.contactMs <= launch.startMs);
        expect(killer).toBeTruthy();
        expect(launch.startMs - (killer?.contactMs ?? 0)).toBeLessThan(400);
      }
    });

    /**
     * Round 9, and the thing the 1:1 death strip caught: a body that was not
     * hit at the midline is not thrown anywhere.
     *
     * f02's sniped worm is standing under its bandage at t=30.84 and at 30.88
     * its slot goes bright and blooms one white cloud, which drifts and breaks
     * up in place through 31.5. There is no body crossing the field, no smoke
     * trail and no star spray anywhere in those frames, and f06's sniped otter
     * does exactly the same at t=30.82. Rounds 7 and 8 launched every corpse.
     */
    it('fades a body that nothing threw, and throws only the one a clash did', () => {
      const sniped = timelineFor('f02-snipe-crocodile');
      const launches = cuesOfKind<CorpseLaunchCue>(sniped, 'corpseLaunch');
      expect(launches.length).toBeGreaterThanOrEqual(2);
      // The snipe kill is the first death in this clip and the rest are clashes.
      expect(launches[0].viaClash).toBe(false);
      expect(launches.slice(1).every((cue) => cue.viaClash)).toBe(true);

      // A spray marks where a thrown body left, so the faded one has none.
      const bursts = cuesOfKind<AnimationCue>(sniped, 'starburst');
      expect(bursts.length).toBe(launches.length - 1);
      expect(
        bursts.every((burst) =>
          launches.some(
            (launch) => launch.viaClash && burst.startMs >= launch.startMs,
          ),
        ),
      ).toBe(true);
    });

    /**
     * The launch cue is the whole aftermath, not the flight. On f03 the cow is
     * launched at t=33.59, off screen by 33.83, its trail is gone by 34.00 and
     * the star spray runs 33.93 to 34.34.
     */
    it('runs the launch cue long enough to carry the trail and the spray', () => {
      const timeline = timelineFor('f01-plain-trades');
      const launch = cuesOfKind<CorpseLaunchCue>(timeline, 'corpseLaunch')[0];
      expect(launch.endMs - launch.startMs).toBe(690);
      const burst = cuesOfKind<AnimationCue>(timeline, 'starburst').find(
        (cue) => cue.startMs >= launch.startMs && cue.endMs <= launch.endMs,
      );
      expect(burst).toBeTruthy();
      expect((burst?.startMs ?? 0) - launch.startMs).toBe(340);
      expect(burst?.endMs).toBe(launch.endMs);
    });

    it('slides the survivors while the corpses are still in the air', () => {
      const timeline = timelineFor('f01-plain-trades');
      const launches = cuesOfKind<CorpseLaunchCue>(timeline, 'corpseLaunch');
      const slides = cuesOfKind<SlideCue>(timeline, 'slide');
      expect(slides.length).toBeGreaterThan(0);
      for (const slide of slides) {
        const overlapping = launches.find(
          (launch) =>
            launch.side === slide.side &&
            slide.startMs >= launch.startMs &&
            slide.startMs < launch.endMs,
        );
        expect(overlapping).toBeTruthy();
      }
    });

    it('makes N simultaneous deaths one slide, not N', () => {
      const timeline = timelineFor('f07-pushforward-multi');
      const pushSteps = timeline.steps.filter((step) => step.kind === 'pushForward');
      const slides = cuesOfKind<SlideCue>(timeline, 'slide');
      const startTimes = new Set(slides.map((slide) => slide.startMs));
      expect(startTimes.size).toBeLessThanOrEqual(pushSteps.length);
      const multiSlot = slides.find((slide) => slide.fromIndex - slide.toIndex > 1);
      expect(multiSlot).toBeTruthy();
    });
  });

  describe('projectiles, checklist 5, 6 and 15', () => {
    it('throws the icon of what is being delivered, one per target', () => {
      const timeline = timelineFor('f07-pushforward-multi');
      const projectiles = cuesOfKind<ProjectileCue>(timeline, 'projectile');
      expect(projectiles.length).toBeGreaterThan(0);
      const area = projectiles.find((cue) => cue.targets.length > 1);
      expect(area).toBeTruthy();
      expect(area?.payload).toBe('attack-glyph');
    });

    it('keeps the flight the same length whatever the distance', () => {
      const near = cuesOfKind<ProjectileCue>(
        timelineFor('f06-snipe-dolphin'),
        'projectile',
      )[0];
      const far = cuesOfKind<ProjectileCue>(
        timelineFor('f02-snipe-crocodile'),
        'projectile',
      )[0];
      expect(near.endMs - near.startMs).toBe(far.endMs - far.startMs);
      // Round 9, measured: f02's rock is first visible at t=29.509 and the
      // damage numeral is in the frame at 29.924, with the rock last seen at
      // 29.904, so about 414ms; f06 throws a third further and takes 390.
      expect(near.endMs - near.startMs).toBe(410);
    });

    /**
     * Checklist 5, round 9. The engine calls a snipe and an attack buff the
     * same payload and the client does not: f02 t=29.7 throws the grey damage
     * rock and f10 t=34.4 throws the fist and the heart, so the director has to
     * say which one a throw is.
     */
    it('marks a throw that delivers damage apart from one that delivers a buff', () => {
      const snipe = cuesOfKind<ProjectileCue>(
        timelineFor('f02-snipe-crocodile'),
        'projectile',
      )[0];
      expect(snipe.payload).toBe('attack-glyph');
      expect(snipe.damage).toBe(true);

      const buffs = cuesOfKind<ProjectileCue>(
        timelineFor('f10-hurt-knockout'),
        'projectile',
      ).filter((cue) => cue.payload === 'attack-glyph');
      expect(buffs.length).toBeGreaterThan(0);
      expect(buffs.every((cue) => cue.damage === false)).toBe(true);
    });

    /**
     * Round 9, item 4. A reward of attack and health at once is one object in
     * the client, not two: on f10 the Hippo's knock-out reward falls between
     * t=34.19 and t=34.53 as a single sprite with the heart behind the fist.
     * Ours threw the fist, waited out the stagger, then threw the heart.
     */
    it('throws a two part reward as one object', () => {
      const timeline = timelineFor('f10-hurt-knockout');
      const projectiles = cuesOfKind<ProjectileCue>(timeline, 'projectile');
      const paired = projectiles.filter((cue) => cue.pairedPayload != null);
      expect(paired.length).toBeGreaterThan(0);
      for (const cue of paired) {
        expect(new Set([cue.payload, cue.pairedPayload])).toEqual(
          new Set(['attack-glyph', 'heart']),
        );
      }
      // And there is no second throw hiding behind the first.
      const hearts = projectiles.filter((cue) => cue.payload === 'heart');
      expect(hearts).toHaveLength(0);
    });

    /**
     * A stat gain arrives in a white bloom the way mana does: f10 t=34.53 paints
     * the Hippo out white as the reward lands.
     */
    it('lands a stat gain in a white flash on the pet', () => {
      const timeline = timelineFor('f10-hurt-knockout');
      const puffs = cuesOfKind<ImpactPuffCue>(timeline, 'impactPuff').filter(
        (cue) => cue.variant === 'buff',
      );
      expect(puffs.length).toBeGreaterThan(0);
      const pills = cuesOfKind<StatPillCue>(timeline, 'statPill').filter(
        (cue) => cue.statKind === 'attack' && cue.amount > 0,
      );
      expect(pills.length).toBeGreaterThan(0);
      for (const pill of pills) {
        expect(
          puffs.some((puff) => puff.petId === pill.petId && puff.startMs === pill.startMs),
        ).toBe(true);
      }
    });

    it('lands every popup of an area effect in one frame', () => {
      const timeline = timelineFor('f07-pushforward-multi');
      const sampler = new TimelineSampler(timeline);
      const area = cuesOfKind<ProjectileCue>(timeline, 'projectile').find(
        (cue) => cue.targets.length > 1,
      );
      expect(area).toBeTruthy();
      const frame = sampler.frameAt((area?.endMs ?? 0) + 1);
      const damagePopups = frame.popups.filter((popup) => popup.kind === 'damage');
      expect(damagePopups.length).toBeGreaterThanOrEqual(
        Math.min(3, area?.targets.length ?? 0),
      );
    });

    it('puts the projectile immediately before what it delivers', () => {
      for (const id of fixtureIds) {
        const timeline = timelineFor(id);
        for (const projectile of cuesOfKind<ProjectileCue>(timeline, 'projectile')) {
          const delivered = timeline.cues.filter(
            (cue) =>
              cue.group === projectile.group &&
              cue.seq === projectile.seq + 1 &&
              (cue.kind === 'damagePopup' ||
                cue.kind === 'statPill' ||
                cue.kind === 'statCopyLabel' ||
                cue.kind === 'xpBurst' ||
                cue.kind === 'equipmentGain' ||
                cue.kind === 'moveArc' ||
                cue.kind === 'trumpetToken'),
          );
          for (const cue of delivered) {
            expect(cue.startMs).toBeGreaterThanOrEqual(projectile.endMs);
          }
        }
      }
    });
  });

  describe('summon, transform and move, checklist 7, 8 and 9', () => {
    it('stages two summons from one ability about 0.3 s apart', () => {
      const timeline = timelineFor('f04-summon-sheep');
      const puffs = timeline.cues.filter((cue) => cue.kind === 'summonPuff');
      expect(puffs).toHaveLength(2);
      expect(puffs[1].startMs - puffs[0].startMs).toBe(300);
    });

    it('draws the transformed pet its own banner, so a transform is two events', () => {
      const timeline = timelineFor('f05-transform-caterpillar');
      const banners = cuesOfKind<BannerCue>(timeline, 'banner');
      expect(banners.map((banner) => banner.name)).toEqual([
        'Caterpillar',
        'Butterfly',
      ]);
      expect(timeline.cues.some((cue) => cue.kind === 'transformPuff')).toBe(true);
      expect(timeline.cues.some((cue) => cue.kind === 'statCopyLabel')).toBe(true);
    });

    it('holds a move buff until a beat after the moved pet has landed', () => {
      const timeline = timelineFor('f09-toy-pogo-stick');
      const move = cuesOfKind<MoveArcCue>(timeline, 'moveArc')[0];
      const pills = cuesOfKind<StatPillCue>(timeline, 'statPill').filter(
        (pill) => pill.petId === move.petId,
      );
      // f09 t=30.08 airborne, t=31.20 the buff, so about 1 s after the landing.
      expect(pills).toHaveLength(2);
      for (const pill of pills) {
        expect(pill.startMs - move.endMs).toBeGreaterThanOrEqual(1000);
      }
      const sampler = new TimelineSampler(timeline);
      const midFlight = sampler.frameAt((move.startMs + move.endMs) / 2);
      expect(midFlight.popups).toHaveLength(0);
    });

    it('arcs a repositioned pet over its neighbours and closes them up', () => {
      const timeline = timelineFor('f16-move-chihuahua');
      const move = cuesOfKind<MoveArcCue>(timeline, 'moveArc')[0];
      expect(move).toBeTruthy();
      expect(move.toIndex).not.toBe(move.fromIndex);
      const displaced = cuesOfKind<SlideCue>(timeline, 'slide').filter(
        (slide) => slide.startMs === move.startMs,
      );
      expect(displaced.length).toBeGreaterThan(0);
      const sampler = new TimelineSampler(timeline);
      const midFlight = sampler.frameAt((move.startMs + move.endMs) / 2);
      const flying = midFlight.pets.find((view) => view.pet.id === move.petId);
      expect(flying?.lift).toBeGreaterThan(0.5);
    });
  });

  describe('banner, checklist 11', () => {
    it('repeats per activation rather than being reused', () => {
      const timeline = timelineFor('f10-hurt-knockout');
      const banners = cuesOfKind<BannerCue>(timeline, 'banner');
      const events = readGolden('f10-hurt-knockout').filter(
        (event) => event.type === 'abilityTrigger',
      );
      expect(banners).toHaveLength(events.length);
      const peacock = banners.filter((banner) => banner.name === 'Peacock');
      expect(peacock.length).toBeGreaterThanOrEqual(2);
    });

    it('leads the effect and outlines its source green', () => {
      const timeline = timelineFor('f02-snipe-crocodile');
      const banner = cuesOfKind<BannerCue>(timeline, 'banner')[0];
      const projectile = cuesOfKind<ProjectileCue>(timeline, 'projectile')[0];
      expect(projectile.startMs - banner.startMs).toBe(450);
      const sampler = new TimelineSampler(timeline);
      const frame = sampler.frameAt(banner.startMs + 10);
      expect(frame.banner?.name).toBe('Crocodile');
      expect(frame.pets.some((pet) => pet.outline === 'source')).toBe(true);
    });

    it('uses the same banner for a toy, with no pet source', () => {
      const timeline = timelineFor('f09-toy-pogo-stick');
      const banner = cuesOfKind<BannerCue>(timeline, 'banner')[0];
      expect(banner.actorKind).toBe('toy');
      expect(banner.petId).toBeNull();
    });

    it('lays the card out as trigger, inline glyphs, uses tab and perk note', () => {
      const knockOut = parseBannerText(
        'Knock out: Gain +3 attack and +3 health. Works 3 times per battle.',
      );
      expect(knockOut.trigger).toBe('Knock out');
      expect(knockOut.uses).toBe('3 / battle');
      expect(knockOut.note).toBeNull();
      const whole = (parsed: { body: Array<{ text: string; tail: string }> }): string =>
        parsed.body.map((segment) => segment.text + segment.tail).join('');
      expect(knockOut.body.map((segment) => segment.icon).filter(Boolean)).toEqual([
        'attack-glyph',
        'heart',
      ]);
      expect(whole(knockOut)).toBe('Gain +3 attack and +3 health.');
      // The glyph goes on the amount, and the amount is held on the glyph's own
      // line so no icon ever wraps by itself.
      expect(knockOut.body[0].text).toBe('Gain ');
      expect(knockOut.body[0].tail).toBe('+3 ');

      const perk = parseBannerText(
        'Hurt: Gain Coconut perk. Works 1 time per turn.\nBlock damage, once.',
      );
      expect(perk.uses).toBe('1 / turn');
      expect(perk.note).toBe('Block damage, once.');
      expect(whole(perk)).toBe('Gain Coconut perk.');
      // A perk is named rather than counted, so it keeps its glyph.
      expect(perk.body.map((segment) => segment.icon).filter(Boolean)).toEqual([
        'perk-icon',
      ]);
    });

    /**
     * The verb is not the stat. On the reference card f11 t=30.45 the rules
     * read "Start of battle -> Jump attack the second enemy for 3 [rock]
     * damage.", one rock, on the amount. Round 4 drew two, and the second one
     * wrapped onto a line of its own under the card.
     */
    it('puts one glyph on the amount, not one on every stat word', () => {
      const jump = parseBannerText(
        'Start of battle: Jump attack the second enemy for 3 damage.',
      );
      expect(jump.trigger).toBe('Start of battle');
      const icons = jump.body.map((segment) => segment.icon).filter(Boolean);
      expect(icons).toEqual(['attack-glyph']);
      const carrier = jump.body.find((segment) => segment.icon != null);
      expect(carrier?.text).toBe('Jump attack the second enemy for ');
      expect(carrier?.tail).toBe('3 ');
      expect(
        jump.body.map((segment) => segment.text + segment.tail).join(''),
      ).toBe('Jump attack the second enemy for 3 damage.');
    });

    it('parses every banner the fixtures actually raise', () => {
      for (const id of fixtureIds) {
        for (const banner of cuesOfKind<BannerCue>(timelineFor(id), 'banner')) {
          const parsed = parseBannerText(banner.text, banner.trigger);
          expect({ id, name: banner.name, trigger: parsed.trigger != null }).toEqual({
            id,
            name: banner.name,
            trigger: true,
          });
          expect(parsed.body.some((segment) => segment.text.includes('Works'))).toBe(
            false,
          );
        }
      }
    });
  });

  describe('trumpets, mana and xp, checklist 14 and 19', () => {
    it('flies a token from the banner to the counter on a gain', () => {
      const timeline = timelineFor('f12-trumpets-groundhog');
      const tokens = timeline.cues.filter((cue) => cue.kind === 'trumpetToken');
      expect(tokens).toHaveLength(1);
      expect(tokens[0].kind === 'trumpetToken' && tokens[0].direction).toBe(
        'to-counter',
      );
      const flash = timeline.cues.find((cue) => cue.kind === 'trumpetCounterFlash');
      expect(flash && flash.kind === 'trumpetCounterFlash' && flash.tone).toBe('gain');
      expect(timeline.finalBoard.trumpets.player + timeline.finalBoard.trumpets.opponent)
        .toBeGreaterThan(0);
    });

    it('spends with exactly one token, at the instant the counter drops', () => {
      const timeline = timelineFor('f15-trumpet-spend-nyala-nurseshark');
      const tokens = timeline.cues.filter(
        (cue): cue is TrumpetTokenCue =>
          cue.kind === 'trumpetToken' && cue.direction === 'to-pet',
      );
      // Six trumpets are one token, checklist 19.
      expect(tokens).toHaveLength(1);
      const spendFlash = timeline.cues.find(
        (cue): cue is TrumpetCounterFlashCue =>
          cue.kind === 'trumpetCounterFlash' && cue.tone === 'spend',
      );
      expect(spendFlash).toBeTruthy();
      // The token leaves as the counter flashes and drops 8 to 2, in one step.
      expect(tokens[0].startMs).toBe(spendFlash?.startMs);
      expect(spendFlash?.total).toBe(2);
      // Nothing else is thrown for the trumpets: the counter owns their motion.
      expect(
        cuesOfKind<ProjectileCue>(timeline, 'projectile').some(
          (cue) => cue.payload === 'trumpet',
        ),
      ).toBe(false);
      const frame = new TimelineSampler(timeline).frameAt(
        (spendFlash?.startMs ?? 0) + 10,
      );
      expect(frame.trumpetTokens).toHaveLength(1);
      expect(frame.trumpets.player.total).toBe(2);
      // The effect the trumpets paid for is an ordinary snipe, one beat later.
      const snipe = cuesOfKind<ProjectileCue>(timeline, 'projectile').find(
        (cue) => cue.startMs > (spendFlash?.startMs ?? 0),
      );
      expect(snipe).toBeTruthy();
      expect((snipe?.startMs ?? 0) - (spendFlash?.startMs ?? 0)).toBeGreaterThan(700);
    });

    it('carries mana as a blue numeral with a flash and as a stat on the pet', () => {
      const timeline = timelineFor('f13-mana-alchemedes');
      const manaPills = cuesOfKind<StatPillCue>(timeline, 'statPill').filter(
        (cue) => cue.statKind === 'mana',
      );
      expect(manaPills.length).toBeGreaterThan(0);
      const frame = new TimelineSampler(timeline).frameAt(manaPills[0].startMs + 10);
      expect(frame.popups.some((popup) => popup.kind === 'mana')).toBe(true);
      expect(frame.puffs.some((puff) => puff.kind === 'mana')).toBe(true);
      expect(
        timeline.finalBoard.player.some((pet) => (pet.mana ?? 0) > 0) ||
          timeline.finalBoard.opponent.some((pet) => (pet.mana ?? 0) > 0),
      ).toBe(true);
    });

    it('lays a two part buff out side by side rather than stacked', () => {
      const timeline = timelineFor('f10-hurt-knockout');
      const pills = cuesOfKind<StatPillCue>(timeline, 'statPill');
      const pair = pills
        .map((pill, index) => [
          pill,
          pills
            .slice(index + 1)
            .find((other) => other.petId === pill.petId && other.startMs < pill.endMs),
        ])
        .find((entry) => entry[1]) as [StatPillCue, StatPillCue] | undefined;
      expect(pair).toBeTruthy();
      const [attack, health] = pair as [StatPillCue, StatPillCue];
      expect(attack.statKind).toBe('attack');
      expect(health.statKind).toBe('health');
      const frame = new TimelineSampler(timeline).frameAt(health.startMs + 10);
      // Round 9 folded the two throws into one object, so both pills now land
      // on the same frame and a damage numeral from the clash that caused them
      // can still be alive beside them. What this asserts is the two halves of
      // the reward standing apart, which is what checklist 15 is about.
      const together = frame.popups.filter(
        (popup) => popup.petId === attack.petId && popup.kind === 'stat',
      );
      expect(together).toHaveLength(2);
      expect(new Set(together.map((popup) => popup.offset)).size).toBe(2);
    });

    it('draws xp as a level-up burst rather than a stat pill', () => {
      const timeline = timelineFor('f14-xp-pug');
      const bursts = timeline.cues.filter((cue) => cue.kind === 'xpBurst');
      expect(bursts).toHaveLength(1);
      expect(
        cuesOfKind<StatPillCue>(timeline, 'statPill').some(
          (cue) => cue.statKind === 'exp',
        ),
      ).toBe(false);
      const sampler = new TimelineSampler(timeline);
      const frame = sampler.frameAt(bursts[0].startMs + 10);
      expect(frame.board.xpInPlay).toBe(true);
    });
  });

  describe('equipment, checklist 10', () => {
    it('shatters what the hit consumed and wears what was granted', () => {
      const broken = timelineFor('f08-equipment-melon-peanut');
      expect(broken.cues.some((cue) => cue.kind === 'equipmentBreak')).toBe(true);
      const gained = timelineFor('f10-hurt-knockout');
      const gain = gained.cues.find((cue) => cue.kind === 'equipmentGain');
      const shatter = gained.cues.find((cue) => cue.kind === 'equipmentBreak');
      expect(gain).toBeTruthy();
      expect(shatter).toBeTruthy();
      // Worn from the moment it is delivered until the hit it absorbs.
      const sampler = new TimelineSampler(gained);
      const worn = sampler
        .frameAt((gain?.startMs ?? 0) + 10)
        .board.player.find((pet) => pet.name === 'Gorilla');
      expect(worn?.equipment).toBe('Coconut');
      const after = sampler
        .frameAt((shatter?.startMs ?? 0) + 10)
        .board.player.find((pet) => pet.name === 'Gorilla');
      expect(after?.equipment).toBeNull();
    });
  });

  describe('board reconstruction against the recorded outcomes', () => {
    const expected: Array<[string, AnimationSide, string[]]> = [
      ['f01-plain-trades', 'player', ['Swan 2/7']],
      ['f03-faint-chain', 'player', ['Pig 5/4']],
      ['f08-equipment-melon-peanut', 'player', ['Duck 4/1']],
      ['f10-hurt-knockout', 'player', ['Gorilla 7/1']],
    ];

    for (const [id, side, want] of expected) {
      it(`${id} ends with ${want.join(', ')}`, () => {
        const timeline = timelineFor(id);
        expect(survivors(timeline.finalBoard, side)).toEqual(want);
      });
    }

    it('f02 leaves Crocodile 8/1 and Pig 3/10 with the enemy board wiped', () => {
      const timeline = timelineFor('f02-snipe-crocodile');
      expect(survivors(timeline.finalBoard, 'player')).toEqual([
        'Crocodile 8/1',
        'Pig 3/10',
      ]);
      expect(survivors(timeline.finalBoard, 'opponent')).toEqual([]);
    });

    it('agrees with the winner the stream reports', () => {
      for (const id of fixtureIds) {
        const timeline = timelineFor(id);
        if (timeline.winner === 'draw' || timeline.winner == null) {
          continue;
        }
        const winners = survivors(timeline.finalBoard, timeline.winner);
        const losers = survivors(
          timeline.finalBoard,
          timeline.winner === 'player' ? 'opponent' : 'player',
        );
        expect({ id, winners: winners.length > 0, losers: losers.length }).toEqual({
          id,
          winners: true,
          losers: 0,
        });
      }
    });
  });

  describe('FAST is a second grammar, checklist 16', () => {
    it('suppresses the banner and puts an icon over the acting pet', () => {
      const fast = timelineFor('f10-hurt-knockout', 'fast');
      expect(fast.cues.some((cue) => cue.kind === 'banner')).toBe(false);
      expect(fast.cues.some((cue) => cue.kind === 'fastIcon')).toBe(true);
      expect(fast.cues.some((cue) => cue.kind === 'projectile')).toBe(false);
    });

    it('keeps the clash, the corpse and the slide', () => {
      const fast = timelineFor('f01-plain-trades', 'fast');
      expect(fast.cues.some((cue) => cue.kind === 'clash')).toBe(true);
      expect(fast.cues.some((cue) => cue.kind === 'corpseLaunch')).toBe(true);
      expect(fast.cues.some((cue) => cue.kind === 'slide')).toBe(true);
      expect(fast.cues.some((cue) => cue.kind === 'damagePopup')).toBe(true);
    });

    it('collapses per target staging into one frame', () => {
      const fast = timelineFor('f04-summon-sheep', 'fast');
      const puffs = fast.cues.filter((cue) => cue.kind === 'summonPuff');
      expect(puffs).toHaveLength(2);
      expect(puffs[0].startMs).toBe(puffs[1].startMs);
    });

    it('runs about 2.5 times faster over the recorded fixtures', () => {
      const measured = [
        'f01-plain-trades',
        'f02-snipe-crocodile',
        'f04-summon-sheep',
        'f05-transform-caterpillar',
        'f09-toy-pogo-stick',
        'f10-hurt-knockout',
        'f11-jump-african-wild-dog',
        'f12-trumpets-groundhog',
        'f13-mana-alchemedes',
        'f14-xp-pug',
      ];
      let normalTotal = 0;
      let fastTotal = 0;
      for (const id of measured) {
        const normal = timelineFor(id).durationMs;
        const fast = timelineFor(id, 'fast').durationMs;
        normalTotal += normal;
        fastTotal += fast;
        expect(normal / fast).toBeGreaterThan(2.1);
        expect(normal / fast).toBeLessThan(3.1);
      }
      // The clips total 86.67 s normal and 34.08 s fast, which is 2.54x.
      const ratio = normalTotal / fastTotal;
      expect(ratio).toBeGreaterThan(2.35);
      expect(ratio).toBeLessThan(2.65);
      expect(fastTotal / 1000).toBeGreaterThan(34.08 * 0.95);
      expect(fastTotal / 1000).toBeLessThan(34.08 * 1.05);
    });
  });

  describe('entrance and end screen, checklist 18', () => {
    it('wraps the battle in the entrance and the end screen', () => {
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      expect(timeline.introEndMs).toBe(9030);
      for (const cue of timeline.cues) {
        expect(cue.startMs).toBeGreaterThanOrEqual(timeline.introEndMs);
      }
      const sampler = new TimelineSampler(timeline);
      expect(sampler.frameAt(100).phase).toBe('intro');
      expect(sampler.frameAt(timeline.introEndMs + 10).phase).toBe('battle');
      const outro = sampler.frameAt(timeline.battleEndMs + 3200);
      expect(outro.phase).toBe('outro');
      expect(outro.outro?.winner).toBe('player');
      expect(outro.outro?.face).toBeGreaterThan(0);
    });

    it('brings the control bar in 1.5 s before the first wind-up and takes it away at the end', () => {
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      const sampler = new TimelineSampler(timeline);
      // Checklist 17: the bar is not on screen from the first frame.
      expect(sampler.frameAt(0).controls).toBe(0);
      expect(sampler.frameAt(INTRO_BEATS.controlsMs - 10).controls).toBe(0);
      expect(sampler.frameAt(INTRO_BEATS.controlsMs + 400).controls).toBe(1);
      const windup = cuesOfKind<ClashCue>(timeline, 'clash')[0].startMs;
      expect(windup - INTRO_BEATS.controlsMs).toBeGreaterThanOrEqual(1400);
      expect(windup - INTRO_BEATS.controlsMs).toBeLessThanOrEqual(1700);
      expect(sampler.frameAt(timeline.battleEndMs - 10).controls).toBe(1);
      // And it goes the moment the battle ends.
      expect(sampler.frameAt(timeline.battleEndMs + 10).controls).toBe(0);
    });
  });

  describe('transport, checklist 17', () => {
    const timeline = timelineFor('f01-plain-trades');

    it('freezes in place on pause and resumes from exactly there', () => {
      let state = play(initialPlayback(), timeline);
      state = advancePlayback(state, timeline, 900);
      const paused = pause(state);
      const frozen = advancePlayback(paused, timeline, 5000);
      expect(frozen.timeMs).toBe(paused.timeMs);
      const resumed = advancePlayback(play(frozen, timeline), timeline, 100);
      expect(resumed.timeMs).toBe(paused.timeMs + 100);
    });

    it('abandons the rest of the animation in about 0.8 s on skip', () => {
      let state = play(initialPlayback(), timeline);
      state = advancePlayback(state, timeline, 1200);
      const pressedAt = state.timeMs;
      state = skip(state, timeline);
      // Checklist 17: the beat in flight plays out at the ordinary speed, so
      // the clock creeps rather than warping through the clashes that are
      // never going to be shown.
      state = advancePlayback(state, timeline, 400);
      expect(state.timeMs).toBe(pressedAt + 400);
      state = advancePlayback(state, timeline, 399);
      expect(state.timeMs).toBe(pressedAt + 799);
      expect(state.timeMs).toBeLessThan(timeline.battleEndMs);
      // Then the board is straight on its final state.
      state = advancePlayback(state, timeline, 2);
      expect(state.timeMs).toBe(timeline.battleEndMs);
      const sampler = new TimelineSampler(timeline);
      expect(sampler.frameAt(state.timeMs).board).toEqual(timeline.finalBoard);
      // And the end screen runs, with the bar gone (checklist 18).
      const outro = sampler.frameAt(timeline.battleEndMs + 3200);
      expect(outro.phase).toBe('outro');
      expect(outro.controls).toBe(0);
    });

    /**
     * REWIND restarts the whole animation, checklist 17.
     *
     * Measured on the reference strip rather than assumed: the press lands at
     * t=21.9 and the very next frames are the entrance again, the screen black,
     * then the field opening out of the shutter band at t=22.10 and the team
     * banners back at t=22.81 (clips/ctl-rewind/,
     * out/ctl-rewind_filmstrip.jpg frames 00 to 07). It is not a step back to
     * the previous board and it does not park the transport.
     */
    /** The whole animation, entrance and end screen included, as it is played. */
    const wholeTimeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
      initialBoard: seedFor('f01-plain-trades'),
    });

    it('restarts from the first frame of the entrance, playing', () => {
      const sampler = new TimelineSampler(wholeTimeline);
      expect(wholeTimeline.introEndMs).toBeGreaterThan(0);
      let state = play(initialPlayback(), wholeTimeline);
      state = advancePlayback(state, wholeTimeline, wholeTimeline.introEndMs + 6000);
      expect(state.timeMs).toBeGreaterThan(wholeTimeline.introEndMs);
      expect(sampler.frameAt(state.timeMs).phase).toBe('battle');

      state = rewind(state, wholeTimeline);
      expect(state.timeMs).toBe(0);
      expect(state.playing).toBe(true);
      expect(state.finished).toBe(false);
      expect(sampler.frameAt(state.timeMs).phase).toBe('intro');

      // And the clock actually runs on from there rather than freezing.
      const running = advancePlayback(state, wholeTimeline, 120);
      expect(running.playing).toBe(true);
      expect(running.timeMs).toBe(120);
    });

    it('restarts from the end screen too, so the outro is reachable again', () => {
      const sampler = new TimelineSampler(wholeTimeline);
      let state = {
        ...initialPlayback(),
        timeMs: wholeTimeline.durationMs,
        finished: true,
      };
      expect(sampler.frameAt(state.timeMs).phase).toBe('outro');
      state = rewind(state, wholeTimeline);
      expect(state.timeMs).toBe(0);
      expect(sampler.frameAt(state.timeMs).phase).toBe('intro');
      expect(state.playing).toBe(true);
      // Long enough to have run the battle out and be back on the end screen.
      const replayed = advancePlayback(
        state,
        wholeTimeline,
        wholeTimeline.durationMs + 1000,
      );
      expect(sampler.frameAt(replayed.timeMs).phase).toBe('outro');
    });

    it('buys one beat on a restart when AUTOPLAY is off', () => {
      const state = rewind(
        { ...initialPlayback(), timeMs: timeline.durationMs },
        timeline,
        false,
      );
      expect(state.timeMs).toBe(0);
      expect(state.playing).toBe(true);
      expect(state.stopAtMs).toBe(nextCheckpointMs(timeline, 0));
      expect(rewind(initialPlayback(), timeline, true).stopAtMs).toBeNull();
    });

    it('leaves the board-state walk available for the scrubber', () => {
      const states = boardStateTimes(timeline);
      expect(states.length).toBeGreaterThan(4);
      expect(previousBoardStateMs(timeline, states[3] + 5)).toBe(states[2]);
      expect(previousBoardStateMs(timeline, states[0])).toBe(states[0]);
    });

    it('advances one beat per press with AUTOPLAY off, and runs on with it on', () => {
      let stepwise = play(initialPlayback(), timeline, false);
      expect(stepwise.stopAtMs).toBe(nextCheckpointMs(timeline, 0));
      stepwise = advancePlayback(stepwise, timeline, 100000);
      expect(stepwise.playing).toBe(false);
      expect(stepwise.timeMs).toBe(nextCheckpointMs(timeline, 0));
      const firstBeat = stepwise.timeMs;
      stepwise = advancePlayback(play(stepwise, timeline, false), timeline, 100000);
      expect(stepwise.playing).toBe(false);
      expect(stepwise.timeMs).toBeGreaterThan(firstBeat);

      let continuous = play(initialPlayback(), timeline, true);
      expect(continuous.stopAtMs).toBeNull();
      continuous = advancePlayback(continuous, timeline, 100000);
      expect(continuous.timeMs).toBe(timeline.durationMs);
    });

    it('applies the speed multiplier on top of the grammar', () => {
      let state = { ...play(initialPlayback(), timeline), speed: 2 };
      state = advancePlayback(state, timeline, 500);
      expect(state.timeMs).toBe(1000);
    });
  });

  describe('W3 round 3 fixes', () => {
    it('carries the level-up onto the pet the plaque and the pills show', () => {
      // Checklist 14: xp is one gold burst, so the engine draws no attack and
      // no health pill for it. The board still has to move, or the Pig reads
      // its old 4/14 while its damage numeral is already the new 6.
      const timeline = timelineFor('f14-xp-pug');
      const sampler = new TimelineSampler(timeline);
      const burst = timeline.steps.find((step) => step.kind === 'statChange');
      const pigAt = (timeMs: number) => {
        const pig = sampler.frameAt(timeMs).board.player.find((p) => p.name === 'Pig');
        return `${pig?.level} ${pig?.attack}/${pig?.health}`;
      };
      expect(burst).toBeTruthy();
      expect(pigAt(burst!.commitMs - 1)).toBe('1 4/14');
      expect(pigAt(burst!.commitMs)).toBe('2 6/16');
      const firstClash = timeline.steps.find((step) => step.kind === 'clash');
      expect(pigAt(firstClash!.commitMs)).toBe('2 6/13');
    });

    it('anchors a damage numeral to the pet, not to the slot it left', () => {
      const timeline = timelineFor('f11-jump-african-wild-dog');
      const jump = cuesOfKind<ClashCue>(timeline, 'clash').find((cue) => cue.jump);
      expect(jump).toBeTruthy();
      const frame = new TimelineSampler(timeline).frameAt(jump!.contactMs);
      const dog = frame.popups.find((popup) => popup.petId === jump!.jumperId);
      const otter = frame.popups.find((popup) => popup.petId === jump!.jumpTargetId);
      expect(dog).toBeTruthy();
      expect(otter).toBeTruthy();
      // The attacker is at the target's slot at the contact frame, so its own
      // counter-attack numeral is there too, inside the flash.
      expect(dog!.anchor.jumpTargetSide).toBe(otter!.anchor.side);
      expect(dog!.anchor.jumpTargetSlot).toBe(otter!.anchor.slot);
      expect(dog!.anchor.lean).toBe(1);
      // The target never leaves its slot, so its numeral does not move.
      expect(otter!.anchor.jumpTargetSlot).toBeNull();
      expect(otter!.anchor.lean).toBe(0);
      expect(frame.flash?.aSlot).toBe(otter!.anchor.slot);
      expect(frame.flash?.aSide).toBe(otter!.anchor.side);
      // Both numerals are in that one frame, so they sit side by side rather
      // than exactly on top of each other (checklist 14).
      expect(dog!.offset).not.toBe(otter!.offset);
      expect(Math.abs(dog!.offset - otter!.offset)).toBe(1);
    });

    it('keeps a popup readable under FAST instead of scaling its life', () => {
      // A lifetime is not a beat: scaled by the speed factor it would be
      // 0.32 s, too short to read and short enough to lose merges that the
      // normal grammar makes.
      // 870 ms, measured on f02: the "8" appears at t=29.971 and its last frame
      // is 30.840.
      expect(getBeats('normal').damagePopupMs).toBe(870);
      expect(getBeats('fast').damagePopupMs).toBeGreaterThanOrEqual(350);
      expect(getBeats('fast').statPillMs).toBe(getBeats('fast').damagePopupMs);
    });

    it('keeps the knockout chain on the trade cadence, so the last pair merges', () => {
      for (const mode of ['normal', 'fast'] as const) {
        const timeline = timelineFor('f10-hurt-knockout', mode);
        const contacts = cuesOfKind<ClashCue>(timeline, 'clash').map(
          (cue) => cue.contactMs,
        );
        // A shattered perk is a reaction drawn on the pet, and nothing waits
        // for it, so the beat is the plain trade cadence and not 0.85 s.
        const last = contacts[contacts.length - 1] - contacts[contacts.length - 2];
        expect(last).toBeLessThanOrEqual(getBeats(mode).damagePopupMs);
        expect(last).toBeCloseTo(getBeats(mode).clashCadenceMs, -1);

        const merged = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup').filter(
          (popup) => popup.startMs >= contacts[contacts.length - 2],
        );
        expect(merged.map((popup) => popup.value).sort((a, b) => a - b)).toEqual([
          2, 14,
        ]);
        for (const popup of merged) {
          expect(popup.merges).toBe(1);
        }
      }
    });

    it('lands repeated reactions in one frame under FAST', () => {
      // Checklist 16: both Horses answer both Rams in the same frame, against
      // two staged beats at normal speed.
      const pills = (mode: 'normal' | 'fast') =>
        cuesOfKind<StatPillCue>(timelineFor('f04-summon-sheep', mode), 'statPill')
          .filter((cue) => cue.statKind === 'attack' && cue.amount === 1)
          .map((cue) => cue.startMs);
      const fast = pills('fast');
      expect(fast).toHaveLength(2);
      expect(fast[0]).toBe(fast[1]);
      const normal = pills('normal');
      expect(normal).toHaveLength(2);
      expect(normal[1]).toBeGreaterThan(normal[0]);
    });
  });

  describe('seed board from the engine board log', () => {
    it('reads both boards, their slots and their stats', () => {
      const message =
        '___ (-/-) ___ (-/-) P3 <img src="a.png" class="log-pet-icon" alt="Swan">(2/9/0xp) ' +
        'P2 <img src="b.png" class="log-pet-icon" alt="Duck">(3/8/0xp) ' +
        'P1 <img src="c.png" class="log-pet-icon" alt="Pig">(4/10/0xp) | ' +
        'O1 <img src="d.png" class="log-pet-icon" alt="Cow">(3/4/0xp) ' +
        'O2 <img src="e.png" class="log-pet-icon" alt="Otter">(6/9/0xp) ___ (-/-) ___ (-/-) ___ (-/-) ';
      const board = parseSeedBoardMessage(message);
      expect(board?.player.map((pet) => `${pet.id}:${pet.name}`)).toEqual([
        '1:Pig',
        '2:Duck',
        '3:Swan',
      ]);
      expect(board?.opponent.map((pet) => `${pet.id}:${pet.name}`)).toEqual([
        '11:Cow',
        '12:Otter',
      ]);
      expect(board?.player[0].health).toBe(10);
    });

    /**
     * The perk name is the only thing the board log carries, and which art
     * directory it resolves to depends entirely on the answer to "is this an
     * ailment": `Ailments/Tasty.png` against `Food/Tasty.png`, one of which is
     * a 404. That is the Tasty broken-image bug, so the seed board asks the
     * catalogue rather than assuming.
     */
    it('marks a perk worn at the first bell as an ailment when it is one', () => {
      const message =
        'P1 <img src="c.png" class="log-pet-icon" alt="Pig">' +
        '<img src="t.png" class="log-inline-icon" alt="Tasty">(4/10/0xp) | ' +
        'O1 <img src="d.png" class="log-pet-icon" alt="Cow">' +
        '<img src="m.png" class="log-inline-icon" alt="Melon">(3/4/0xp) ';
      const board = parseSeedBoardMessage(message);
      expect(board?.player[0].equipment).toBe('Tasty');
      expect(board?.player[0].equipmentIsAilment).toBe(true);
      expect(board?.opponent[0].equipment).toBe('Melon');
      expect(board?.opponent[0].equipmentIsAilment).toBe(false);
    });

    /**
     * The name comes out of an `alt` attribute, so it can arrive padded or with
     * a folded line break in it. Comparing the raw string answered "not an
     * ailment" and sent it back to the food directory.
     */
    it('reads an ailment name that arrives padded or with a folded break', () => {
      expect(isAilmentEquipmentName('  Tasty ')).toBe(true);
      expect(isAilmentEquipmentName('\n Weak\t')).toBe(true);
      expect(isAilmentEquipmentName('tasty')).toBe(true);
      expect(isAilmentEquipmentName('Melon')).toBe(false);
      expect(isAilmentEquipmentName('   ')).toBe(false);
      expect(isAilmentEquipmentName(null)).toBe(false);
    });
  });
});
