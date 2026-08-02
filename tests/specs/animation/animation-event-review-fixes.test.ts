import { describe, expect, it } from 'vitest';
import {
  AnimationEvent,
  AnimationEventType,
} from '../../../src/app/domain/interfaces/animation-event.interface';
import {
  PetConfig,
  SimulationConfig,
} from '../../../src/app/domain/interfaces/simulation-config.interface';
import {
  runConfigEvents,
  runFixtureEvents,
} from '../../support/animation-event-fixtures';

/**
 * Regressions from the review of the event stream.
 *
 * Every case here is a board that reproduced one reported defect before its
 * fix. The battles are hand written rather than fixtures because none of them
 * was recorded from the real game: they exercise engine paths, and what they
 * are checked against is the behaviour grammar the recorded fixtures pin, each
 * case stating below which rule of it the board is there to hold.
 */

const pet = (
  name: string,
  attack: number,
  health: number,
  extra: Partial<PetConfig> = {},
): PetConfig => ({ name, attack, health, ...extra });

const board = (pets: (PetConfig | null)[]): (PetConfig | null)[] => {
  const slots = [...pets];
  while (slots.length < 5) {
    slots.push(null);
  }
  return slots.slice(0, 5);
};

const battle = (
  player: (PetConfig | null)[],
  opponent: (PetConfig | null)[],
  extra: Partial<SimulationConfig> = {},
): SimulationConfig => ({
  playerPack: 'Turtle',
  opponentPack: 'Turtle',
  turn: 11,
  playerPets: board(player),
  opponentPets: board(opponent),
  allPets: true,
  simulationCount: 1,
  logsEnabled: true,
  maxLoggedBattles: 1,
  ...extra,
});

/** The events of one banner, banner included, in stream order. */
const activation = (
  events: AnimationEvent[],
  match: (event: AnimationEvent) => boolean,
): AnimationEvent[] => {
  const banner = events.find(
    (event) => event.type === 'abilityTrigger' && match(event),
  );
  if (!banner || banner.group == null) {
    return [];
  }
  return events.filter((event) => event.group === banner.group);
};

const shape = (events: AnimationEvent[]): AnimationEventType[] =>
  events.map((event) => event.type);

const named = (event: AnimationEvent, name: string): boolean =>
  event.type === 'abilityTrigger' &&
  (event.abilityName === name ||
    (event.actor.kind === 'pet' && event.actor.pet.name === name) ||
    (event.actor.kind === 'toy' && event.actor.toy.name === name));

describe('P1-1 stat writes that bypass the increase helpers', () => {
  const events = runConfigEvents(
    battle(
      [pet('Skunk', 3, 5), pet('Pig', 4, 20)],
      [pet('Cow', 3, 30), pet('Otter', 2, 6)],
    ),
  );
  const skunk = activation(events, (event) => named(event, 'SkunkAbility'));

  it('draws the health Skunk removed by assigning the field', () => {
    expect(shape(skunk)).toEqual(['abilityTrigger', 'projectile', 'statChange']);
    const change = skunk[2];
    expect(change.type === 'statChange' && change.kind).toBe('health');
    expect(change.type === 'statChange' && change.amount).toBe(-10);
    expect(change.type === 'statChange' && change.target?.name).toBe('Cow');
  });

  it('throws a heart for it, like any other health change', () => {
    const projectile = skunk[1];
    expect(projectile.type === 'projectile' && projectile.payload).toBe('heart');
  });

  it('leaves a lethal write to the faint, with no stat pill', () => {
    // Peanut kills by assigning 0 health; f08 is the recorded fixture for it.
    const peanut = runFixtureEvents('f08-equipment-melon-peanut');
    const lethalPills = peanut.filter(
      (event) =>
        event.type === 'statChange' &&
        event.kind === 'health' &&
        (event.target?.health ?? 1) <= 0,
    );
    expect(lethalPills).toEqual([]);
  });
});

