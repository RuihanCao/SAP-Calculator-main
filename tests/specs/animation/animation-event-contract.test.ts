import { describe, expect, it } from 'vitest';
import {
  AnimationEvent,
  AnimationPetRef,
} from '../../../src/app/domain/interfaces/animation-event.interface';
import {
  listFixtureIds,
  runFixtureEvents,
} from '../../support/animation-event-fixtures';

const fixtureIds = listFixtureIds();
const streams = new Map<string, AnimationEvent[]>(
  fixtureIds.map((id) => [id, runFixtureEvents(id)]),
);

const isPlainData = (value: unknown, depth = 0): boolean => {
  if (depth > 8) {
    return false;
  }
  if (value === null) {
    return true;
  }
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isPlainData(entry, depth + 1));
  }
  if (kind !== 'object') {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every((entry) =>
    isPlainData(entry, depth + 1),
  );
};

describe('animation event contract', () => {
  for (const id of fixtureIds) {
    const events = streams.get(id) ?? [];

    describe(id, () => {
      it('is a gap free sequence of plain data', () => {
        expect(events.length).toBeGreaterThan(0);
        events.forEach((event, index) => {
          expect(event.seq).toBe(index);
        });
        expect(events.every((event) => isPlainData(event))).toBe(true);
      });

      it('opens with the before-battle phase and closes with the outcome', () => {
        expect(events[0]?.type).toBe('phase');
        expect(events[events.length - 1]?.type).toBe('outcome');
        const phases = events
          .filter((event) => event.type === 'phase')
          .map((event) => (event.type === 'phase' ? event.phase : ''));
        expect(phases.slice(0, 3)).toEqual([
          'before-battle',
          'start-of-battle',
          'after-start-of-battle',
        ]);
      });

      it('gives every clash two hits that face each other', () => {
        for (const event of events) {
          if (event.type !== 'clash') {
            continue;
          }
          expect(event.hits).toHaveLength(2);
          const [first, second] = event.hits;
          expect(first.source.id).toBe(second.target.id);
          expect(second.source.id).toBe(first.target.id);
          expect(first.blocked).toBe(first.damage === 0);
          expect(second.blocked).toBe(second.damage === 0);
        }
      });

      it('gives every projectile a source and, unless it is a trumpet gain, a target', () => {
        for (const event of events) {
          if (event.type !== 'projectile') {
            continue;
          }
          expect(event.source).toBeTruthy();
          if (event.payload === 'trumpet' && event.targets.length === 0) {
            // A trumpet gain travels from the banner to the counter widget and
            // has no pet target at all (checklist 14).
            continue;
          }
          expect(event.targets.length).toBeGreaterThanOrEqual(1);
        }
      });

      it('covers every faint by exactly one corpse launch group', () => {
        const fainted = events
          .filter((event) => event.type === 'faint')
          .map((event) => (event.type === 'faint' ? event.pet.id : -1));
        const launchCounts = new Map<number, number>();
        for (const event of events) {
          if (event.type !== 'corpseLaunchGroup') {
            continue;
          }
          expect(event.pets.length).toBeGreaterThan(0);
          for (const pet of event.pets) {
            launchCounts.set(pet.id, (launchCounts.get(pet.id) ?? 0) + 1);
          }
        }
        for (const petId of fainted) {
          expect(launchCounts.get(petId)).toBe(1);
        }
      });

      it('never launches a corpse before its faint', () => {
        const faintedAt = new Map<number, number>();
        for (const event of events) {
          if (event.type === 'faint' && !faintedAt.has(event.pet.id)) {
            faintedAt.set(event.pet.id, event.seq);
          }
          if (event.type !== 'corpseLaunchGroup') {
            continue;
          }
          for (const pet of event.pets) {
            expect(faintedAt.get(pet.id)).toBeLessThan(event.seq);
          }
        }
      });

      it('keeps every event of a group next to its banner', () => {
        const bannerSeq = new Map<number, number>();
        for (const event of events) {
          if (event.type === 'abilityTrigger' && event.group != null) {
            expect(bannerSeq.has(event.group)).toBe(false);
            bannerSeq.set(event.group, event.seq);
          }
        }
        for (const event of events) {
          if (event.group == null || event.type === 'abilityTrigger') {
            continue;
          }
          expect(bannerSeq.has(event.group)).toBe(true);
          expect(event.seq).toBeGreaterThan(bannerSeq.get(event.group) ?? -1);
        }
      });

      it('keeps stat changes signed and non-zero', () => {
        for (const event of events) {
          if (event.type !== 'statChange') {
            continue;
          }
          expect(event.amount).not.toBe(0);
          if (event.kind === 'trumpet-gain' || event.kind === 'trumpet-spend') {
            expect(event.total).not.toBeNull();
          } else {
            expect(event.target).not.toBeNull();
          }
        }
      });

      it('moves a pet between two different slots', () => {
        for (const event of events) {
          if (event.type === 'pushForward') {
            expect(event.moves.length).toBeGreaterThan(0);
            for (const move of event.moves) {
              expect(move.to).toBeLessThan(move.from);
            }
          }
          if (event.type === 'move') {
            expect(event.from).not.toBe(event.to);
          }
        }
      });

      it('names every pet reference consistently for one id', () => {
        const names = new Map<number, string>();
        const visit = (ref: AnimationPetRef): void => {
          const known = names.get(ref.id);
          if (known == null) {
            names.set(ref.id, ref.name);
            return;
          }
          expect(ref.name).toBe(known);
        };
        for (const event of events) {
          for (const value of Object.values(event)) {
            collectRefs(value).forEach(visit);
          }
        }
      });
    });
  }
});

const collectRefs = (value: unknown, depth = 0): AnimationPetRef[] => {
  if (depth > 6 || value == null || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectRefs(entry, depth + 1));
  }
  const record = value as Record<string, unknown>;
  if (typeof record['id'] === 'number' && typeof record['name'] === 'string') {
    return [record as unknown as AnimationPetRef];
  }
  return Object.values(record).flatMap((entry) => collectRefs(entry, depth + 1));
};
