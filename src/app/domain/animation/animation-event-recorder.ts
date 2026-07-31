import {
  AnimationActor,
  AnimationEvent,
  AnimationHitDetail,
  AnimationHitKind,
  AnimationMove,
  AnimationPayloadKind,
  AnimationPetRef,
  AnimationPhase,
  AnimationSide,
  AnimationStatKind,
  AnimationAbilitySource,
} from 'app/domain/interfaces/animation-event.interface';

/**
 * Minimal structural views of the engine entities, so the recorder can live in
 * the domain layer without importing Pet or Player and creating a cycle.
 */
export interface AnimationPlayerLike {
  isOpponent?: boolean;
  getPet?(index: number): AnimationPetLike | null | undefined;
}

export interface AnimationPetLike {
  name: string;
  level: number;
  attack: number;
  health: number;
  position: number;
  parent?: AnimationPlayerLike | null;
}

export interface AnimationToyLike {
  name: string;
  level: number;
}

/** Resolves the banner rules text; injected so the domain keeps no asset deps. */
export type AnimationTextResolver = (
  source: AnimationAbilitySource,
  name: string,
  level: number,
) => string | null;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** An event before it is committed, i.e. before it is given its `seq`. */
type PendingEvent = DistributiveOmit<AnimationEvent, 'seq'> & { seq?: number };

interface Frame {
  kind: 'ability' | 'clash' | 'plain';
  group: number | null;
  actor: AnimationActor | null;
  jump: boolean;
  events: PendingEvent[];
}

const PAYLOAD_BY_STAT: Readonly<Record<AnimationStatKind, AnimationPayloadKind>> =
  {
    attack: 'attack-glyph',
    health: 'heart',
    exp: 'xp-book',
    mana: 'mana-potion',
    'trumpet-gain': 'trumpet',
    'trumpet-spend': 'trumpet',
  };

const petKey = (ref: AnimationPetRef): number => ref.id;

/**
 * Collects the structured animation event stream for one battle.
 *
 * Nothing here reads or writes engine state: every method is a pure record of
 * something the engine already did, and every method is inert until
 * `beginCapture` runs, so pet construction and board setup emit nothing.
 */
export class AnimationEventRecorder {
  private events: AnimationEvent[] = [];
  private capturing = false;
  private seq = 0;
  private groupSeq = 0;
  private frames: Frame[] = [];
  private ids = new WeakMap<object, number>();
  private nextDynamicId = 101;
  private corpseDepth = 0;
  private corpsePets: AnimationPetRef[] = [];
  private resolveText: AnimationTextResolver | null = null;

