import {
  AnimationPayloadKind,
  AnimationSide,
  AnimationStatKind,
} from 'app/domain/interfaces/animation-event.interface';
import { AnimationBoardPet, AnimationBoardState } from './board-state';
import { BannerText, parseBannerText } from './banner-text';
import {
  AnimationCue,
  AnimationTimeline,
  BannerCue,
  ClashCue,
  CorpseLaunchCue,
  DamagePopupCue,
  MoveArcCue,
  ProjectileCue,
  SlideCue,
  StatPillCue,
} from './cues';
import { AnimationBeats, INTRO_BEATS, OUTRO_BEATS, getBeats } from './timing';

export type AnimationPhaseName = 'intro' | 'battle' | 'outro';

/**
 * Where a pet is on screen this frame, as opposed to which slot it owns.
 *
 * Anything drawn on a pet reads its place from here, so a numeral over a pet
 * that is mid jump lands on the pet rather than on the slot it left
 * (checklist 14).
 */
export interface PetAnchor {
  side: AnimationSide;
  /** Fractional slot, front to back, so a slide is a FLIP on identity. */
  slot: number;
  /** 0..1 height of an arc the pet is currently flying along. */
  lift: number;
  /** 0..1 of the way to the midline, for the clash lean and contact. */
  lean: number;
  /** Where a jump attacker is flying to, so it crosses the intervening pets. */
  jumpTargetSide: AnimationSide | null;
  jumpTargetSlot: number | null;
}

export interface PetView extends PetAnchor {
  pet: AnimationBoardPet;
  outline: 'none' | 'source' | 'hurt' | 'windup';
  /** 0..1 while the pet resolves out of a summon or transform puff. */
  reveal: number;
  /** Small icon over the acting pet, FAST only. */
  fastIcon: AnimationPayloadKind | null;
  equipmentBreaking: boolean;
  equipmentGaining: boolean;
  /** 0..1 gold level-up burst. */
  xpBurst: number;
  leveledUp: boolean;
  fainted: boolean;
  /**
   * 0..1 of the hard white contact flash painted over the sprite itself,
   * along its own silhouette, at a clash's contact frame.
   */
  impactFlash: number;
}

export interface CorpseView {
  petId: number;
  side: AnimationSide;
  name: string;
  level: number;
  attack: number;
  health: number;
  slot: number;
  progress: number;
  /** Thrown by the blow that killed it, rather than fading out in its slot. */
  viaClash: boolean;
}

export interface BurstView {
  id: string;
  side: AnimationSide;
  slot: number;
  progress: number;
}

export interface ProjectileView {
  id: string;
  payload: AnimationPayloadKind;
  fromSide: AnimationSide;
  /** Null when the source is a toy, which throws from the banner. */
  fromSlot: number | null;
  toSide: AnimationSide;
  toSlot: number;
  progress: number;
  /** Whether the throw delivers damage, which is drawn as the rock. */
  damage: boolean;
  /** Set when this one object carries both halves of a two part reward. */
  pairedPayload: AnimationPayloadKind | null;
  /** 0 to 1 over `projectileGrowMs`: the object growing to full size. */
  grow: number;
}

export interface PopupView {
  id: string;
  kind: 'damage' | 'stat' | 'copy' | 'mana';
  petId: number | null;
  side: AnimationSide;
  slot: number;
  /** Where the pet this belongs to actually is, so the numeral rides with it. */
  anchor: PetAnchor;
  text: string;
  statKind: AnimationStatKind | null;
  /**
   * Signed amount for a stat pill, so the stage can set the sign and the
   * numeral separately the way the client does: a white plus, then the stat's
   * own badge with the amount inside it.
   */
  amount: number | null;
  /**
   * Milliseconds since this popup's numeral last changed, which is what the
   * damage numeral's punch is timed off. A merge restarts it, because the
   * reference punches the new total the same way it punched the first hit.
   */
  ageMs: number;
  progress: number;
  merged: boolean;
  /**
   * Sideways place among the popups sharing this pet in this frame, centred on
   * zero, so a two part buff reads as two pills side by side (checklist 15).
   */
  offset: number;
}

