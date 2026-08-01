/**
 * The beat table.
 *
 * Every number here is read off the reference clips in
 * `experiments/01-fight-animation-parity/CHECKLIST.md`, section 12 for the
 * normal grammar and section 16 for the fast one. There is exactly one table:
 * a cue's duration IS the beat it occupies, so nothing schedules a second,
 * independent delay on top of an animation (the thing the old renderer did with
 * its two duration tables and its x2 fudge).
 */

export type AnimationMode = 'normal' | 'fast';

export interface AnimationBeats {
  /** Banner is up this long before the effect it announces starts. */
  bannerLeadMs: number;
  /** Banner lingers this long after its group's last effect. */
  bannerHoldMs: number;
  /** FAST replaces the banner with an icon over the acting pet. */
  fastIconMs: number;
  fastIconLeadMs: number;

  /** Distance invariant, checklist 5. */
  projectileFlightMs: number;
  /** Second and later payloads of one multi part effect, checklist 15. */
  projectileStaggerMs: number;

  /** Red outline plus lean in, before the contact frame. */
  clashWindupMs: number;
  /** White radial flash at the midline. */
  clashFlashMs: number;
  /** Contact to both pets back in their slots. */
  clashRecoilMs: number;
  /**
   * Contact to contact when nothing died in between, which is the cadence of a
   * plain trade (checklist 12 and 19). A faint stretches the beat because the
   * corpse hold, the launch and the slide push the cursor past this floor, not
   * because the floor itself changes.
   */
  clashCadenceMs: number;
  /** Least time from whatever came before a clash to its contact frame. */
  clashLeadMs: number;
  /** The pet is the projectile: out, hold at the target, back (checklist 14). */
  jumpOutMs: number;
  jumpHoldMs: number;
  jumpReturnMs: number;
  /** White puff where a jump attacker lands back in its own slot. */
  landingPuffMs: number;

  /** Popup lifetime, and therefore the merge window (checklist 19). */
  damagePopupMs: number;
  statPillMs: number;
  impactPuffMs: number;
  /** Ranged impact to the next beat. */
  hitSettleMs: number;

  /** Corpse launch to star burst. */
  corpseLaunchMs: number;
  corpseBurstMs: number;
  /** Launch start to the stream continuing; the flight overlaps what follows. */
  corpseAdvanceMs: number;
  /** Dead in place before the corpse leaves, even for a single death. */
  corpseHoldMs: number;

  pushForwardMs: number;

  summonPuffMs: number;
  summonRevealMs: number;
  /** Per summoned pet, collapsed to 0 in FAST (checklist 16). */
  summonStaggerMs: number;

  transformPuffMs: number;
  transformRevealMs: number;

  moveArcMs: number;
  /** A move's own buff is a separate cue, this long after the landing. */
  moveBuffGapMs: number;

  xpBurstMs: number;

  trumpetTokenMs: number;
  trumpetFlashMs: number;
  trumpetSpendTokenMs: number;
  /** Counter change to the paid-for effect launching, checklist 19. */
  trumpetSpendGapMs: number;

  equipmentBreakMs: number;
  equipmentGainMs: number;

  /** A stat pill with nothing thrown to it, e.g. a settled residual. */
  statSettleMs: number;

  /** Hurt outline lifetime after taking damage. */
  hurtOutlineMs: number;

  /** Last event to the end screen. */
  outcomeDelayMs: number;
}

const NORMAL_BEATS: AnimationBeats = {
  bannerLeadMs: 450,
  bannerHoldMs: 200,
  fastIconMs: 200,
  fastIconLeadMs: 90,

  projectileFlightMs: 320,
  projectileStaggerMs: 190,

  clashWindupMs: 500,
  clashFlashMs: 220,
  clashRecoilMs: 170,
  clashCadenceMs: 620,
  clashLeadMs: 450,
  jumpOutMs: 520,
  jumpHoldMs: 330,
  jumpReturnMs: 380,
  landingPuffMs: 260,

  damagePopupMs: 700,
  statPillMs: 700,
  impactPuffMs: 260,
  hitSettleMs: 300,

  corpseLaunchMs: 550,
  corpseBurstMs: 250,
  corpseAdvanceMs: 350,
  corpseHoldMs: 170,

  pushForwardMs: 350,

  summonPuffMs: 380,
  summonRevealMs: 220,
  summonStaggerMs: 300,

  // Checklist 8: a transform is the summon puff in place, so it is the same
  // cloud for the same length of time and the sprite is swapped inside it.
  transformPuffMs: 380,
  transformRevealMs: 220,

  moveArcMs: 400,
  moveBuffGapMs: 1000,

  xpBurstMs: 450,

  trumpetTokenMs: 300,
  trumpetFlashMs: 250,
  trumpetSpendTokenMs: 440,
  trumpetSpendGapMs: 950,

  equipmentBreakMs: 400,
  equipmentGainMs: 300,

  statSettleMs: 220,

  hurtOutlineMs: 1000,

  outcomeDelayMs: 600,
};

