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
  /** Contact to the next beat, so clash to clash is windup + this. */
  clashSettleMs: number;
  /** The pet is the projectile: out, contact, back (checklist 14). */
  jumpFlightMs: number;

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

  pushForwardMs: number;

  summonPuffMs: number;
  summonRevealMs: number;
  /** Per summoned pet, collapsed to 0 in FAST (checklist 16). */
  summonStaggerMs: number;

  transformPuffMs: number;
  transformRevealMs: number;

  moveArcMs: number;

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

  clashWindupMs: 600,
  clashFlashMs: 220,
  clashRecoilMs: 170,
  clashSettleMs: 1000,
  jumpFlightMs: 950,

  damagePopupMs: 700,
  statPillMs: 700,
  impactPuffMs: 260,
  hitSettleMs: 300,

  corpseLaunchMs: 550,
  corpseBurstMs: 250,
  corpseAdvanceMs: 320,

  pushForwardMs: 350,

  summonPuffMs: 300,
  summonRevealMs: 220,
  summonStaggerMs: 300,

  transformPuffMs: 300,
  transformRevealMs: 220,

  moveArcMs: 400,

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
 * about 0.42 of the normal beat. Measured end to end that lands the whole
 * battle between 2.3x (banner free) and 2.9x (banner heavy) faster, which is
 * the spread the reference clips show.
 */
const FAST_SCALE = 0.42;

const FAST_OVERRIDES: Partial<AnimationBeats> = {
  bannerLeadMs: 0,
  bannerHoldMs: 0,
  projectileFlightMs: 0,
  projectileStaggerMs: 0,
  summonStaggerMs: 0,
  trumpetSpendGapMs: 260,
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
  totalMs: 8220,
} as const;

/** The end screens, checklist 18. Offsets from the battle's last beat. */
export const OUTRO_BEATS = {
  dimMs: 950,
  rowsMs: 2090,
  faceMs: 3140,
  awardMs: 4300,
  settledMs: 5460,
  totalMs: 6200,
} as const;