describe('P1-2 projectile order inside one activation', () => {
  it('lands the reposition rock, then the move, then the buff', () => {
    const events = runFixtureEvents('f09-toy-pogo-stick');
    const push = activation(events, (event) => named(event, 'Pogo Stick'));
    expect(shape(push)).toEqual([
      'abilityTrigger',
      'projectile',
      'move',
      'statChange',
      'projectile',
      'statChange',
    ]);
  });

  it('staggers the attack glyph and the heart of a two part buff', () => {
    const events = runFixtureEvents('f10-hurt-knockout');
    const knockOut = activation(events, (event) => named(event, 'HippoAbility'));
    expect(shape(knockOut)).toEqual([
      'abilityTrigger',
      'projectile',
      'statChange',
      'projectile',
      'statChange',
    ]);
    const payloads = knockOut
      .filter((event) => event.type === 'projectile')
      .map((event) => (event.type === 'projectile' ? event.payload : null));
    expect(payloads).toEqual(['attack-glyph', 'heart']);
  });

  it('still merges genuinely simultaneous targets into one projectile', () => {
    const events = runFixtureEvents('f07-pushforward-multi');
    const areaEffect = events.filter(
      (event) => event.type === 'projectile' && event.targets.length > 1,
    );
    expect(areaEffect.length).toBeGreaterThan(0);
  });
});

describe('P1-3 clash merging with secondary damage in the window', () => {
  const events = runConfigEvents(
    battle(
      [
        pet('Pig', 4, 10, { equipment: { name: 'Chili' } }),
        pet('Duck', 3, 8),
        pet('Swan', 2, 9),
      ],
      [pet('Cow', 3, 4), pet('Otter', 6, 9), pet('Worm', 1, 9)],
    ),
  );

  it('keeps the trade one clash and leaves the snipe beside it', () => {
    const firstTurn = events.slice(
      events.findIndex((event) => event.type === 'phase' && event.turn === 1),
    );
    expect(shape(firstTurn).slice(0, 3)).toEqual(['phase', 'clash', 'hit']);
    const snipe = firstTurn[2];
    expect(snipe.type === 'hit' && snipe.kind).toBe('snipe');
  });

  it('never leaves a reciprocal pair unmerged', () => {
    const melee = events.filter(
      (event) => event.type === 'hit' && event.kind === 'melee',
    );
    expect(melee).toEqual([]);
  });
});

describe('P2-4 toys resolved against both toy slots', () => {
  it('gives a hard-toy-only board its banner', () => {
    const events = runConfigEvents(
      battle(
        [pet('Pig', 4, 12), pet('Duck', 3, 10)],
        [pet('Cow', 3, 8), pet('Otter', 2, 8), pet('Worm', 1, 4)],
        { playerHardToy: 'Pogo Stick' },
      ),
    );
    const push = activation(events, (event) => named(event, 'Pogo Stick'));
    expect(shape(push)).toEqual([
      'abilityTrigger',
      'projectile',
      'move',
      'statChange',
      'projectile',
      'statChange',
    ]);
  });

  it('does not attribute the hard toy to the normal toy', () => {
    const events = runConfigEvents(
      battle(
        [pet('Pig', 4, 12), pet('Duck', 3, 10)],
        [pet('Cow', 3, 8), pet('Otter', 2, 8), pet('Worm', 1, 4)],
        { playerToy: 'Tennis Ball', playerHardToy: 'Pogo Stick' },
      ),
    );
    const moves = events.filter((event) => event.type === 'move');
    expect(moves).toHaveLength(1);
    const owner = events.find(
      (event) =>
        event.type === 'abilityTrigger' && event.group === moves[0].group,
    );
    expect(
      owner?.type === 'abilityTrigger' &&
        owner.actor.kind === 'toy' &&
        owner.actor.toy.name,
    ).toBe('Pogo Stick');
  });
});