  setTextResolver(resolver: AnimationTextResolver | null): void {
    this.resolveText = resolver;
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  getEvents(): AnimationEvent[] {
    return this.events;
  }

  /** Mirrors LogService.reset: a new battle gets a new array. */
  reset(): void {
    this.events = [];
    this.capturing = false;
    this.seq = 0;
    this.groupSeq = 0;
    this.frames = [];
    this.ids = new WeakMap<object, number>();
    this.nextDynamicId = 101;
    this.corpseDepth = 0;
    this.corpsePets = [];
  }

  /**
   * Opens the capture window. Seeding ids from the starting boards keeps every
   * id slot derived, so a stream stays comparable across reruns even when the
   * engine writes two simultaneous faints in a different order.
   */
  beginCapture(
    player: AnimationPlayerLike | null | undefined,
    opponent: AnimationPlayerLike | null | undefined,
  ): void {
    this.capturing = true;
    this.seedBoard(player, 1);
    this.seedBoard(opponent, 11);
  }

  endCapture(): void {
    this.capturing = false;
    this.frames = [];
  }

  private seedBoard(
    board: AnimationPlayerLike | null | undefined,
    base: number,
  ): void {
    if (!board?.getPet) {
      return;
    }
    for (let slot = 0; slot <= 4; slot++) {
      const pet = board.getPet(slot);
      if (pet && !this.ids.has(pet as unknown as object)) {
        this.ids.set(pet as unknown as object, base + slot);
      }
    }
  }

  // ---------------------------------------------------------------- refs ----

  private idFor(pet: AnimationPetLike): number {
    const key = pet as unknown as object;
    let id = this.ids.get(key);
    if (id == null) {
      id = this.nextDynamicId++;
      this.ids.set(key, id);
    }
    return id;
  }

  private sideOf(board: AnimationPlayerLike | null | undefined): AnimationSide {
    return board?.isOpponent ? 'opponent' : 'player';
  }

  petRef(pet: AnimationPetLike | null | undefined): AnimationPetRef | null {
    if (!pet) {
      return null;
    }
    const index = Number.isInteger(pet.position) ? pet.position : -1;
    return {
      id: this.idFor(pet),
      name: pet.name,
      side: this.sideOf(pet.parent),
      index,
      level: pet.level,
      attack: pet.attack,
      health: pet.health,
    };
  }

  private petActor(pet: AnimationPetLike | null | undefined): AnimationActor | null {
    const ref = this.petRef(pet);
    return ref ? { kind: 'pet', pet: ref } : null;
  }

  private toyActor(
    toy: AnimationToyLike | null | undefined,
    board: AnimationPlayerLike | null | undefined,
  ): AnimationActor | null {
    if (!toy?.name) {
      return null;
    }
    return {
      kind: 'toy',
      toy: { name: toy.name, side: this.sideOf(board), level: toy.level ?? 1 },
    };
  }

  // -------------------------------------------------------------- frames ----

  private top(): Frame | null {
    return this.frames.length ? this.frames[this.frames.length - 1] : null;
  }

  private push(event: PendingEvent): void {
    const frame = this.top();
    if (frame) {
      event.group = frame.group;
      frame.events.push(event);
      return;
    }
    event.group = null;
    this.commit(event);
  }

  private commit(event: PendingEvent): void {
    event.seq = this.seq++;
    this.events.push(event as AnimationEvent);
  }

  private flush(events: PendingEvent[]): void {
    const frame = this.top();
    if (frame) {
      for (const event of events) {
        frame.events.push(event);
      }
      return;
    }
    for (const event of events) {
      this.commit(event);
    }
  }

  // ------------------------------------------------------- ability window ---

  /**
   * Opens the banner for one ability activation. Everything recorded until the
   * matching `endAbility` belongs to this banner, which is what lets the
   * recorder synthesise the projectiles the effect throws.
   */
  beginAbility(options: {
    pet?: AnimationPetLike | null;
    toy?: AnimationToyLike | null;
    board?: AnimationPlayerLike | null;
    abilitySource: AnimationAbilitySource;
    trigger?: string | null;
    triggers?: string[];
    abilityName?: string | null;
    /** Content-JSON key for the banner text, when it is not the actor's name. */
    textName?: string | null;
    level?: number | null;
    triggeredBy?: AnimationPetLike | null;
  }): void {
    if (!this.capturing) {
      return;
    }
    const actor = options.toy
      ? this.toyActor(options.toy, options.board)
      : this.petActor(options.pet);
    if (!actor) {
      // Still open a frame so begin/end stay balanced.
      this.frames.push({
        kind: 'plain',
        group: this.top()?.group ?? null,
        actor: null,
        jump: false,
        events: [],
      });
      return;
    }

    const group = this.groupSeq++;
    const level =
      options.level ??
      (actor.kind === 'pet' ? actor.pet.level : actor.toy.level) ??
      1;
    const defaultName =
      actor.kind === 'toy' ? actor.toy.name : actor.pet.name;
    const lookupName = options.textName ?? defaultName;
    const text = lookupName
      ? (this.resolveText?.(options.abilitySource, lookupName, level) ?? null)
      : null;

    const frame: Frame = {
      kind: 'ability',
      group,
      actor,
      jump: false,
      events: [],
    };
    frame.events.push({
      type: 'abilityTrigger',
      group,
      actor,
      abilitySource: options.abilitySource,
      trigger: options.trigger ?? null,
      triggers: options.triggers ? [...options.triggers] : [],
      abilityName: options.abilityName ?? null,
      level,
      text,
      triggeredBy: this.petRef(options.triggeredBy),
    });
    this.frames.push(frame);
  }

  endAbility(): void {
    if (!this.capturing) {
      return;
    }
    const frame = this.frames.pop();
    if (!frame) {
      return;
    }
    if (frame.kind !== 'ability' || !frame.actor) {
      this.flush(frame.events);
      return;
    }
    const projectiles = this.synthesizeProjectiles(frame);
    const out =
      projectiles.length > 0
        ? [frame.events[0], ...projectiles, ...frame.events.slice(1)]
        : frame.events;
    this.flush(out);
  }

  /**
   * One projectile per kind of thing delivered, each carrying all of that
   * kind's simultaneous targets (checklist 6 and 15).
   */
  private synthesizeProjectiles(frame: Frame): PendingEvent[] {
    const source = frame.actor;
    if (!source) {
      return [];
    }
    const order: AnimationPayloadKind[] = [];
    const byPayload = new Map<AnimationPayloadKind, AnimationPetRef[]>();

    const add = (
      payload: AnimationPayloadKind,
      targets: (AnimationPetRef | null)[],
    ): void => {
      let list = byPayload.get(payload);
      if (!list) {
        list = [];
        byPayload.set(payload, list);
        order.push(payload);
      }
      for (const target of targets) {
        if (target && !list.some((known) => petKey(known) === petKey(target))) {
          list.push(target);
        }
      }
    };

    for (const event of frame.events) {
      // Only this activation's own effects, not a nested activation's.
      if (event.group !== frame.group || event.type === 'abilityTrigger') {
        continue;
      }
      switch (event.type) {
        case 'hit':
          add('attack-glyph', [event.target]);
          break;
        // A clash throws nothing: in a jump attack the pet is the projectile
        // (checklist 14) and a melee contact has no icon at all.
        case 'statChange':
          add(PAYLOAD_BY_STAT[event.kind], [event.target]);
          break;
        case 'statCopy':
          add('attack-glyph', [event.target]);
          break;
        case 'equipmentGain':
          add('perk-icon', [event.pet]);
          break;
        case 'move':
          add('attack-glyph', [event.pet]);
          break;
        default:
          break;
      }
    }

    return order.map((payload) => ({
      type: 'projectile' as const,
      group: frame.group,
      source,
      payload,
      targets: byPayload.get(payload) ?? [],
    }));
  }

  // --------------------------------------------------------- clash window ---

  beginClash(jump = false): void {
    if (!this.capturing) {
      return;
    }
    this.frames.push({
      kind: 'clash',
      group: this.top()?.group ?? null,
      actor: null,
      jump,
      events: [],
    });
  }

  /** Two mutual hits in one window become one clash (checklist 1 and 14). */
  endClash(): void {
    if (!this.capturing) {
      return;
    }
    const frame = this.frames.pop();
    if (!frame) {
      return;
    }
    const hitPositions: number[] = [];
    frame.events.forEach((event, index) => {
      if (event.type === 'hit' && event.source?.kind === 'pet') {
        hitPositions.push(index);
      }
    });

    if (hitPositions.length === 2) {
      const first = frame.events[hitPositions[0]];
      const second = frame.events[hitPositions[1]];
      if (
        first.type === 'hit' &&
        second.type === 'hit' &&
        first.source?.kind === 'pet' &&
        second.source?.kind === 'pet' &&
        petKey(first.source.pet) === petKey(second.target) &&
        petKey(second.source.pet) === petKey(first.target)
      ) {
        const toDetail = (
          hit: typeof first,
          actor: AnimationPetRef,
        ): AnimationHitDetail => ({
          source: actor,
          target: hit.target,
          damage: hit.damage,
          blocked: hit.blocked,
        });
        const clash: PendingEvent = {
          type: 'clash',
          group: frame.group,
          jump: frame.jump,
          hits: [
            toDetail(first, first.source.pet),
            toDetail(second, second.source.pet),
          ],
        };
        const merged = frame.events.filter(
          (_, index) => index !== hitPositions[0] && index !== hitPositions[1],
        );
        merged.splice(hitPositions[0], 0, clash);
        this.flush(merged);
        return;
      }
    }

    this.flush(frame.events);
  }

  // ------------------------------------------------------------- records ----

  recordHit(options: {
    kind: AnimationHitKind;
    sourcePet?: AnimationPetLike | null;
    sourceToy?: AnimationToyLike | null;
    board?: AnimationPlayerLike | null;
    target: AnimationPetLike;
    damage: number;
  }): void {
    if (!this.capturing) {
      return;
    }
    const target = this.petRef(options.target);
    if (!target) {
      return;
    }
    const source = options.sourceToy
      ? this.toyActor(options.sourceToy, options.board)
      : this.petActor(options.sourcePet);
    this.push({
      type: 'hit',
      group: null,
      kind: options.kind,
      source,
      target,
      damage: options.damage,
      blocked: options.damage === 0,
    });
  }

  recordStatChange(options: {
    kind: AnimationStatKind;
    target?: AnimationPetLike | null;
    board?: AnimationPlayerLike | null;
    amount: number;
    total?: number | null;
    levelFrom?: number | null;
    levelTo?: number | null;
  }): void {
    if (!this.capturing || options.amount === 0) {
      return;
    }
    const target = this.petRef(options.target);
    const side = target
      ? target.side
      : this.sideOf(options.board ?? options.target?.parent);
    this.push({
      type: 'statChange',
      group: null,
      kind: options.kind,
      target,
      side,
      amount: options.amount,
      total: options.total ?? null,
      levelFrom: options.levelFrom ?? null,
      levelTo: options.levelTo ?? null,
    });
  }

  recordStatCopy(
    source: AnimationPetLike,
    target: AnimationPetLike,
    attack: number,
    health: number,
  ): void {
    if (!this.capturing) {
      return;
    }
    const sourceRef = this.petRef(source);
    const targetRef = this.petRef(target);
    if (!sourceRef || !targetRef) {
      return;
    }
    this.push({
      type: 'statCopy',
      group: null,
      source: sourceRef,
      target: targetRef,
      attack,
      health,
    });
  }

  recordFaint(pet: AnimationPetLike, killedBy?: AnimationPetLike | null): void {
    if (!this.capturing) {
      return;
    }
    const ref = this.petRef(pet);
    if (!ref) {
      return;
    }
    this.push({
      type: 'faint',
      group: null,
      pet: ref,
      killedBy: this.petRef(killedBy),
    });
  }

  beginCorpseGroup(): void {
    if (!this.capturing) {
      return;
    }
    if (this.corpseDepth === 0) {
      this.corpsePets = [];
    }
    this.corpseDepth += 1;
  }

  recordCorpse(pet: AnimationPetLike): void {
    if (!this.capturing || this.corpseDepth === 0) {
      return;
    }
    const ref = this.petRef(pet);
    if (ref && !this.corpsePets.some((known) => petKey(known) === petKey(ref))) {
      this.corpsePets.push(ref);
    }
  }

  endCorpseGroup(): void {
    if (!this.capturing || this.corpseDepth === 0) {
      return;
    }
    this.corpseDepth -= 1;
    if (this.corpseDepth > 0 || this.corpsePets.length === 0) {
      return;
    }
    this.push({
      type: 'corpseLaunchGroup',
      group: null,
      pets: this.corpsePets,
    });
    this.corpsePets = [];
  }

  recordPushForward(side: AnimationSide, moves: AnimationMove[]): void {
    if (!this.capturing || moves.length === 0) {
      return;
    }
    this.push({ type: 'pushForward', group: null, side, moves });
  }

  recordMove(options: {
    pet: AnimationPetLike;
    from: number;
    to: number;
    displaced: AnimationMove[];
  }): void {
    if (!this.capturing) {
      return;
    }
    const ref = this.petRef(options.pet);
    if (!ref || options.from === options.to) {
      return;
    }
    this.push({
      type: 'move',
      group: null,
      side: ref.side,
      pet: ref,
      from: options.from,
      to: options.to,
      displaced: options.displaced,
    });
  }

  recordSummon(
    pet: AnimationPetLike,
    index: number,
    summoner?: AnimationPetLike | null,
  ): void {
    if (!this.capturing) {
      return;
    }
    const ref = this.petRef(pet);
    if (!ref) {
      return;
    }
    this.push({
      type: 'summon',
      group: null,
      side: ref.side,
      pet: ref,
      index,
      summoner: this.petRef(summoner),
    });
  }

  recordTransform(
    from: AnimationPetLike,
    to: AnimationPetLike,
    index: number,
  ): void {
    if (!this.capturing) {
      return;
    }
    const fromRef = this.petRef(from);
    const toRef = this.petRef(to);
    if (!fromRef || !toRef) {
      return;
    }
    this.push({
      type: 'transform',
      group: null,
      side: toRef.side,
      from: fromRef,
      to: toRef,
      index,
    });
  }

  recordEquipment(
    action: 'gain' | 'break',
    pet: AnimationPetLike,
    equipment: string,
    ailment: boolean,
  ): void {
    if (!this.capturing || !equipment) {
      return;
    }
    const ref = this.petRef(pet);
    if (!ref) {
      return;
    }
    this.push(
      action === 'gain'
        ? {
            type: 'equipmentGain',
            group: null,
            pet: ref,
            equipment,
            ailment,
          }
        : {
            type: 'equipmentBreak',
            group: null,
            pet: ref,
            equipment,
            ailment,
          },
    );
  }

  recordPhase(phase: AnimationPhase, turn?: number | null): void {
    if (!this.capturing) {
      return;
    }
    this.push({ type: 'phase', group: null, phase, turn: turn ?? null });
  }

  recordOutcome(winner: AnimationSide | 'draw'): void {
    if (!this.capturing) {
      return;
    }
    this.push({ type: 'outcome', group: null, winner });
  }
}
