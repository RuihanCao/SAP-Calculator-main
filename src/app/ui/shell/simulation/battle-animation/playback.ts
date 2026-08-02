import { AnimationTimeline } from './cues';
import { boardStateTimes, checkpointTimes } from './director';

/**
 * The transport.
 *
 * One clock over one timeline: playing advances it, PAUSE stops advancing it,
 * REWIND moves it back to the previous board state, SKIP warps it to the end.
 * Everything here is a pure function of the state, so the component owns only
 * the animation frame loop.
 */
export interface PlaybackState {
  timeMs: number;
  playing: boolean;
  /** Playback rate on top of the grammar, 0.5 to 2. */
  speed: number;
  /**
   * SKIP plays the beat in flight out at normal speed and then jumps, so the
   * abandoned clashes are never shown (checklist 17).
   */
  skip: { toMs: number; elapsedMs: number; playOutMs: number } | null;
  /**
   * With AUTOPLAY off the battle advances one beat per press, so playing stops
   * here rather than running on (checklist 17).
   */
  stopAtMs: number | null;
  finished: boolean;
}

/** Checklist 17: SKIP abandoned the rest of the animation in about 0.8 s. */
export const SKIP_WARP_MS = 800;

export const initialPlayback = (speed = 1): PlaybackState => ({
  timeMs: 0,
  playing: false,
  speed,
  skip: null,
  stopAtMs: null,
  finished: false,
});

export const advancePlayback = (
  state: PlaybackState,
  timeline: AnimationTimeline,
  deltaMs: number,
): PlaybackState => {
  if (state.skip) {
    const elapsedMs = state.skip.elapsedMs + deltaMs;
    if (elapsedMs >= state.skip.playOutMs) {
      // The beat in flight has had its 0.8 s, so the rest is abandoned: the
      // board jumps to its final state rather than being fast forwarded
      // through the clashes that are never going to be shown.
      return {
        ...state,
        timeMs: state.skip.toMs,
        skip: null,
        playing: true,
        finished: false,
      };
    }
    return {
      ...state,
      timeMs: Math.min(state.skip.toMs, state.timeMs + deltaMs * state.speed),
      skip: { ...state.skip, elapsedMs },
    };
  }

  if (!state.playing) {
    return state;
  }

  const timeMs = state.timeMs + deltaMs * state.speed;
  if (state.stopAtMs != null && timeMs >= state.stopAtMs) {
    return { ...state, timeMs: state.stopAtMs, playing: false, stopAtMs: null };
  }
  if (timeMs >= timeline.durationMs) {
    return { ...state, timeMs: timeline.durationMs, playing: false, finished: true };
  }
  return { ...state, timeMs, finished: false };
};

/**
 * PLAY. With AUTOPLAY off the press buys one beat, which is the next board
 * state, and the clock stops there (checklist 17).
 */
export const play = (
  state: PlaybackState,
  timeline: AnimationTimeline,
  autoplay = true,
): PlaybackState => {
  const atEnd = state.timeMs >= timeline.durationMs;
  const timeMs = atEnd ? 0 : state.timeMs;
  return {
    ...state,
    timeMs,
    playing: true,
    stopAtMs: autoplay ? null : nextCheckpointMs(timeline, timeMs),
    finished: false,
  };
};

export const pause = (state: PlaybackState): PlaybackState => ({
  ...state,
  playing: false,
  skip: null,
  stopAtMs: null,
});

export const seek = (
  state: PlaybackState,
  timeline: AnimationTimeline,
  timeMs: number,
): PlaybackState => ({
  ...state,
  timeMs: Math.min(Math.max(0, timeMs), timeline.durationMs),
  skip: null,
  stopAtMs: null,
  finished: false,
});

/**
 * SKIP, checklist 17. It abandons the rest of the animation rather than
 * hurrying through it: only the beat already in flight plays out, at the
 * ordinary speed, and then the board is on its final state. Unlike the real
 * game we then show the end screen rather than wiping to a shop we do not have.
 */
export const skip = (
  state: PlaybackState,
  timeline: AnimationTimeline,
): PlaybackState => {
  if (state.timeMs >= timeline.battleEndMs) {
    return { ...state, timeMs: timeline.battleEndMs, playing: true, stopAtMs: null };
  }
  return {
    ...state,
    playing: true,
    stopAtMs: null,
    skip: {
      toMs: timeline.battleEndMs,
      elapsedMs: 0,
      playOutMs: SKIP_WARP_MS,
    },
  };
};

/**
 * REWIND, checklist 17.
 *
 * Measured off the reference rather than guessed at. On `ctl-rewind` the press
 * lands at t=21.9 and the battle runs on again from its first beat
 * (clips/ctl-rewind/, out/ctl-rewind_filmstrip.jpg frames 00 to 07). So REWIND
 * is not a step back, it is a restart, and it keeps playing rather than parking
 * the transport.
 *
 * The reference restarts through its entrance; ours has none, so the restart
 * lands on the same controls-visible first frame the animation opens on and
 * never replays a shutter.
 *
 * `autoplay` is carried through for the same reason PLAY carries it: with the
 * toggle off the restart buys one beat and stops on the first board state.
 */
export const rewind = (
  state: PlaybackState,
  timeline: AnimationTimeline,
  autoplay = true,
): PlaybackState => ({
  ...state,
  timeMs: 0,
  playing: true,
  skip: null,
  stopAtMs: autoplay ? null : nextCheckpointMs(timeline, 0),
  finished: false,
});

/**
 * The board state before the one on screen.
 *
 * The board on screen is the last one committed at or before `timeMs`, so one
 * press back is the commit before that, which makes repeated presses walk
 * backwards one state at a time however long the press is held for.
 */
export const previousBoardStateMs = (
  timeline: AnimationTimeline,
  timeMs: number,
): number => {
  const times = boardStateTimes(timeline);
  let showing = 0;
  for (let at = 0; at < times.length; at += 1) {
    if (times[at] > timeMs) {
      break;
    }
    showing = at;
  }
  return times[Math.max(0, showing - 1)];
};

export const nextCheckpointMs = (
  timeline: AnimationTimeline,
  timeMs: number,
): number => {
  const times = checkpointTimes(timeline);
  for (const at of times) {
    if (at > timeMs + 1) {
      return at;
    }
  }
  return timeline.durationMs;
};

/**
 * Switching grammar keeps the place in the battle rather than the millisecond:
 * the step under the clock is looked up in the timeline being left and the
 * clock lands on the same step in the one being entered.
 */
export const remapTimeAcrossTimelines = (
  from: AnimationTimeline,
  to: AnimationTimeline,
  timeMs: number,
): number => {
  if (timeMs <= 0) {
    return 0;
  }
  if (timeMs >= from.battleEndMs) {
    return to.battleEndMs + (timeMs - from.battleEndMs);
  }
  let stepIndex = -1;
  for (const step of from.steps) {
    if (step.startMs > timeMs) {
      break;
    }
    stepIndex = step.index;
  }
  const target = to.steps[stepIndex];
  return target ? target.startMs : 0;
};
