import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runAnimationEventDump } from '../../simulation/simulate';
import { AnimationEvent } from '../../src/app/domain/interfaces/animation-event.interface';
import { SimulationConfig } from '../../src/app/domain/interfaces/simulation-config.interface';

const require = createRequire(import.meta.url);

export const EXPERIMENT_DIR = path.resolve(
  __dirname,
  '../../experiments/01-fight-animation-parity',
);
export const FIXTURE_DIR = path.join(EXPERIMENT_DIR, 'harness/fixtures');
export const GOLDEN_DIR = path.join(EXPERIMENT_DIR, 'harness/expected/events');

interface FixtureSpec {
  id: string;
  title?: string;
  covers?: string[];
}

const { buildSimConfig } = require(
  path.join(EXPERIMENT_DIR, 'harness/sim_config.js'),
) as { buildSimConfig: (fixture: unknown) => SimulationConfig };

export const listFixtureIds = (): string[] =>
  fs
    .readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();

export const loadFixture = (id: string): FixtureSpec =>
  JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, `${id}.json`), 'utf8'),
  ) as FixtureSpec;

export const runFixtureEvents = (id: string): AnimationEvent[] => {
  const dump = runAnimationEventDump(buildSimConfig(loadFixture(id)));
  return dump.battles[0]?.events ?? [];
};

const byId = <T extends { id: number }>(a: T, b: T): number => a.id - b.id;
const byPetId = <T extends { pet: { id: number } }>(a: T, b: T): number =>
  a.pet.id - b.pet.id;

/**
 * Canonical form for comparison.
 *
 * Members of a simultaneous group carry no order in the real game, so they are
 * sorted here: corpse groups, area-effect targets and the pets in one slide.
 * Consecutive faints are the same case one level up, and are the known
 * order-only ambiguity of f07, whose three enemies die in one damage step.
 */
export const normalizeEvents = (events: AnimationEvent[]): AnimationEvent[] => {
  const cloned = JSON.parse(JSON.stringify(events)) as AnimationEvent[];
  for (const event of cloned) {
    switch (event.type) {
      case 'corpseLaunchGroup':
        event.pets.sort(byId);
        break;
      case 'projectile':
        event.targets.sort(byId);
        break;
      case 'pushForward':
        event.moves.sort(byPetId);
        break;
      case 'move':
        event.displaced.sort(byPetId);
        break;
      default:
        break;
    }
  }

  sortRuns(
    cloned,
    (event) => event.type === 'faint',
    (a, b) => (a.type === 'faint' && b.type === 'faint' ? a.pet.id - b.pet.id : 0),
  );

  const ordered = sortRepeatedBannerBlocks(cloned);

  // `seq` and `group` are positional, so both are re-derived after reordering.
  const groupIds = new Map<number, number>();
  ordered.forEach((event, index) => {
    event.seq = index;
    if (event.group != null) {
      if (!groupIds.has(event.group)) {
        groupIds.set(event.group, groupIds.size);
      }
      event.group = groupIds.get(event.group) ?? event.group;
    }
  });
  return ordered;
};

/** Sorts each maximal run of matching events in place. */
const sortRuns = <T>(
  items: T[],
  matches: (item: T) => boolean,
  compare: (a: T, b: T) => number,
): void => {
  for (let start = 0; start < items.length; start++) {
    if (!matches(items[start])) {
      continue;
    }
    let end = start;
    while (end + 1 < items.length && matches(items[end + 1])) {
      end += 1;
    }
    if (end > start) {
      const run = items.slice(start, end + 1).sort(compare);
      for (let offset = 0; offset < run.length; offset++) {
        items[start + offset] = run[offset];
      }
    }
    start = end;
  }
};

/** One banner and everything it produced, or one ungrouped event. */
type Block = { key: string | null; events: AnimationEvent[] };

const blockKey = (events: AnimationEvent[]): string | null => {
  const head = events[0];
  if (head?.type !== 'abilityTrigger') {
    return null;
  }
  const actor =
    head.actor.kind === 'pet' ? `pet:${head.actor.pet.id}` : `toy:${head.actor.toy.name}`;
  return `${actor}|${head.trigger}|${head.abilityName}|${head.level}`;
};

const blockOrderKey = (block: Block): string =>
  JSON.stringify(
    block.events.map((event) => ({ ...event, seq: 0, group: 0 })),
  );

/**
 * The same ability firing once per member of a simultaneous group has no order
 * in the real game: a double summon draws both reaction banners for the same
 * beat (checklist 7 and 16). Consecutive repeats of one banner are therefore
 * sorted, which is the f04 case.
 */
const sortRepeatedBannerBlocks = (events: AnimationEvent[]): AnimationEvent[] => {
  const blocks: Block[] = [];
  let index = 0;
  while (index < events.length) {
    const group = events[index].group;
    if (group == null) {
      blocks.push({ key: null, events: [events[index]] });
      index += 1;
      continue;
    }
    const run: AnimationEvent[] = [];
    while (index < events.length && events[index].group === group) {
      run.push(events[index]);
      index += 1;
    }
    blocks.push({ key: blockKey(run), events: run });
  }

  for (let start = 0; start < blocks.length; start++) {
    const key = blocks[start].key;
    if (key == null) {
      continue;
    }
    let end = start;
    while (end + 1 < blocks.length && blocks[end + 1].key === key) {
      end += 1;
    }
    if (end > start) {
      const run = blocks
        .slice(start, end + 1)
        .sort((a, b) => blockOrderKey(a).localeCompare(blockOrderKey(b)));
      for (let offset = 0; offset < run.length; offset++) {
        blocks[start + offset] = run[offset];
      }
    }
    start = end;
  }

  return blocks.flatMap((block) => block.events);
};

export const goldenPath = (id: string): string =>
  path.join(GOLDEN_DIR, `${id}.json`);

export const readGolden = (id: string): AnimationEvent[] =>
  JSON.parse(fs.readFileSync(goldenPath(id), 'utf8')) as AnimationEvent[];

export const writeGolden = (id: string, events: AnimationEvent[]): void => {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(goldenPath(id), `${JSON.stringify(events, null, 2)}\n`);
};
