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
  mana?: number;
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

/** Everything `beginAbility` needs, kept so `splitAbility` can reopen it. */
interface AbilityOrigin {
  abilitySource: AnimationAbilitySource;
  trigger: string | null;
  triggers: string[];
  abilityName: string | null;
  text: string | null;
  triggeredBy: AnimationPetRef | null;
  lookupName: string | null;
}

interface Frame {
  kind: 'ability' | 'clash' | 'plain';
  group: number | null;
  actor: AnimationActor | null;
  jump: boolean;
  events: PendingEvent[];
  origin: AbilityOrigin | null;
}

/** The three per-pet numbers the recorder can reconcile against the engine. */
type TrackedStat = 'attack' | 'health' | 'mana';

const TRACKED_STATS: readonly TrackedStat[] = ['attack', 'health', 'mana'];

type StatTriple = Record<TrackedStat, number>;

const readStat = (pet: AnimationPetLike, stat: TrackedStat): number => {
  const value = stat === 'mana' ? pet.mana : pet[stat];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const zeroTriple = (): StatTriple => ({ attack: 0, health: 0, mana: 0 });

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

/** What an event has flown to it, or null when nothing is thrown for it. */
const deliveryOf = (
  event: PendingEvent,
): { payload: AnimationPayloadKind; target: AnimationPetRef | null } | null => {
  switch (event.type) {
    case 'hit':
      return { payload: 'attack-glyph', target: event.target };
    // A clash throws nothing: in a jump attack the pet is the projectile
    // (checklist 14) and a melee contact has no icon at all.
    case 'statChange':
      return { payload: PAYLOAD_BY_STAT[event.kind], target: event.target };
    case 'statCopy':
      return { payload: 'attack-glyph', target: event.target };
    case 'equipmentGain':
      return { payload: 'perk-icon', target: event.pet };
    case 'move':
      return { payload: 'attack-glyph', target: event.pet };
    default:
      return null;
  }
};

/**
 * Collects the structured animation event stream for one battle.
 *
 * Nothing here writes engine state: every method is a pure record of something
 * the engine already did, and every method is inert until `beginCapture` runs,
 * so pet construction and board setup emit nothing. The one thing it reads is
 * pet stats, in `settleStats`, to catch the writes no event described.
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
  /** Every pet the stream has seen, in first-seen order, for stat settling. */
  private tracked: AnimationPetLike[] = [];
  /** Stats as of the last settle, per tracked pet. */
  private baseline = new Map<AnimationPetLike, StatTriple>();
  /** Stat movement already explained by recorded events since that settle. */
  private accounted = new Map<AnimationPetLike, StatTriple>();

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
    this.tracked = [];
    this.baseline = new Map<AnimationPetLike, StatTriple>();
    this.accounted = new Map<AnimationPetLike, StatTriple>();
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
      if (pet) {
        this.track(pet);
      }
    }
  }

  // ------------------------------------------------------- stat settling ----

  /**
   * Starts watching a pet's stats. The first sighting is the baseline, so a pet
   * that appears mid battle never reports the stats it was created with.
   */
  private track(pet: AnimationPetLike): void {
    if (this.baseline.has(pet)) {
      return;
    }
    this.tracked.push(pet);
    this.baseline.set(pet, {
      attack: readStat(pet, 'attack'),
      health: readStat(pet, 'health'),
      mana: readStat(pet, 'mana'),
    });
    this.accounted.set(pet, zeroTriple());
  }

  /** Books a stat movement that an event already describes. */
  private account(
    pet: AnimationPetLike | null | undefined,
    stat: TrackedStat,
    amount: number,
  ): void {
    if (!pet || amount === 0) {
      return;
    }
    this.track(pet);
    const ledger = this.accounted.get(pet);
    if (ledger) {
      ledger[stat] += amount;
    }
  }

  /**
   * Emits the stat movement no event explained.
   *
   * Hundreds of abilities write `pet.health` or `pet.attack` straight rather
   * than going through the increase helpers, and the animation has to show
   * those too. Comparing the board against what the stream already said is the
   * only way to catch them without touching every catalog class.
   *
   * Only safe where the engine is between steps, i.e. at an activation or clash
   * boundary, never mid mutation.
   */
  settleStats(): void {
    if (!this.capturing) {
      return;
    }
    for (const pet of this.tracked) {
      const base = this.baseline.get(pet);
      const ledger = this.accounted.get(pet);
      if (!base || !ledger) {
        continue;
      }
      for (const stat of TRACKED_STATS) {
        const actual = readStat(pet, stat);
        const residual = actual - (base[stat] + ledger[stat]);
        base[stat] = actual;
        ledger[stat] = 0;
        if (residual === 0) {
          continue;
        }
        // A write that takes a pet to 0 health is a kill, and the faint plus
        // its damage popup already carry it. A stat pill would be wrong.
        if (stat === 'health' && actual <= 0) {
          continue;
        }
        const target = this.petRef(pet);
        if (!target) {
          continue;
        }
        this.push({
          type: 'statChange',
          group: null,
          kind: stat,
          target,
          side: target.side,
          amount: residual,
          total: null,
          levelFrom: null,
          levelTo: null,
        });
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
    this.track(pet);
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
    this.settleStats();
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
        origin: null,
      });
      return;
    }

    const level =
      options.level ??
      (actor.kind === 'pet' ? actor.pet.level : actor.toy.level) ??
      1;
    const defaultName =
      actor.kind === 'toy' ? actor.toy.name : actor.pet.name;
    const origin: AbilityOrigin = {
      abilitySource: options.abilitySource,
      trigger: options.trigger ?? null,
      triggers: options.triggers ? [...options.triggers] : [],
      abilityName: options.abilityName ?? null,
      text: null,
      triggeredBy: this.petRef(options.triggeredBy),
      lookupName: options.textName ?? defaultName ?? null,
    };
    this.frames.push(this.openAbilityFrame(actor, origin, level));
  }

  /** Opens one banner and the frame that collects everything it produces. */
  private openAbilityFrame(
    actor: AnimationActor,
    origin: AbilityOrigin,
    level: number,
  ): Frame {
    const group = this.groupSeq++;
    const text = origin.lookupName
      ? (this.resolveText?.(origin.abilitySource, origin.lookupName, level) ??
        null)
      : null;
    const frame: Frame = {
      kind: 'ability',
      group,
      actor,
      jump: false,
      events: [],
      origin,
    };
    frame.events.push({
      type: 'abilityTrigger',
      group,
      actor,
      abilitySource: origin.abilitySource,
      trigger: origin.trigger,
      triggers: [...origin.triggers],
      abilityName: origin.abilityName,
      level,
      text,
      triggeredBy: origin.triggeredBy,
    });
    return frame;
  }

  /** `beginAbility` for a toy, the shape every toy activation site needs. */
  beginToyAbility(options: {
    toy: AnimationToyLike | null | undefined;
    board?: AnimationPlayerLike | null;
    trigger: string;
    triggeredBy?: AnimationPetLike | null;
    level?: number | null;
  }): void {
    const level = options.level ?? options.toy?.level ?? 1;
    this.beginAbility({
      toy: options.toy ? { name: options.toy.name, level } : null,
      board: options.board,
      abilitySource: 'toy',
      trigger: options.trigger,
      triggers: [options.trigger],
      abilityName: options.toy?.name ?? null,
      level,
      triggeredBy: options.triggeredBy ?? null,
    });
  }

  endAbility(): void {
    if (!this.capturing) {
      return;
    }
    this.closeAbilityFrame();
  }

  /**
   * Ends the open activation and starts a fresh one for the same actor.
   *
   * A repeat of an activation, e.g. every Puma copy of a toy trigger, is its
   * own banner at its own level in the real game, not more targets on the first
   * banner's projectiles (checklist 11).
   */
  splitAbility(options: { level?: number | null } = {}): void {
    if (!this.capturing) {
      return;
    }
    const frame = this.top();
    if (!frame || frame.kind !== 'ability' || !frame.actor || !frame.origin) {
      return;
    }
    const origin = frame.origin;
    const previousLevel =
      frame.events[0]?.type === 'abilityTrigger' ? frame.events[0].level : 1;
    const level = options.level ?? previousLevel;
    const actor: AnimationActor =
      frame.actor.kind === 'toy'
        ? { kind: 'toy', toy: { ...frame.actor.toy, level } }
        : frame.actor;
    this.closeAbilityFrame();
    this.frames.push(this.openAbilityFrame(actor, origin, level));
  }

  /** Settles, pops and flushes the open frame, projectiles staged in place. */
  private closeAbilityFrame(): void {
    this.settleStats();
    const frame = this.frames.pop();
    if (!frame) {
      return;
    }
    if (frame.kind !== 'ability' || !frame.actor) {
      this.flush(frame.events);
      return;
    }
    this.flush(this.stageProjectiles(frame));
  }

  /**
   * Inserts each projectile immediately before what it delivers.
   *
   * Every effect stage keeps the order the engine produced it in, because the
   * real game plays them in that order: the reposition rock lands before the
   * move, and the attack glyph lands one beat before the heart (checklist 9 and
   * 15). Consecutive deliveries of the same payload are one projectile with N
   * targets, which is the area effect of checklist 6.
   */
  private stageProjectiles(frame: Frame): PendingEvent[] {
    const source = frame.actor;
    if (!source) {
      return frame.events;
    }
    const staged: PendingEvent[] = [];
    let run: { payload: AnimationPayloadKind; targets: AnimationPetRef[] } | null =
      null;

    for (const event of frame.events) {
      // A nested activation carries its own banner and its own projectiles.
      if (event.group !== frame.group) {
        run = null;
        staged.push(event);
        continue;
      }
      const delivery = deliveryOf(event);
      if (!delivery) {
        staged.push(event);
        continue;
      }
      if (!run || run.payload !== delivery.payload) {
        run = { payload: delivery.payload, targets: [] };
        staged.push({
          type: 'projectile',
          group: frame.group,
          source,
          payload: delivery.payload,
          // Held by reference: a later target of the same run joins this list.
          targets: run.targets,
        });
      }
      const target = delivery.target;
      if (
        target &&
        !run.targets.some((known) => petKey(known) === petKey(target))
      ) {
        run.targets.push(target);
      }
      staged.push(event);
    }

    return staged;
  }

  // --------------------------------------------------------- clash window ---

  beginClash(jump = false): void {
    if (!this.capturing) {
      return;
    }
    this.settleStats();
    this.frames.push({
      kind: 'clash',
      group: this.top()?.group ?? null,
      actor: null,
      jump,
      events: [],
      origin: null,
    });
  }

  /**
   * Two mutual contacts in one window become one clash (checklist 1 and 14).
   *
   * The pair is searched for rather than assumed to be the whole window,
   * because a perk can land its own damage inside the window: a Chili snipe or
   * a Crisp burn does not stop the two front pets from trading in one frame.
   */
  endClash(): void {
    if (!this.capturing) {
      return;
    }
    this.settleStats();
    const frame = this.frames.pop();
    if (!frame) {
      return;
    }
    const isContact = (event: PendingEvent): boolean =>
      event.type === 'hit' &&
      event.source?.kind === 'pet' &&
      (event.kind === 'melee' || event.kind === 'jump');
    const contacts: number[] = [];
    frame.events.forEach((event, index) => {
      if (isContact(event)) {
        contacts.push(index);
      }
    });

    for (let a = 0; a < contacts.length; a++) {
      for (let b = a + 1; b < contacts.length; b++) {
        const first = frame.events[contacts[a]];
        const second = frame.events[contacts[b]];
        if (
          first.type !== 'hit' ||
          second.type !== 'hit' ||
          first.source?.kind !== 'pet' ||
          second.source?.kind !== 'pet' ||
          petKey(first.source.pet) !== petKey(second.target) ||
          petKey(second.source.pet) !== petKey(first.target)
        ) {
          continue;
        }
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
          (_, index) => index !== contacts[a] && index !== contacts[b],
        );
        merged.splice(contacts[a], 0, clash);
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
    this.account(options.target, 'health', -options.damage);
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
    /** Stats the level-up carried, when the burst drew them, see `increaseExp`. */
    levelAttack?: number;
    levelHealth?: number;
    /** Books the change against the pet without drawing it, see `increaseExp`. */
    silent?: boolean;
  }): void {
    if (!this.capturing || options.amount === 0) {
      return;
    }
    if (options.kind === 'attack' || options.kind === 'health') {
      this.account(options.target, options.kind, options.amount);
    } else if (options.kind === 'mana') {
      this.account(options.target, 'mana', options.amount);
    }
    if (options.silent) {
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
      // Only carried when there is something to carry, so the field appears on
      // the one event class that owns it rather than on every stat change.
      ...(options.levelAttack ? { levelAttack: options.levelAttack } : {}),
      ...(options.levelHealth ? { levelHealth: options.levelHealth } : {}),
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
    // A copy is absolute, so it replaces the baseline rather than adding to it.
    const base = this.baseline.get(target);
    const ledger = this.accounted.get(target);
    if (base && ledger) {
      base.attack = attack;
      base.health = health;
      ledger.attack = 0;
      ledger.health = 0;
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
    this.settleStats();
    this.push({ type: 'phase', group: null, phase, turn: turn ?? null });
  }

  recordOutcome(winner: AnimationSide | 'draw'): void {
    if (!this.capturing) {
      return;
    }
    this.push({ type: 'outcome', group: null, winner });
  }
}
