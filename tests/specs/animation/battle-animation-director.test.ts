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
  MoveArcCue,
  ProjectileCue,
  SlideCue,
  StatPillCue,
  TimelineSampler,
  buildBattleTimeline,
  buildSeedBoard,
  advancePlayback,
  initialPlayback,
  pause,
  play,
  rewind,
  skip,
  parseSeedBoardMessage,
} from '../../../src/app/ui/shell/simulation/battle-animation';
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

    it('keeps the clash cadence at about 1.3 s even when a pet dies between', () => {
      const timeline = timelineFor('f01-plain-trades');
      const clashes = cuesOfKind<ClashCue>(timeline, 'clash');
      for (let index = 1; index < clashes.length; index += 1) {
        const gap = clashes[index].contactMs - clashes[index - 1].contactMs;
        // f01 t=29.84 to t=31.16 on the reference clip, faint and slide inside.
        expect(gap).toBeGreaterThanOrEqual(1200);
        expect(gap).toBeLessThanOrEqual(1450);
      }
    });

    it('makes a jump attack one longer event with a two sided contact', () => {
      const timeline = timelineFor('f11-jump-african-wild-dog');
      const jumps = cuesOfKind<ClashCue>(timeline, 'clash').filter((cue) => cue.jump);
      expect(jumps.length).toBeGreaterThan(0);
      for (const jump of jumps) {
        expect(jump.hits).toHaveLength(2);
        expect(jump.endMs - jump.startMs).toBeGreaterThan(1200);
      }
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
      const zeroes = cuesOfKind<DamagePopupCue>(timeline, 'damagePopup').filter(
        (popup) => popup.value === 0,
      );
      expect(zeroes.length).toBeGreaterThan(0);
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
      expect(near.endMs - near.startMs).toBe(320);
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

    it('drops the counter and flies a token to the spender on a spend', () => {
      const timeline = timelineFor('f15-trumpet-spend-nyala-nurseshark');
      const tokens = timeline.cues.filter(
        (cue) => cue.kind === 'trumpetToken' && cue.direction === 'to-pet',
      );
      expect(tokens).toHaveLength(1);
      const spendFlash = timeline.cues.find(
        (cue) => cue.kind === 'trumpetCounterFlash' && cue.tone === 'spend',
      );
      expect(spendFlash).toBeTruthy();
      // The effect the trumpets paid for is an ordinary snipe, one beat later.
      const snipe = cuesOfKind<ProjectileCue>(timeline, 'projectile').find(
        (cue) => cue.startMs > (spendFlash?.startMs ?? 0),
      );
      expect(snipe).toBeTruthy();
      expect((snipe?.startMs ?? 0) - (spendFlash?.startMs ?? 0)).toBeGreaterThan(700);
    });

    it('carries mana as a pill and as a stat on the pet', () => {
      const timeline = timelineFor('f13-mana-alchemedes');
      const manaPills = cuesOfKind<StatPillCue>(timeline, 'statPill').filter(
        (cue) => cue.statKind === 'mana',
      );
      expect(manaPills.length).toBeGreaterThan(0);
      expect(
        timeline.finalBoard.player.some((pet) => (pet.mana ?? 0) > 0) ||
          timeline.finalBoard.opponent.some((pet) => (pet.mana ?? 0) > 0),
      ).toBe(true);
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
        expect(normal / fast).toBeGreaterThan(1.9);
        expect(normal / fast).toBeLessThan(3.4);
      }
      const ratio = normalTotal / fastTotal;
      expect(ratio).toBeGreaterThan(2.1);
      expect(ratio).toBeLessThan(3.0);
    });
  });

  describe('entrance and end screen, checklist 18', () => {
    it('wraps the battle in the entrance and the end screen', () => {
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      expect(timeline.introEndMs).toBe(8220);
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
      state = skip(state, timeline);
      state = advancePlayback(state, timeline, 400);
      expect(state.timeMs).toBeGreaterThan(1200);
      expect(state.timeMs).toBeLessThan(timeline.battleEndMs);
      state = advancePlayback(state, timeline, 400);
      expect(state.timeMs).toBe(timeline.battleEndMs);
    });

    it('steps back one board state on rewind and stays playable', () => {
      let state = play(initialPlayback(), timeline);
      state = advancePlayback(state, timeline, 6000);
      const before = state.timeMs;
      state = rewind(state, timeline);
      expect(state.timeMs).toBeLessThan(before);
      expect(state.playing).toBe(true);
      const moved = advancePlayback(state, timeline, 200);
      expect(moved.timeMs).toBe(state.timeMs + 200);
    });

    it('applies the speed multiplier on top of the grammar', () => {
      let state = { ...play(initialPlayback(), timeline), speed: 2 };
      state = advancePlayback(state, timeline, 500);
      expect(state.timeMs).toBe(1000);
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
  });
});