describe('P2-5 experience given to a target that cannot level', () => {
  const maxLevel = runConfigEvents(
    battle(
      [pet('Pig', 4, 14, { exp: 5 }), pet('Pug', 5, 2, { exp: 2 })],
      [pet('Cow', 3, 20)],
    ),
  );

  it('still draws the stats the target gained', () => {
    const gift = activation(maxLevel, (event) => named(event, 'PugAbility'));
    expect(shape(gift)).toEqual([
      'abilityTrigger',
      'projectile',
      'statChange',
      'projectile',
      'statChange',
    ]);
    const kinds = gift
      .filter((event) => event.type === 'statChange')
      .map((event) => (event.type === 'statChange' ? event.kind : null));
    expect(kinds).toEqual(['attack', 'health']);
  });

  it('keeps the level up burst when the experience does move', () => {
    const levelUp = runConfigEvents(
      battle(
        [pet('Pig', 4, 14, { exp: 0 }), pet('Pug', 5, 2, { exp: 2 })],
        [pet('Cow', 3, 20)],
      ),
    );
    const gift = activation(levelUp, (event) => named(event, 'PugAbility'));
    expect(shape(gift)).toEqual(['abilityTrigger', 'projectile', 'statChange']);
    const change = gift[2];
    expect(change.type === 'statChange' && change.kind).toBe('exp');
    expect(change.type === 'statChange' && change.levelTo).toBe(2);
  });
});

describe('P2-6 Puma repeats of a toy trigger', () => {
  const events = runConfigEvents(
    battle(
      [pet('Puma', 5, 10), pet('Pig', 4, 20)],
      [pet('Cow', 3, 8), pet('Otter', 2, 8), pet('Worm', 1, 4)],
      { playerToy: 'Pogo Stick' },
    ),
  );

  it('gives the repeat its own banner and its own group', () => {
    const banners = events.filter(
      (event) => event.type === 'abilityTrigger' && named(event, 'Pogo Stick'),
    );
    expect(banners).toHaveLength(2);
    expect(banners[0].group).not.toBe(banners[1].group);
  });

  it('gives the repeat its own projectiles rather than merged targets', () => {
    const projectiles = events.filter((event) => event.type === 'projectile');
    for (const projectile of projectiles) {
      expect(
        projectile.type === 'projectile' && projectile.targets.length,
      ).toBe(1);
    }
    const moved = events
      .filter((event) => event.type === 'move')
      .map((event) => (event.type === 'move' ? event.pet.name : null));
    expect(moved).toEqual(['Worm', 'Otter']);
  });
});

describe('P2-7 the all-enemies-fainted toy trigger', () => {
  const events = runConfigEvents(
    battle([pet('Pig', 50, 50)], [pet('Ant', 1, 1)], {
      playerToy: 'Rubber Duck',
    }),
  );

  it('wraps the summon in the toy banner', () => {
    const duck = activation(events, (event) => named(event, 'Rubber Duck'));
    expect(shape(duck)).toEqual(['abilityTrigger', 'summon']);
    const banner = duck[0];
    expect(banner.type === 'abilityTrigger' && banner.abilitySource).toBe('toy');
    expect(banner.type === 'abilityTrigger' && banner.trigger).toBe(
      'AllEnemiesFainted',
    );
  });

  it('leaves no summon outside a group', () => {
    const orphans = events.filter(
      (event) => event.type === 'summon' && event.group == null,
    );
    expect(orphans).toEqual([]);
  });
});

describe('P2-8 perk notes in level specific banner text', () => {
  it('keeps Gorilla the perk note its banner prints', () => {
    const events = runFixtureEvents('f10-hurt-knockout');
    const banner = events.find((event) => named(event, 'GorillaAbility'));
    expect(banner?.type === 'abilityTrigger' && banner.text).toBe(
      'Hurt: Gain Coconut perk. Works 1 time per turn.\nBlock damage, once.',
    );
  });
});

describe('P2-9 banner text of a copied ability', () => {
  const events = runConfigEvents(
    battle(
      [pet('Ant', 2, 2), pet('Parrot', 4, 2), pet('Pig', 4, 20)],
      [pet('Cow', 8, 30)],
    ),
  );

  it('prints the copied pet rules text, not the copier own', () => {
    const banners = events.filter(
      (event) => event.type === 'abilityTrigger' && named(event, 'AntAbility'),
    );
    expect(banners).toHaveLength(2);
    for (const banner of banners) {
      expect(banner.type === 'abilityTrigger' && banner.text).toBe(
        'Faint: Give one random friend +1 attack and +1 health.',
      );
    }
    const actors = banners.map((banner) =>
      banner.type === 'abilityTrigger' && banner.actor.kind === 'pet'
        ? banner.actor.pet.name
        : null,
    );
    expect(actors).toEqual(['Ant', 'Parrot']);
  });
});
