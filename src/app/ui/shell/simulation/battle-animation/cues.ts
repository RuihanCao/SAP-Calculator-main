import {
  AnimationPayloadKind,
  AnimationSide,
  AnimationStatKind,
} from 'app/domain/interfaces/animation-event.interface';
import { AnimationBoardState } from './board-state';

/** Everything the stage can draw. One cue is one visible thing over a window. */
export type AnimationCueKind =
  | 'banner'
  | 'fastIcon'
  | 'sourceOutline'
  | 'hurtOutline'
  | 'windupOutline'
  | 'projectile'
  | 'clash'
  | 'damagePopup'
  | 'statPill'
  | 'statCopyLabel'
  | 'impactPuff'
  | 'corpse'
  | 'corpseLaunch'
  | 'starburst'
  | 'slide'
  | 'summonPuff'
  | 'transformPuff'
  | 'moveArc'
  | 'equipmentGain'
  | 'equipmentBreak'
  | 'trumpetToken'
  | 'trumpetCounterFlash'
  | 'xpBurst';

interface CueBase {
  id: string;
  kind: AnimationCueKind;
  startMs: number;
  endMs: number;
  /** Event that produced the cue, for tracing a frame back to the stream. */
  seq: number;
  group: number | null;
}

export interface BannerCue extends CueBase {
  kind: 'banner';
  actorKind: 'pet' | 'toy';
  petId: number | null;
  name: string;
  level: number;
  side: AnimationSide;
  text: string | null;
  trigger: string | null;
  abilitySource: 'pet' | 'equipment' | 'toy';
  /** Payload icons the banner's rules text hands to its projectiles. */
  payloads: AnimationPayloadKind[];
}

/** FAST draws this over the acting pet instead of a banner (checklist 16). */
export interface FastIconCue extends CueBase {
  kind: 'fastIcon';
  petId: number | null;
  side: AnimationSide;
  payload: AnimationPayloadKind | null;
}

export interface OutlineCue extends CueBase {
  kind: 'sourceOutline' | 'hurtOutline' | 'windupOutline';
  petId: number;
}

export interface ProjectileTarget {
  petId: number;
  side: AnimationSide;
}

export interface ProjectileCue extends CueBase {
  kind: 'projectile';
  payload: AnimationPayloadKind;
  /** A pet source throws from its slot; a toy throws from the banner. */
  fromPetId: number | null;
  fromSide: AnimationSide;
  targets: ProjectileTarget[];
  /**
   * Whether this throw delivers damage rather than a buff.
   *
   * The engine calls both an attack payload, but the client does not draw them
   * with the same object: a snipe throws the grey damage rock and an attack
   * buff throws the grey fist (f02 t=29.7 against f10 t=34.4). The director
   * reads which one it is from the step the throw lands on.
   */
  damage: boolean;
  /**
   * The other half of a two part reward thrown as one object.
   *
   * A buff that grants attack and health at once is a single `HeartFist` in the
   * client, not two icons one after the other (f10 t=34.19 to 34.53), so the
   * pair is folded into one cue and drawn with the client's own paired sprite.
   */
  pairedPayload: AnimationPayloadKind | null;
}

export interface ClashHitCue {
  sourceId: number;
  targetId: number;
  damage: number;
  blocked: boolean;
}

export interface ClashCue extends CueBase {
  kind: 'clash';
  jump: boolean;
  /** The single contact frame, checklist 1. */
  contactMs: number;
  /**
   * A jump attacker holds at the target's slot after contact and starts back
   * here (checklist 14). Equal to `contactMs` for an ordinary clash.
   */
  returnStartMs: number;
  /** The pet that travels in a jump; the target never leaves its slot. */
  jumperId: number | null;
  jumpTargetId: number | null;
  hits: ClashHitCue[];
  attackerIds: number[];
}

/** One hit's contribution to a popup, and what the numeral reads from then on. */
export interface DamagePopupStep {
  atMs: number;
  /** Running total the popup shows from `atMs` until the next step. */
  value: number;
}

/**
 * Per hit, and merged in place while it is still alive (checklist 19).
 *
 * A merge does not rewrite what the popup already showed: `steps` keeps the
 * numeral each hit put on screen, so the first hit still reads its own damage
 * in its own frames and only becomes the running total from the merge onward.
 */
export interface DamagePopupCue extends CueBase {
  kind: 'damagePopup';
  petId: number;
  side: AnimationSide;
  /** Running total after the last merge. */
  value: number;
  merges: number;
  steps: DamagePopupStep[];
  /** Lifetime of one hit's numeral, which is also the merge window. */
  lifeMs: number;
}

export interface StatPillCue extends CueBase {
  kind: 'statPill';
  /** Null for trumpets, which belong to a side. */
  petId: number | null;
  side: AnimationSide;
  statKind: AnimationStatKind;
  amount: number;
}

export interface StatCopyLabelCue extends CueBase {
  kind: 'statCopyLabel';
  petId: number;
  attack: number;
  health: number;
}

/**
 * A white puff on a pet: a ranged arrival, a jump attacker landing back in its
 * own slot, or the flash a mana delivery lands with (checklist 5, 14 and 15).
 */
