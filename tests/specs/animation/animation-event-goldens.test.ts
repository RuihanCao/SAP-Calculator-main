import { describe, expect, it } from 'vitest';
import {
  listFixtureIds,
  normalizeEvents,
  readGolden,
  runFixtureEvents,
  writeGolden,
} from '../../support/animation-event-fixtures';

/**
 * Golden event streams for the exp01 parity fixtures.
 *
 * Regenerate deliberately with:
 *   UPDATE_ANIMATION_GOLDENS=1 npx vitest run --config config/vitest.config.ts \
 *     tests/specs/animation
 * and read every line of the diff before committing it: a change that was not
 * the point of the edit is a regression, not a new baseline.
 */
const UPDATE = process.env.UPDATE_ANIMATION_GOLDENS === '1';

const fixtureIds = listFixtureIds();

describe('animation event goldens', () => {
  it('has a fixture set to compare against', () => {
    expect(fixtureIds.length).toBeGreaterThanOrEqual(16);
  });

  for (const id of fixtureIds) {
    it(`${id} matches its golden event stream`, () => {
      const events = normalizeEvents(runFixtureEvents(id));
      if (UPDATE) {
        writeGolden(id, events);
      }
      expect(events).toEqual(readGolden(id));
    });
  }
});
