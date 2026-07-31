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
  kind: 'sourceOutline' | 'hurtOutline';
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
  hits: ClashHitCue[];
  attackerIds: number[];
}

/**
 * Per hit, and merged in place while it is still alive (checklist 19).
 * `value` and `endMs` are rewritten by a merge, `merges` counts them.
 */
export interface DamagePopupCue extends CueBase {
  kind: 'damagePopup';
  petId: number;
  side: AnimationSide;
  value: number;
  merges: number;
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

export interface ImpactPuffCue extends CueBase {
  kind: 'impactPuff';
  petId: number;
}

/** Dead in place. Ends when the corpse group launches. */
export interface CorpseCue extends CueBase {
  kind: 'corpse';
  petId: number;
  side: AnimationSide;
  index: number;
  name: string;
  level: number;
  attack: number;
  health: number;
}

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
}

export interface StarburstCue extends CueBase {
  kind: 'starburst';
  side: AnimationSide;
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
  /** Battle beats start here, after the entrance (checklist 18). */
  introEndMs: number;
  /** Battle beats end here; the end screen runs from it. */
  battleEndMs: number;
  durationMs: number;
  steps: AnimationStep[];
  cues: AnimationCue[];
  initialBoard: AnimationBoardState;
  finalBoard: AnimationBoardState;
  winner: AnimationSide | 'draw' | null;
}