export interface FlashView {
  id: string;
  aSide: AnimationSide;
  aSlot: number;
  bSide: AnimationSide;
  bSlot: number;
  progress: number;
}

export interface PuffView {
  id: string;
  kind: 'summon' | 'transform' | 'impact' | 'landing' | 'mana' | 'buff';
  side: AnimationSide;
  slot: number;
  progress: number;
  /** Held opaque while the sprite swaps inside it, so nothing crossfades. */
  opacity: number;
}

export interface BannerView {
  id: string;
  name: string;
  level: number;
  text: string | null;
  /** The card's own layout, checklist 11 and 15. */
  parsed: BannerText;
  side: AnimationSide;
  toy: boolean;
  payloads: AnimationPayloadKind[];
  progress: number;
}

export interface TrumpetCounterView {
  side: AnimationSide;
  total: number;
  flash: 'none' | 'gain' | 'spend';
  flashProgress: number;
}

export interface TrumpetTokenView {
  id: string;
  side: AnimationSide;
  direction: 'to-counter' | 'to-pet';
  toSlot: number | null;
  progress: number;
}

export interface IntroView {
  /** 1 while the shutter covers the field. */
  shutter: number;
  fieldOpen: number;
  playerCard: number;
  playerBoard: number;
  vsCard: number;
  opponentBoard: number;
  cardsVisible: boolean;
  controls: number;
}

/**
 * The end screen, checklist 18, as the calculator shows it. The real game's
 * screen also flies in a trophy row and a heart row and then animates one of
 * them, which is a shop run's score and has no meaning here, so this carries
 * only the two things the tool's own end screen draws: the field dimming and
 * the outcome caption with the way out under it.
 */
export interface OutroView {
  winner: AnimationSide | 'draw' | null;
  dim: number;
  face: number;
}

export interface FrameView {
  timeMs: number;
  phase: AnimationPhaseName;
  stepIndex: number;
  board: AnimationBoardState;
  pets: PetView[];
  corpses: CorpseView[];
  bursts: BurstView[];
  projectiles: ProjectileView[];
  popups: PopupView[];
  puffs: PuffView[];
  flash: FlashView | null;
  banner: BannerView | null;
  trumpets: Record<AnimationSide, TrumpetCounterView>;
  trumpetTokens: TrumpetTokenView[];
  intro: IntroView | null;
  outro: OutroView | null;
  /**
   * 0..1 opacity of the replay control bar. It fades in near the end of the
   * entrance and goes when the battle ends, exactly as the real one does
   * (checklist 17 and 18).
   */
  controls: number;
}

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

const progressOf = (cue: AnimationCue, timeMs: number): number => {
  const span = cue.endMs - cue.startMs;
  if (span <= 0) {
    return timeMs >= cue.startMs ? 1 : 0;
  }
  return clamp01((timeMs - cue.startMs) / span);
};

const isActive = (cue: AnimationCue, timeMs: number): boolean =>
  timeMs >= cue.startMs && timeMs < cue.endMs;

/** Paint the pets a contact frame lands on out in white, then let it fade. */
const whiteout = (
  into: Map<number, number>,
  timeMs: number,
  contactMs: number,
  petIds: readonly number[],
): void => {
  if (timeMs < contactMs || timeMs >= contactMs + CLASH_WHITEOUT_MS) {
    return;
  }
  const value = 1 - (timeMs - contactMs) / CLASH_WHITEOUT_MS;
  for (const petId of petIds) {
    into.set(petId, Math.max(into.get(petId) ?? 0, value));
  }
};

