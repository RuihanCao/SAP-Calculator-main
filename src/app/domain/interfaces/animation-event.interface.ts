/**
 * Structured battle animation events.
 *
 * The vocabulary maps 1:1 onto the behaviour grammar recorded from the real
 * game in `experiments/01-fight-animation-parity/CHECKLIST.md`. Every value is
 * plain data (numbers, strings, booleans and arrays of those) so a whole event
 * stream survives `postMessage` structured clone and `JSON.stringify` without
 * any sanitising step.
 *
 * Simultaneity is expressed by membership, not by adjacency: a mutual attack is
 * one `clash` with two hits, an area effect is one `projectile` with N targets,
 * and N pets that leave the board together are one `corpseLaunchGroup`.
 */

export type AnimationSide = 'player' | 'opponent';

/** A pet as it stood when the event was emitted. */
export interface AnimationPetRef {
  /** Stable for the whole battle; survives repositioning, faint and transform. */
  id: number;
  name: string;
  side: AnimationSide;
  /** Slot 0..4, front to back. Keeps the last slot for a pet already removed. */
  index: number;
  level: number;
  attack: number;
  health: number;
}

export interface AnimationToyRef {
  name: string;
  side: AnimationSide;
  level: number;
}

/** Whatever is acting: a pet or a toy. Toys have no board slot. */
export type AnimationActor =
  | { kind: 'pet'; pet: AnimationPetRef }
  | { kind: 'toy'; toy: AnimationToyRef };

export type AnimationHitKind = 'melee' | 'jump' | 'snipe' | 'effect';

export type AnimationStatKind =
  | 'attack'
  | 'health'
  | 'exp'
  | 'mana'
  | 'trumpet-gain'
  | 'trumpet-spend';

/**
 * What flies from source to target. Section 15 of the checklist: the projectile
 * is the icon of the thing being delivered.
 */
export type AnimationPayloadKind =
  | 'attack-glyph'
  | 'heart'
  | 'mana-potion'
  | 'xp-book'
  | 'perk-icon'
  | 'trumpet';

export type AnimationPhase =
  | 'before-battle'
  | 'start-of-battle'
  | 'after-start-of-battle'
  | 'turn';

export type AnimationAbilitySource = 'pet' | 'equipment' | 'toy';

/** One direction of damage. */
export interface AnimationHitDetail {
  source: AnimationPetRef;
  target: AnimationPetRef;
  damage: number;
  /** True when the hit landed but delivered 0, e.g. Melon or Coconut. */
  blocked: boolean;
}

export interface AnimationMove {
  pet: AnimationPetRef;
  from: number;
  to: number;
}

interface AnimationEventCommon {
  /** Position in the battle's event stream, 0-based, gap free. */
  seq: number;
  /**
   * Id of the ability activation this event belongs to, or null at top level.
   * Every event sharing a group was produced by one banner.
   */
  group: number | null;
}

/** Two front pets attacking each other resolve as one event (checklist 1). */
export interface AnimationClashEvent extends AnimationEventCommon {
  type: 'clash';
  jump: boolean;
  hits: [AnimationHitDetail, AnimationHitDetail];
}

/** One-directional damage: snipe, jump landing without a counter, perk burn. */
export interface AnimationHitEvent extends AnimationEventCommon {
  type: 'hit';
  kind: AnimationHitKind;
  source: AnimationActor | null;
  target: AnimationPetRef;
  damage: number;
  blocked: boolean;
}

/** The trigger banner (checklist 0 and 11). */
export interface AnimationAbilityTriggerEvent extends AnimationEventCommon {
  type: 'abilityTrigger';
  actor: AnimationActor;
  abilitySource: AnimationAbilitySource;
  /** The trigger that fired, when the call site knows it. */
  trigger: string | null;
  /** Every trigger the ability declares, for when `trigger` is unknown. */
  triggers: string[];
  abilityName: string | null;
  level: number;
  /** Rules text as the banner prints it, from the content JSON. */
  text: string | null;
  triggeredBy: AnimationPetRef | null;
}