export interface ImpactPuffCue extends CueBase {
  kind: 'impactPuff';
  petId: number;
  /**
   * `buff`: a stat gain arrives in a white flash on the pet with
   * sparks lifting off it, exactly the way mana does (f10 t=34.53, where the
   * Hippo is painted out white as its knock-out reward lands).
   */
  variant: 'impact' | 'landing' | 'mana' | 'buff';
}

/**
 * Dead in place, wearing the crossed bandage. Ends when the corpse launches.
 *
 * `viaClash` is how long that is: a pet killed at the midline is thrown by the
 * blow and leaves in the next frame, one killed by a snipe or an ability stands
 * there for the best part of a second first (checklist 3).
 */
export interface CorpseCue extends CueBase {
  kind: 'corpse';
  petId: number;
  side: AnimationSide;
  index: number;
  name: string;
  level: number;
  attack: number;
  health: number;
  viaClash: boolean;
}

/**
 * A body leaving the board. Two shapes, and which one is which is measured.
 *
 * `viaClash` true: the blow throws it. It flies up and away over its own board
 * with a smoke trail behind it and a star spray where it goes off
 * (f01 t=31.82, f02 t=31.75, f03 t=33.57).
 *
 * `viaClash` false: nothing threw it, so it does not fly. The body simply goes
 * in a bright flash and a white cloud in its own slot, and there is no trail
 * and no spray anywhere on the field (f02 t=30.88, the sniped worm; f06 t=30.82,
 * the sniped otter). Launching every corpse sent a body across the field on a
 * snipe kill, away from nothing.
 */
export interface CorpseLaunchCue extends CueBase {
  kind: 'corpseLaunch';
  petId: number;
  side: AnimationSide;
  index: number;
  name: string;
  level: number;
  attack: number;
  health: number;
  groupId: string;
  viaClash: boolean;
}

export interface StarburstCue extends CueBase {
  kind: 'starburst';
  side: AnimationSide;
  /** Slot the corpse group left from, so the burst is where it went out. */
  index: number;
  groupId: string;
}

/** Push forward, keyed by pet identity so the slide is a FLIP (checklist 4). */
export interface SlideCue extends CueBase {
  kind: 'slide';
  petId: number;
  side: AnimationSide;
  fromIndex: number;
  toIndex: number;
}

export interface SummonPuffCue extends CueBase {
  kind: 'summonPuff';
  petId: number;
  side: AnimationSide;
  index: number;
  revealMs: number;
}

export interface TransformPuffCue extends CueBase {
  kind: 'transformPuff';
  fromPetId: number;
  toPetId: number;
  side: AnimationSide;
  index: number;
  revealMs: number;
}

/** A deliberate reposition: the pet arcs over what it passes (checklist 9). */
export interface MoveArcCue extends CueBase {
  kind: 'moveArc';
  petId: number;
  side: AnimationSide;
  fromIndex: number;
  toIndex: number;
}

export interface EquipmentCue extends CueBase {
  kind: 'equipmentGain' | 'equipmentBreak';
  petId: number;
  equipment: string;
  ailment: boolean;
}

export interface TrumpetTokenCue extends CueBase {
  kind: 'trumpetToken';
  side: AnimationSide;
  direction: 'to-counter' | 'to-pet';
  petId: number | null;
}

export interface TrumpetCounterFlashCue extends CueBase {
  kind: 'trumpetCounterFlash';
  side: AnimationSide;
  tone: 'gain' | 'spend';
  total: number;
}

export interface XpBurstCue extends CueBase {
  kind: 'xpBurst';
  petId: number;
  levelFrom: number | null;
  levelTo: number | null;
}

export type AnimationCue =
  | BannerCue
  | FastIconCue
  | OutlineCue
  | ProjectileCue
  | ClashCue
  | DamagePopupCue
  | StatPillCue
  | StatCopyLabelCue
  | ImpactPuffCue
  | CorpseCue
  | CorpseLaunchCue
  | StarburstCue
  | SlideCue
  | SummonPuffCue
  | TransformPuffCue
  | MoveArcCue
  | EquipmentCue
  | TrumpetTokenCue
  | TrumpetCounterFlashCue
  | XpBurstCue;

export type AnimationStepKind =
  | 'phase'
  | 'banner'
  | 'projectile'
  | 'clash'
  | 'hit'
  | 'statChange'
  | 'statCopy'
  | 'faint'
  | 'corpseLaunch'
  | 'pushForward'
  | 'move'
  | 'summon'
  | 'transform'
  | 'equipment'
  | 'outcome';

/**
 * One event's slice of the timeline.
 *
 * `commitMs` is when the board changes, which is not when the step starts: a
 * clash commits at its contact frame, a delivery commits when its projectile
 * lands. Sampling the board is a search on `commitMs`.
 */
export interface AnimationStep {
  index: number;
  seq: number;
  kind: AnimationStepKind;
  startMs: number;
  endMs: number;
  commitMs: number;
  cueIds: string[];
  board: AnimationBoardState;
}

export interface AnimationTimeline {
  mode: 'normal' | 'fast';
  /** Battle beats end here; the end screen runs from it. */
  battleEndMs: number;
  durationMs: number;
  steps: AnimationStep[];
  cues: AnimationCue[];
  initialBoard: AnimationBoardState;
  finalBoard: AnimationBoardState;
  winner: AnimationSide | 'draw' | null;
}