const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);
/**
 * The veil's own curve: quickest at the top of the fall, with a long tail.
 *
 * Read off clips/outro-victory, sampling the sky band the caption and the
 * buttons never cover. It leaves 157 at t=53.50 s and settles at 16 by
 * t=54.58 s, and it is 55% of the way down by t=53.89, which a straight line
 * would not be. Squared ease-out through those points puts the 90% to 10%
 * crossing at 0.633 of the fade, the same 0.633 s the reference takes.
 */
const easeOutQuad = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
/** Height of an arc at progress p, 0 at both ends and 1 in the middle. */
const arc = (p: number): number => 4 * p * (1 - p);

/**
 * How high a jump arcs, as a multiple of the arc a move flies.
 *
 * The attacker's own green outline tracks it: the outline is a translation of
 * the sprite, so the rise between two frames is free of whatever the art does
 * inside its card. Through clips/f11-jump-african-wild-dog the African Wild
 * Dog stands with that outline centred at 0.599 of the play area
 * (f_00830_0029371), tops out at 0.250 (f_00849_0029941) and hangs at 0.465
 * while it hits (f_00862_0030453). So the arc rises 0.349 of the play area and
 * the contact hangs 0.134 up it. A move's arc is LIFT_Y = 0.26 of the play
 * area, which makes a jump 1.34 of one and its contact 0.515 of one.
 *
 * Round 5 had only the contact frame and took it for half the arc. The apex
 * frame says the contact is closer to two fifths of it, and that the arc is a
 * third taller than a move's.
 */
export const JUMP_ARC_LIFT = 1.34;

/**
 * How high a jump attacker hangs while it is hitting, checklist 14.
 *
 * It does not land. On the reference contact frame (f11 t=30.45,
 * clips/f11-jump-african-wild-dog/f_00862_0030453.jpg) the African Wild Dog is
 * over the otter with its outline centred at 0.465 of the play area, against
 * the 0.599 a standing pet sits at, and the target stays visible under it
 * rather than being occluded by a pet planted in its slot.
 */
export const JUMP_CONTACT_LIFT = 0.515;

/**
 * How long a combatant is painted out in white at a contact frame.
 *
 * The reference flashes the two sprites themselves, hard edged along their own
 * silhouettes, and not only the soft bloom that hangs between them. In the
 * contact band of clips/f01-plain-trades the near-white pixel count sits at 85
 * through the wind-up (f_00880_0031086), goes to 6985 on the contact frame
 * (f_00882_0031156), is still 1855 on the next one (f_00883_0031228) and is
 * back to 130 by f_00884_0031277. A jump contact does the same at the target's
 * slot: 5.7% of that band to 30.9% on f_00856_0030173 of
 * clips/f11-jump-african-wild-dog, back under 10% two frames later.
 */
export const CLASH_WHITEOUT_MS = 130;

const rampAt = (timeMs: number, startMs: number, spanMs: number): number =>
  clamp01((timeMs - startMs) / Math.max(1, spanMs));

/**
 * A summon or transform cloud is opaque while the sprite is being swapped
 * inside it and only fades once the new pet has started to resolve, which is
 * what makes the swap a puff rather than a crossfade (checklist 7 and 8).
 */
const cloudOpacity = (progress: number): number =>
  progress < 0.18 ? progress / 0.18 : 1 - clamp01((progress - 0.6) / 0.4);

/** What a damage popup reads at one instant, which is not its running total. */
export const popupValueAt = (
  cue: DamagePopupCue,
  timeMs: number,
): { value: number; merged: boolean; progress: number; sinceMs: number } => {
  let index = 0;
  for (let at = cue.steps.length - 1; at >= 0; at -= 1) {
    if (timeMs >= cue.steps[at].atMs) {
      index = at;
      break;
    }
  }
  const step = cue.steps[index] ?? { atMs: cue.startMs, value: cue.value };
  return {
    value: step.value,
    merged: index > 0,
    progress: clamp01((timeMs - step.atMs) / Math.max(1, cue.lifeMs)),
    // When the numeral on screen last changed, which is what the punch times off.
    sinceMs: step.atMs,
  };
};

