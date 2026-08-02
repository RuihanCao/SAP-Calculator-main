/**
 * The beat table.
 *
 * Every number here was measured off clips of the real client, never chosen
 * because it felt right. Two grammars were measured, and the second is not the
 * first replayed faster:
 *
 *   normal  overlapping beats. Nothing waits for the thing before it to
 *           finish: the push forward starts during the corpse flight, and the
 *           next trigger banner is up while the previous popups still fade.
 *   FAST    the trigger banner is not drawn at all. In its place the ability's
 *           icon appears over the acting pet for about 0.2 s, so a projectile
 *           has nowhere to travel from and simply appears at its target.
 *           Per-target staging collapses (two summons from one ability arrive
 *           in the same frame instead of ~0.3 s apart), and the beats that
 *           survive run about 2.5x faster.
 *
 * There is exactly one table: a cue's duration IS the beat it occupies, so
 * nothing schedules a second, independent delay on top of an animation (the
 * thing the old renderer did with its two duration tables and its x2 fudge).
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
  /**
   * How long the thrown object spends growing to full size after it leaves.
   *
   * Measured on f02 (clips/f02-snipe-crocodile): the rock is 41px across at
   * t=29.547 and 56 to 62px from t=29.639 on, so it comes out of the attacker
   * small and is at size about a third of the way through the flight.
   */
  projectileGrowMs: number;
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

  /** Launch to the trail having faded and the star spray being over. */
  corpseLaunchMs: number;
  corpseBurstMs: number;
  /**
   * The corpse's own travel, which is shorter than the cue it lives in: the
   * sprite is off screen well before the trail it left has faded.
   */
  corpseFlightMs: number;
  /** Launch start to the stream continuing; the flight overlaps what follows. */
  corpseAdvanceMs: number;
  /**
   * Dead in place before the corpse leaves, when the blow that killed it was a
   * clash. The knock away *is* the launch, so this is one frame.
   */
  corpseHoldMs: number;
  /**
   * Dead in place before the corpse leaves, when the killing damage was not a
   * clash (a snipe, an ability, a faint's own payload).
   *
   * The pet stays standing in its slot at full colour with the crossed bandage
   * over it and its real, possibly negative, health on the badge, and only then
   * does the corpse launch.
   */
  corpseBandageHoldMs: number;

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

  /*
   * Measured rather than guessed.
   *
   * f02-snipe-crocodile: the rock's first pixels are at t=29.509 (nothing at
   * 29.488) and the damage numeral with its flash is at t=29.924, with the rock
   * last seen at 29.904, so contact is about 29.914 and the flight is 414 ms.
   * f06-snipe-dolphin throws about a third further and lands 390 ms after it
   * leaves, which is the same number inside the frame timing's own noise and is
   * why checklist 5 calls the flight distance invariant.
   */
  projectileFlightMs: 410,
  projectileGrowMs: 130,
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

  /*
   * Measured on f02's "8": it appears at t=29.971 and its last frame
   * is 30.840, so 870 ms, not the 700 the checklist carried. The merge window
   * is the same number by definition (checklist 19), and the clash cadence of
   * 620 ms is inside either value, so what this changes is how long a numeral
   * is readable rather than which hits merge.
   */
  damagePopupMs: 870,
  statPillMs: 700,
  impactPuffMs: 260,
  hitSettleMs: 300,

  /*
   * The cue is as long as the whole aftermath, not as long as the
   * flight: on f03-faint-chain the cow is launched at t=33.59, is off the top
   * right corner by 33.83, its trail is still drawn at 33.90 and gone by 34.00,
   * and the star spray runs 33.93 to 34.34. So 690 ms end to end, of which the
   * corpse itself is airborne for about 180: f02's cow is hit at t=31.75, is
   * three quarters of the way across at 31.88 and gone by 31.93.
   */
  corpseLaunchMs: 690,
  corpseBurstMs: 350,
  corpseFlightMs: 180,
  corpseAdvanceMs: 350,
  /*
   * A clash death launches on the blow. f03 t=33.571 is the contact frame with
   * the cow already at -4 health, and at t=33.595 it is airborne; f01 and f02
   * are the same one frame.
   */
  corpseHoldMs: 40,
  /*
   * A death that was not a clash lies in its slot first. f02's worm is hit at
   * t=29.97 and its corpse leaves at 30.86 (890 ms); f06's otter is hit at
   * t=29.88 and leaves at 30.80 (920 ms). f03's hedgehog holds for 2.1 s, but
   * that is its own faint ability resolving pushing the cursor past this floor,
   * not a longer hold.
   */
  corpseBandageHoldMs: 890,

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
  // Nothing travels, so nothing grows on the way.
  projectileGrowMs: 0,
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