/** The icon that travels from the banner or source to its targets. */
export interface AnimationProjectileEvent extends AnimationEventCommon {
  type: 'projectile';
  source: AnimationActor;
  payload: AnimationPayloadKind;
  /** One member per simultaneous target; empty only for a trumpet gain. */
  targets: AnimationPetRef[];
}

export interface AnimationStatChangeEvent extends AnimationEventCommon {
  type: 'statChange';
  kind: AnimationStatKind;
  /** Null for trumpets, which belong to a side rather than to a pet. */
  target: AnimationPetRef | null;
  side: AnimationSide;
  /** Signed: negative for a loss or a spend. */
  amount: number;
  /** Running side total, trumpets only. */
  total: number | null;
  levelFrom: number | null;
  levelTo: number | null;
}

/** Copied stats render as one white `attack health` label, not two pills. */
export interface AnimationStatCopyEvent extends AnimationEventCommon {
  type: 'statCopy';
  source: AnimationPetRef;
  target: AnimationPetRef;
  attack: number;
  health: number;
}

export interface AnimationFaintEvent extends AnimationEventCommon {
  type: 'faint';
  pet: AnimationPetRef;
  killedBy: AnimationPetRef | null;
}

/** Pets whose corpses leave the board in the same beat (checklist 3). */
export interface AnimationCorpseLaunchGroupEvent extends AnimationEventCommon {
  type: 'corpseLaunchGroup';
  pets: AnimationPetRef[];
}

/** Survivors closing up after a faint (checklist 4). One event per slide. */
export interface AnimationPushForwardEvent extends AnimationEventCommon {
  type: 'pushForward';
  side: AnimationSide;
  moves: AnimationMove[];
}

/** A deliberate reposition, arc over the pets being passed (checklist 9, 19). */
export interface AnimationMoveEvent extends AnimationEventCommon {
  type: 'move';
  side: AnimationSide;
  pet: AnimationPetRef;
  from: number;
  to: number;
  displaced: AnimationMove[];
}

/** One event per summoned pet, so a double summon stages twice (checklist 7). */
export interface AnimationSummonEvent extends AnimationEventCommon {
  type: 'summon';
  side: AnimationSide;
  pet: AnimationPetRef;
  index: number;
  summoner: AnimationPetRef | null;
}

/**
 * The puff in place. The new pet's own trigger arrives as its own
 * `abilityTrigger`, so a transform is two events (checklist 8).
 */
export interface AnimationTransformEvent extends AnimationEventCommon {
  type: 'transform';
  side: AnimationSide;
  from: AnimationPetRef;
  to: AnimationPetRef;
  index: number;
}

export interface AnimationEquipmentGainEvent extends AnimationEventCommon {
  type: 'equipmentGain';
  pet: AnimationPetRef;
  equipment: string;
  ailment: boolean;
}

export interface AnimationEquipmentBreakEvent extends AnimationEventCommon {
  type: 'equipmentBreak';
  pet: AnimationPetRef;
  equipment: string;
  ailment: boolean;
}

export interface AnimationPhaseEvent extends AnimationEventCommon {
  type: 'phase';
  phase: AnimationPhase;
  turn: number | null;
}

export interface AnimationOutcomeEvent extends AnimationEventCommon {
  type: 'outcome';
  winner: AnimationSide | 'draw';
}

export type AnimationEvent =
  | AnimationClashEvent
  | AnimationHitEvent
  | AnimationAbilityTriggerEvent
  | AnimationProjectileEvent
  | AnimationStatChangeEvent
  | AnimationStatCopyEvent
  | AnimationFaintEvent
  | AnimationCorpseLaunchGroupEvent
  | AnimationPushForwardEvent
  | AnimationMoveEvent
  | AnimationSummonEvent
  | AnimationTransformEvent
  | AnimationEquipmentGainEvent
  | AnimationEquipmentBreakEvent
  | AnimationPhaseEvent
  | AnimationOutcomeEvent;

export type AnimationEventType = AnimationEvent['type'];