/**
 * Where a popup lands, as a key: a pet past the halfway point of a jump is
 * over its target's slot, so its numeral shares that point rather than the
 * slot it left.
 */
const anchorKey = (anchor: PetAnchor): string =>
  anchor.jumpTargetSlot != null && anchor.jumpTargetSide && anchor.lean >= 0.5
    ? `${anchor.jumpTargetSide}:${anchor.jumpTargetSlot}`
    : `${anchor.side}:${anchor.slot}`;

const statPillText = (cue: StatPillCue): string => {
  // Mana is not a pill: it lands as a large bare blue numeral in a white
  // flash, so it carries neither a sign nor a chip (checklist 14).
  if (cue.statKind === 'mana') {
    return `${Math.abs(cue.amount)}`;
  }
  const sign = cue.amount >= 0 ? '+' : '-';
  return `${sign}${Math.abs(cue.amount)}`;
};

/**
 * Samples a timeline into everything the stage draws at one instant.
 *
 * The timeline is authoritative and the sampler is pure, so a paused clock and
 * a rewound clock draw exactly the frame the same time produced on the way
 * past, and a test can assert a frame the same way an eye reads one.
 */
export class TimelineSampler {
  private readonly boardTrack: Array<{ atMs: number; board: AnimationBoardState }>;
  /** The same beat table the director used, for ramps read off wall clock. */
  private readonly beats: AnimationBeats;

  constructor(readonly timeline: AnimationTimeline) {
    this.boardTrack = timeline.steps
      .map((step) => ({ atMs: step.commitMs, board: step.board }))
      .sort((a, b) => a.atMs - b.atMs);
    this.beats = getBeats(timeline.mode);
  }

  boardAt(timeMs: number): AnimationBoardState {
    let result = this.timeline.initialBoard;
    for (const entry of this.boardTrack) {
      if (entry.atMs > timeMs) {
        break;
      }
      result = entry.board;
    }
    return result;
  }

  stepIndexAt(timeMs: number): number {
    let index = -1;
    for (const step of this.timeline.steps) {
      if (step.startMs > timeMs) {
        break;
      }
      index = step.index;
    }
    return index;
  }

  activeCues(timeMs: number): AnimationCue[] {
    return this.timeline.cues.filter((cue) => isActive(cue, timeMs));
  }