/**
 * FAST is a second grammar, not a playback rate (checklist 16).
 *
 * The banner is gone, so its lead is gone and the projectile has nowhere to
 * come from; per target staging collapses to one frame; what is left runs at
 * about 0.45 of the normal beat. Measured end to end that lands the whole
 * battle between 2.3x (banner free) and 3.1x (banner heavy) faster, which is
 * the spread the reference clips show, and puts the ten measured fixtures
 * within a couple of percent of the clips' own 34.1 s total.
 */
const FAST_SCALE = 0.45;

/**
 * How long a popup stays readable under FAST.
 *
 * A popup lifetime is not a beat, it is how long a number has to be on screen
 * to be read, so it does not follow the speed factor down (checklist 2 and 19).
 * Scaled it would be 0.29 s, which is both unreadable and short enough to lose
 * merges the normal grammar makes: this floor keeps the numeral the same in
 * both grammars, which is the whole point of FAST being a compression of the
 * staging rather than a change of what happened.
 */
const FAST_POPUP_LIFE_MS = 350;

const FAST_OVERRIDES: Partial<AnimationBeats> = {
  bannerLeadMs: 0,
  bannerHoldMs: 0,
  projectileFlightMs: 0,
  projectileStaggerMs: 0,
  summonStaggerMs: 0,
  trumpetSpendGapMs: 260,
  damagePopupMs: FAST_POPUP_LIFE_MS,
  statPillMs: FAST_POPUP_LIFE_MS,
};

/** Beats that describe a lifetime rather than a beat, so they are not scaled. */
const FAST_UNSCALED: ReadonlyArray<keyof AnimationBeats> = [
  'fastIconMs',
  'fastIconLeadMs',
];

export const getBeats = (mode: AnimationMode): AnimationBeats => {
  if (mode === 'normal') {
    return { ...NORMAL_BEATS };
  }
  const beats = { ...NORMAL_BEATS };
  for (const key of Object.keys(beats) as Array<keyof AnimationBeats>) {
    if (FAST_UNSCALED.includes(key)) {
      continue;
    }
    beats[key] = Math.round(beats[key] * FAST_SCALE);
  }
  return { ...beats, ...FAST_OVERRIDES };
};

/**
 * The entrance, checklist 18. Offsets are milliseconds from the shutter
 * starting to close, and they are the clip's own timings rebased to zero.
 *
 * `totalMs` is where the battle's own beats begin, so the control bar fading in
 * at `controlsMs` is on screen 1.5 s before the first wind-up and not a moment
 * of the entrance before that.
 */
export const INTRO_BEATS = {
  shutterCloseMs: 0,
  shutterCloseEndMs: 700,
  shutterOpenMs: 1360,
  playerCardMs: 1360,
  playerBoardMs: 2110,
  playerBoardSettledMs: 2850,
  vsCardMs: 3570,
  opponentBoardMs: 4310,
  opponentBoardSettledMs: 6030,
  cardsClearMs: 6830,
  controlsMs: 7530,
  totalMs: 9030,
} as const;

/** Checklist 18: the bar is up this long before the first wind-up. */
export const CONTROLS_LEAD_MS = INTRO_BEATS.totalMs - INTRO_BEATS.controlsMs;

/**
 * The end screens, checklist 18. Offsets from the battle's last beat.
 *
 * `rowsMs` and `awardMs` are the real game's trophy and heart rows flying in
 * and then one of them animating. The calculator's own end screen does not
 * draw a shop run's score, so nothing samples them any more, and they are kept
 * because the rest of the screen is paced against them.
 */
export const OUTRO_BEATS = {
  dimMs: 300,
  /**
   * How long the veil takes to come down.
   *
   * The reference end screen fades over about 1.1 s and is 90% to 10% of the
   * way down in 0.633 s of that (clips/outro-victory, the sky band, from
   * f_01907_0053613 to f_01926_0054246). A linear 0.7 s crossed the same two
   * marks in 0.568 s and was visibly the quicker screen. A squared ease-out
   * over 1.0 s crosses them in 0.633 s.
   */
  dimFadeMs: 1000,
  rowsMs: 2090,
  /**
   * The caption and the two buttons are the whole of this screen, so they do
   * not wait for the beat the real game spends flying a trophy row in first:
   * the dim is complete by 1.0 s and the caption is up by 1.4 s, where the
   * earlier pacing left the screen empty until past 3.6 s.
   */
  faceMs: 900,
  awardMs: 4300,
  settledMs: 5460,
  totalMs: 6200,
} as const;
