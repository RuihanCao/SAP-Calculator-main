import { AbilityEvent } from 'app/domain/interfaces/ability-event.interface';
import { Toy } from 'app/domain/entities/toy.class';

/**
 * Which of a board's two toy slots a queued toy event belongs to.
 *
 * A board can hold a normal toy and a hard-mode toy at the same time, and a
 * Puma repeat carries no toy name at all, so neither `player.toy` alone nor the
 * logged name alone identifies the actor. Animation only: nothing here changes
 * what the event does.
 */
export const resolveEventToy = (event: AbilityEvent): Toy | null => {
  if (event.sourceToy) {
    return event.sourceToy;
  }
  const slots = [event.player?.toy, event.player?.hardToy];
  const named = event.customParams?.toyName;
  if (typeof named === 'string' && named) {
    return slots.find((candidate) => candidate?.name === named) ?? null;
  }
  return event.player?.toy ?? null;
};