  frameAt(timeMs: number): FrameView {
    const timeline = this.timeline;
    const board = this.boardAt(timeMs);
    const active = this.activeCues(timeMs);

    const phase: AnimationPhaseName =
      timeMs < timeline.introEndMs
        ? 'intro'
        : timeMs >= timeline.battleEndMs
          ? 'outro'
          : 'battle';

    const slideByPet = new Map<number, SlideCue>();
    const moveByPet = new Map<number, MoveArcCue>();
    const leanByPet = new Map<number, number>();
    const jumpByPet = new Map<
      number,
      { travel: number; lift: number; targetSlot: number; targetSide: AnimationSide }
    >();
    const sourceOutlines = new Set<number>();
    const hurtOutlines = new Set<number>();
    const windupOutlines = new Set<number>();
    const whiteoutByPet = new Map<number, number>();
    const revealByPet = new Map<number, number>();
    const fastIconByPet = new Map<number, AnimationPayloadKind | null>();
    const equipmentBreaking = new Set<number>();
    const equipmentGaining = new Set<number>();
    const xpBurstByPet = new Map<number, number>();
    const leveledUp = new Set<number>();
    const corpses: CorpseView[] = [];
    const bursts: BurstView[] = [];
    const projectiles: ProjectileView[] = [];
    const popups: PopupView[] = [];
    const puffs: PuffView[] = [];
    const trumpetTokens: TrumpetTokenView[] = [];
    let banner: BannerView | null = null;
    let flash: FlashView | null = null;
    let clash: ClashCue | null = null;
    const trumpets: Record<AnimationSide, TrumpetCounterView> = {
      player: {
        side: 'player',
        total: board.trumpets.player,
        flash: 'none',
        flashProgress: 0,
      },
      opponent: {
        side: 'opponent',
        total: board.trumpets.opponent,
        flash: 'none',
        flashProgress: 0,
      },
    };

    const slotOf = (petId: number): number => {
      const pet =
        board.player.find((entry) => entry.id === petId) ??
        board.opponent.find((entry) => entry.id === petId);
      if (pet) {
        return pet.index;
      }
      const launching = active.find(
        (cue): cue is CorpseLaunchCue =>
          cue.kind === 'corpseLaunch' && cue.petId === petId,
      );
      return launching ? launching.index : 0;
    };

    const sideOf = (petId: number): AnimationSide =>
      board.opponent.some((pet) => pet.id === petId) ? 'opponent' : 'player';

    /** A pet standing in its slot, which is what anything off the board gets. */
    const slotAnchor = (side: AnimationSide, slot: number): PetAnchor => ({
      side,
      slot,
      lift: 0,
      lean: 0,
      jumpTargetSide: null,
      jumpTargetSlot: null,
    });

    for (const cue of active) {
      const progress = progressOf(cue, timeMs);
      switch (cue.kind) {
        case 'banner': {
          const view = cue as BannerCue;
          banner = {
            id: view.id,
            name: view.name,
            level: view.level,
            text: view.text,
            parsed: parseBannerText(view.text, view.trigger),
            side: view.side,
            toy: view.actorKind === 'toy',
            payloads: [...view.payloads],
            progress,
          };
          break;
        }
        case 'fastIcon': {
          if (cue.petId != null) {
            fastIconByPet.set(cue.petId, cue.payload);
          }
          break;
        }
        case 'sourceOutline':
          sourceOutlines.add(cue.petId);
          break;
        case 'hurtOutline':
          hurtOutlines.add(cue.petId);
          break;
        case 'windupOutline':
          windupOutlines.add(cue.petId);
          break;
        case 'slide':
          slideByPet.set(cue.petId, cue);
          break;
        case 'moveArc':
          moveByPet.set(cue.petId, cue);
          break;
        case 'clash':
          clash = cue;
          break;
        case 'summonPuff': {
          puffs.push({
            id: cue.id,
            kind: 'summon',
            side: cue.side,
            slot: slotOf(cue.petId),
            progress,
            opacity: cloudOpacity(progress),
          });
          revealByPet.set(
            cue.petId,
            rampAt(timeMs, cue.revealMs, cue.endMs - cue.revealMs),
          );
          break;
        }
        case 'transformPuff': {
          puffs.push({
            id: cue.id,
            kind: 'transform',
            side: cue.side,
            slot: slotOf(cue.toPetId),
            progress,
            opacity: cloudOpacity(progress),
          });
          revealByPet.set(
            cue.toPetId,
            rampAt(timeMs, cue.revealMs, cue.endMs - cue.revealMs),
          );
          break;
        }
        case 'impactPuff': {
          puffs.push({
            id: cue.id,
            kind: cue.variant,
            side: sideOf(cue.petId),
            slot: slotOf(cue.petId),
            progress,
            opacity: 1 - progress,
          });
          break;
        }
        case 'corpseLaunch': {
          corpses.push({
            petId: cue.petId,
            side: cue.side,
            name: cue.name,
            level: cue.level,
            attack: cue.attack,
            health: cue.health,
            slot: cue.index,
            progress,
            viaClash: cue.viaClash,
          });
          break;
        }
        case 'starburst': {
          bursts.push({
            id: cue.id,
            side: cue.side,
            slot: cue.index,
            progress,
          });
          break;
        }
        case 'projectile': {
          const view = cue as ProjectileCue;
          // The grow is a wall-clock ramp rather than a fraction of the cue, so
          // a long throw and a short one come out of the attacker the same way.
          const growMs = this.beats.projectileGrowMs;
          const grow = growMs > 0 ? Math.min(1, (timeMs - cue.startMs) / growMs) : 1;
          for (const target of view.targets) {
            projectiles.push({
              id: `${view.id}-${target.petId}`,
              payload: view.payload,
              fromSide: view.fromSide,
              fromSlot: view.fromPetId != null ? slotOf(view.fromPetId) : null,
              toSide: target.side,
              toSlot: slotOf(target.petId),
              progress,
              damage: view.damage,
              pairedPayload: view.pairedPayload,
              grow,
            });
          }
          break;
        }
        case 'damagePopup': {
          const view = cue as DamagePopupCue;
          const shown = popupValueAt(view, timeMs);
          popups.push({
            id: view.id,
            kind: 'damage',
            petId: view.petId,
            side: view.side,
            slot: slotOf(view.petId),
            anchor: slotAnchor(view.side, slotOf(view.petId)),
            text: `${shown.value}`,
            statKind: null,
            amount: null,
            ageMs: timeMs - (shown.sinceMs ?? view.startMs),
            progress: shown.progress,
            merged: shown.merged,
            offset: 0,
          });
          break;
        }
        case 'statPill': {
          const view = cue as StatPillCue;
          popups.push({
            id: view.id,
            kind: view.statKind === 'mana' ? 'mana' : 'stat',
            petId: view.petId,
            side: view.side,
            slot: view.petId != null ? slotOf(view.petId) : 0,
            anchor: slotAnchor(view.side, view.petId != null ? slotOf(view.petId) : 0),
            text: statPillText(view),
            statKind: view.statKind,
            amount: view.amount,
            ageMs: timeMs - cue.startMs,
            progress,
            merged: false,
            offset: 0,
          });
          break;
        }
        case 'statCopyLabel': {
          popups.push({
            id: cue.id,
            kind: 'copy',
            petId: cue.petId,
            side: sideOf(cue.petId),
            slot: slotOf(cue.petId),
            anchor: slotAnchor(sideOf(cue.petId), slotOf(cue.petId)),
            text: `${cue.attack} ${cue.health}`,
            statKind: null,
            amount: null,
            ageMs: timeMs - cue.startMs,
            progress,
            merged: false,
            offset: 0,
          });
          break;
        }
        case 'equipmentBreak':
          equipmentBreaking.add(cue.petId);
          break;
        case 'equipmentGain':
          equipmentGaining.add(cue.petId);
          break;
        case 'xpBurst': {
          xpBurstByPet.set(cue.petId, progress);
          if (cue.levelTo != null && cue.levelFrom !== cue.levelTo) {
            leveledUp.add(cue.petId);
          }
          break;
        }
        case 'trumpetToken': {
          trumpetTokens.push({
            id: cue.id,
            side: cue.side,
            direction: cue.direction,
            toSlot: cue.petId != null ? slotOf(cue.petId) : null,
            progress,
          });
          break;
        }
        case 'trumpetCounterFlash': {
          trumpets[cue.side] = {
            side: cue.side,
            total: cue.total,
            flash: cue.tone,
            flashProgress: progress,
          };
          break;
        }
        default:
          break;
      }
    }

    if (clash) {
      const contact = clash.contactMs;
      const [first, second] = clash.hits;
      if (clash.jump && clash.jumperId != null && clash.jumpTargetId != null) {
        // Only the attacker travels (checklist 14): out to the target's slot,
        // a beat of contact there, then a second arc home. The target holds
        // its slot throughout, so it gets no lean and no lift.
        const targetSlot = slotOf(clash.jumpTargetId);
        const targetSide = sideOf(clash.jumpTargetId);
        let travel: number;
        let lift: number;
        if (timeMs < contact) {
          const p = rampAt(timeMs, clash.startMs, contact - clash.startMs);
          travel = easeInOut(p);
          lift = arc(p) * JUMP_ARC_LIFT;
        } else if (timeMs < clash.returnStartMs) {
          travel = 1;
          lift = JUMP_CONTACT_LIFT;
        } else {
          const p = rampAt(
            timeMs,
            clash.returnStartMs,
            clash.endMs - clash.returnStartMs,
          );
          travel = 1 - easeInOut(p);
          // The way home leaves from the height it was hanging at, so there is
          // no drop to the ground between the hit and the jump back.
          lift = Math.max(arc(p) * JUMP_ARC_LIFT, JUMP_CONTACT_LIFT * (1 - p));
        }
        jumpByPet.set(clash.jumperId, { travel, lift, targetSlot, targetSide });
        whiteout(whiteoutByPet, timeMs, contact, [
          clash.jumperId,
          clash.jumpTargetId,
        ]);
        const flashProgress = rampAt(timeMs, contact, 220);
        if (timeMs >= contact && flashProgress < 1) {
          // The contact frame is at the target's slot, not at the midline.
          flash = {
            id: clash.id,
            aSide: targetSide,
            aSlot: targetSlot,
            bSide: targetSide,
            bSlot: targetSlot,
            progress: flashProgress,
          };
        }
      } else {
        const lean =
          timeMs <= contact
            ? easeInOut(rampAt(timeMs, clash.startMs, contact - clash.startMs))
            : 1 - easeOut(rampAt(timeMs, contact, Math.max(1, clash.endMs - contact)));
        if (first && second) {
          const flashProgress = rampAt(timeMs, contact, 220);
          if (timeMs >= contact && flashProgress < 1) {
            flash = {
              id: clash.id,
              aSide: sideOf(first.sourceId),
              aSlot: slotOf(first.sourceId),
              bSide: sideOf(second.sourceId),
              bSlot: slotOf(second.sourceId),
              progress: flashProgress,
            };
          }
        }
        whiteout(
          whiteoutByPet,
          timeMs,
          contact,
          clash.hits.map((hit) => hit.sourceId),
        );
        for (const hit of clash.hits) {
          const attacker = hit.sourceId;
          const existing = leanByPet.get(attacker) ?? 0;
          leanByPet.set(attacker, Math.max(existing, lean));
        }
      }
    }

    const pets: PetView[] = [];
    for (const pet of [...board.player, ...board.opponent]) {
      const slide = slideByPet.get(pet.id);
      const move = moveByPet.get(pet.id);
      let slot = pet.index;
      let lift = 0;
      if (slide) {
        const p = easeOut(progressOf(slide, timeMs));
        slot = slide.fromIndex + (slide.toIndex - slide.fromIndex) * p;
      }
      if (move) {
        const p = progressOf(move, timeMs);
        slot = move.fromIndex + (move.toIndex - move.fromIndex) * easeInOut(p);
        lift = arc(p);
      }
      const jump = jumpByPet.get(pet.id);
      const lean = jump ? jump.travel : (leanByPet.get(pet.id) ?? 0);
      if (jump) {
        lift = jump.lift;
      }
      pets.push({
        pet,
        side: pet.side,
        slot,
        lift,
        lean,
        // A pet that has died wears the bandage and nothing else: on f02
        // t=30.16 to 30.84 the dead worm has its plain white halo, no red hurt
        // line, and the same is true of the peacock on f10. Ours kept the hurt
        // outline running under the bandage for its full second.
        outline: pet.fainted
          ? 'none'
          : sourceOutlines.has(pet.id)
            ? 'source'
            : hurtOutlines.has(pet.id)
              ? 'hurt'
              : windupOutlines.has(pet.id)
                ? 'windup'
                : 'none',
        reveal: revealByPet.get(pet.id) ?? 1,
        fastIcon: fastIconByPet.get(pet.id) ?? null,
        jumpTargetSide: jump ? jump.targetSide : null,
        jumpTargetSlot: jump ? jump.targetSlot : null,
        equipmentBreaking: equipmentBreaking.has(pet.id),
        equipmentGaining: equipmentGaining.has(pet.id),
        xpBurst: xpBurstByPet.get(pet.id) ?? 0,
        leveledUp: leveledUp.has(pet.id),
        fainted: pet.fainted,
        impactFlash: whiteoutByPet.get(pet.id) ?? 0,
      });
    }

    // A numeral belongs to a pet, not to a slot: a jump attacker takes its own
    // damage popup with it, so the number lands inside the contact flash at
    // the target's slot instead of hanging over the slot it left.
    const anchorByPet = new Map<number, PetAnchor>();
    for (const view of pets) {
      anchorByPet.set(view.pet.id, view);
    }
    for (const popup of popups) {
      const anchor = popup.petId != null ? anchorByPet.get(popup.petId) : null;
      if (anchor) {
        popup.anchor = anchor;
        popup.slot = anchor.slot;
      }
    }

    // Two numerals that land on the same point sit side by side rather than on
    // top of each other: a multi part buff is one pill per part (checklist 15),
    // and a jump attack puts the attacker's damage and its target's counter on
    // the same slot in the same frame (checklist 14).
    const byPoint = new Map<string, PopupView[]>();
    for (const popup of popups) {
      const key = anchorKey(popup.anchor);
      byPoint.set(key, [...(byPoint.get(key) ?? []), popup]);
    }
    for (const group of byPoint.values()) {
      if (group.length < 2) {
        continue;
      }
      group.forEach((popup, index) => {
        popup.offset = index - (group.length - 1) / 2;
      });
    }

    return {
      timeMs,
      phase,
      stepIndex: this.stepIndexAt(timeMs),
      board,
      pets,
      corpses,
      bursts,
      projectiles,
      popups,
      puffs,
      flash,
      banner,
      trumpets,
      trumpetTokens,
      intro: phase === 'intro' ? sampleIntro(timeMs) : null,
      outro:
        phase === 'outro'
          ? sampleOutro(timeMs - timeline.battleEndMs, timeline.winner)
          : null,
      controls:
        phase === 'intro'
          ? rampAt(timeMs, INTRO_BEATS.controlsMs, 400)
          : phase === 'outro'
            ? 0
            : 1,
    };
  }
}

