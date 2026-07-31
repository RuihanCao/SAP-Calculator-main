import { AnimationEvent } from './animation-event.interface';
import { Log } from './log.interface';

export interface Battle {
  logs: Log[];
  /**
   * Structured animation event stream for this battle, alongside `logs`.
   * Plain data end to end, so it crosses the worker boundary untouched.
   */
  events: AnimationEvent[];
  winner: 'opponent' | 'player' | 'draw';
}