export const sampleIntro = (timeMs: number): IntroView => ({
  shutter:
    timeMs < INTRO_BEATS.shutterOpenMs
      ? rampAt(timeMs, INTRO_BEATS.shutterCloseMs, INTRO_BEATS.shutterCloseEndMs)
      : 1 - rampAt(timeMs, INTRO_BEATS.shutterOpenMs, 600),
  fieldOpen: rampAt(timeMs, INTRO_BEATS.shutterOpenMs, 600),
  playerCard: rampAt(timeMs, INTRO_BEATS.playerCardMs, 500),
  playerBoard: rampAt(
    timeMs,
    INTRO_BEATS.playerBoardMs,
    INTRO_BEATS.playerBoardSettledMs - INTRO_BEATS.playerBoardMs,
  ),
  vsCard: rampAt(timeMs, INTRO_BEATS.vsCardMs, 400),
  opponentBoard: rampAt(
    timeMs,
    INTRO_BEATS.opponentBoardMs,
    INTRO_BEATS.opponentBoardSettledMs - INTRO_BEATS.opponentBoardMs,
  ),
  cardsVisible: timeMs < INTRO_BEATS.cardsClearMs,
  controls: rampAt(timeMs, INTRO_BEATS.controlsMs, 400),
});

export const sampleOutro = (
  elapsedMs: number,
  winner: AnimationSide | 'draw' | null,
): OutroView => ({
  winner,
  dim: easeOutQuad(rampAt(elapsedMs, OUTRO_BEATS.dimMs, OUTRO_BEATS.dimFadeMs)),
  face: rampAt(elapsedMs, OUTRO_BEATS.faceMs, 500),
});

export const createTimelineSampler = (
  timeline: AnimationTimeline,
): TimelineSampler => new TimelineSampler(timeline);
