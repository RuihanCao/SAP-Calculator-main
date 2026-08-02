import {
  AnimationAbilityTriggerEvent,
  AnimationClashEvent,
  AnimationEvent,
  AnimationHitEvent,
  AnimationPayloadKind,
  AnimationProjectileEvent,
  AnimationSide,
  AnimationStatChangeEvent,
} from 'app/domain/interfaces/animation-event.interface';
import {
  AnimationBoardState,
  applyEventToBoard,
  cloneBoard,
  findPet,
} from './board-state';
import {
  AnimationCue,
  AnimationStep,
  AnimationStepKind,
  AnimationTimeline,
  BannerCue,
  CorpseCue,
  DamagePopupCue,
  OutlineCue,
  ProjectileCue,
} from './cues';
import { AnimationMode, OUTRO_BEATS, getBeats } from './timing';

/** One cue without its id, distributed over the union so a literal type checks. */
type CueDraft<T> = T extends AnimationCue ? Omit<T, 'id'> : never;

export interface DirectorOptions {
  mode?: AnimationMode;
  /** The board the stream starts from; the stream itself never states it. */
  initialBoard: AnimationBoardState;
  includeOutro?: boolean;
}

const STEP_KIND: Record<AnimationEvent['type'], AnimationStepKind> = {
  phase: 'phase',
  abilityTrigger: 'banner',
  projectile: 'projectile',
  clash: 'clash',
  hit: 'hit',
  statChange: 'statChange',
  statCopy: 'statCopy',
  faint: 'faint',
  corpseLaunchGroup: 'corpseLaunch',
  pushForward: 'pushForward',
  move: 'move',
  summon: 'summon',
  transform: 'transform',
  equipmentGain: 'equipment',
  equipmentBreak: 'equipment',
  outcome: 'outcome',
};

const actorPetId = (event: AnimationAbilityTriggerEvent): number | null =>
  event.actor.kind === 'pet' ? event.actor.pet.id : null;

const actorSide = (event: AnimationAbilityTriggerEvent): AnimationSide =>
  event.actor.kind === 'pet' ? event.actor.pet.side : event.actor.toy.side;

/**
 * Turns an event stream into a timeline of cues.
 *
 * The walk keeps one cursor. Beats that the real game overlaps are written as
 * overlaps here rather than as sequential waits: the push forward starts inside
 * the corpse flight and the next banner comes up over the fading popups.
 *
 * The clash cadence is outcome driven (checklist 12 and 19). Two trades with
 * nothing dying between them are one short beat apart, about 0.62 s, which is
 * inside the 0.7 s popup lifetime and is what makes the merge rule visible. A
 * faint stretches the beat to about 1.3 s, and it does so by what the death
 * costs, the corpse holding in place, launching, and the survivors sliding,
 * rather than by a longer floor.
 */
export const buildBattleTimeline = (
  events: ReadonlyArray<AnimationEvent>,
  options: DirectorOptions,
): AnimationTimeline => {
  const mode = options.mode ?? 'normal';
  const beats = getBeats(mode);
  const includeOutro = options.includeOutro !== false;

  const cues: AnimationCue[] = [];
  const steps: AnimationStep[] = [];
  const board = cloneBoard(options.initialBoard);

  // The timeline opens on the battle itself. There is no entrance segment in
  // front of it, so the first frame is already the board with the control bar
  // up, which is where the animation starts and where REWIND comes back to.
  let cursor = 0;
  /** Contact frame of the last clash, which the next one keeps its distance from. */
  let lastClashContactMs: number | null = null;
  let winner: AnimationTimeline['winner'] = null;

  const livePopups = new Map<number, DamagePopupCue>();
  const liveHurtOutlines = new Map<number, OutlineCue>();
  const openCorpses = new Map<number, CorpseCue>();
  let liveBanner: BannerCue | null = null;
  let liveSourceOutline: OutlineCue | null = null;
  let liveGroup: number | null = null;
  /** Arrival of the projectile whose deliveries are still being read. */
  let pendingDeliveryMs: number | null = null;
  let groupProjectileStartMs: number | null = null;
  /**
   * The throw the current group has already put in the air, so a reward that is
   * attack *and* health goes out as one object rather than two.
   */
  let groupProjectileCue: ProjectileCue | null = null;
  /** Nothing in the current group may start before this (a spend's own gap). */
  let groupBeatFloorMs = 0;
  /** When the damage step that is killing pets landed, so a corpse holds. */
  let lastDamageMs: number | null = null;
  /**
   * Whether that damage was a clash contact.
   *
   * A clash throws its loser away on the blow; anything else leaves the body
   * standing in its slot under the bandage first (checklist 3).
   */
  let lastDamageWasClash = false;
  let groupSummonStartMs: number | null = null;
  let groupSummonCount = 0;
  /**
   * FAST collapses repeated reactions into one frame (checklist 16).
   *
   * The same pet answering the same trigger twice in a row is one wave, so the
   * second activation is rewound onto the first one's cursor and both land in
   * the same frame. Anything that is not itself a reaction ends the wave.
   */
  let fastWave: { key: string; startMs: number } | null = null;

  let cueSerial = 0;
  const push = <T extends AnimationCue = AnimationCue>(cue: CueDraft<T>): T => {
    const built = {
      ...(cue as object),
      id: `c${cueSerial++}-${(cue as { kind: string }).kind}`,
    } as T;
    cues.push(built);
    return built;
  };

  const closeBanner = (atMs: number): void => {
    if (liveBanner) {
      liveBanner.endMs = Math.max(liveBanner.endMs, atMs + beats.bannerHoldMs);
      liveBanner = null;
    }
    if (liveSourceOutline) {
      liveSourceOutline.endMs = Math.max(
        liveSourceOutline.endMs,
        atMs + beats.bannerHoldMs,
      );
      liveSourceOutline = null;
    }
    liveGroup = null;
    groupProjectileStartMs = null;
    groupProjectileCue = null;
    groupBeatFloorMs = 0;
    groupSummonStartMs = null;
    groupSummonCount = 0;
  };

  const enterGroup = (group: number | null, atMs: number): void => {
    if (group === liveGroup) {
      return;
    }
    closeBanner(atMs);
    pendingDeliveryMs = null;
    liveGroup = group;
  };

  /**
   * Where a delivery lands: on its projectile's arrival, so an area effect puts
   * every popup in one frame (checklist 6). The window stays open across the
   * whole run of deliveries and is closed by anything that is not one. The
   * group's own floor holds it back when the group owes a gap first, which is
   * the beat a move's buff waits out and the beat a trumpet spend pays for.
   */
  const deliveryAt = (): number =>
    Math.max(pendingDeliveryMs ?? cursor, groupBeatFloorMs);

  /** Per hit, merged in place while the popup is still alive (checklist 19). */
  const damagePopup = (
    petId: number,
    side: AnimationSide,
    value: number,
    atMs: number,
    seq: number,
    group: number | null,
  ): DamagePopupCue => {
    const live = livePopups.get(petId);
    if (live && live.endMs > atMs) {
      live.value += value;
      live.merges += 1;
      live.steps.push({ atMs, value: live.value });
      live.endMs = atMs + beats.damagePopupMs;
      return live;
    }
    const cue = push<DamagePopupCue>({
      kind: 'damagePopup',
      startMs: atMs,
      endMs: atMs + beats.damagePopupMs,
      seq,
      group,
      petId,
      side,
      value,
      merges: 0,
      steps: [{ atMs, value }],
      lifeMs: beats.damagePopupMs,
    });
    livePopups.set(petId, cue);
    return cue;
  };

  const hurtOutline = (
    petId: number,
    atMs: number,
    seq: number,
    group: number | null,
  ): void => {
    const live = liveHurtOutlines.get(petId);
    if (live && live.endMs > atMs) {
      live.endMs = atMs + beats.hurtOutlineMs;
      return;
    }
    const cue = push<OutlineCue>({
      kind: 'hurtOutline',
      startMs: atMs,
      endMs: atMs + beats.hurtOutlineMs,
      seq,
      group,
      petId,
    });
    liveHurtOutlines.set(petId, cue);
  };

  /** Both front pets take the red outline before contact, checklist 1. */
  const windupOutline = (
    petId: number,
    startMs: number,
    endMs: number,
    seq: number,
    group: number | null,
  ): void => {
    push<OutlineCue>({
      kind: 'windupOutline',
      startMs,
      endMs,
      seq,
      group,
      petId,
    });
  };

  const addPayloadToBanner = (payload: AnimationPayloadKind): void => {
    if (liveBanner && !liveBanner.payloads.includes(payload)) {
      liveBanner.payloads.push(payload);
    }
  };

  const commitStep = (
    event: AnimationEvent,
    startMs: number,
    endMs: number,
    commitMs: number,
    stepCues: AnimationCue[],
  ): void => {
    applyEventToBoard(board, event);
    steps.push({
      index: steps.length,
      seq: event.seq,
      kind: STEP_KIND[event.type],
      startMs,
      endMs,
      commitMs,
      cueIds: stepCues.map((cue) => cue.id),
      board: cloneBoard(board),
    });
  };

  /** What an ability activation is allowed to be made of, for the FAST wave. */
  const REACTION_TYPES: ReadonlySet<AnimationEvent['type']> = new Set([
    'abilityTrigger',
    'projectile',
    'statChange',
    'statCopy',
    'equipmentGain',
  ] as Array<AnimationEvent['type']>);

  /**
   * What the throw currently being read is going to do when it lands.
   *
   * The projectile event itself does not say, so the first delivery after it is
   * read ahead: a `hit` makes it a damage throw and anything else a buff.
   */
  const deliversDamage = (fromIndex: number): boolean => {
    for (let i = fromIndex + 1; i < events.length; i += 1) {
      const next = events[i];
      if (next.type === 'hit') {
        return true;
      }
      if (
        next.type === 'statChange' ||
        next.type === 'statCopy' ||
        next.type === 'equipmentGain' ||
        next.type === 'projectile' ||
        next.type === 'clash'
      ) {
        return false;
      }
    }
    return false;
  };

  for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
    const event = events[eventIndex];
    const before = cues.length;
    const stepCuesFrom = (): AnimationCue[] => cues.slice(before);
    if (!REACTION_TYPES.has(event.type)) {
      fastWave = null;
    }

    switch (event.type) {
      case 'phase': {
        commitStep(event, cursor, cursor, cursor, []);
        break;
      }

      case 'abilityTrigger': {
        closeBanner(cursor);
        liveGroup = event.group;
        pendingDeliveryMs = null;
        const petId = actorPetId(event);
        const side = actorSide(event);
        if (mode === 'fast') {
          // Checklist 16: repeated reactions resolve together, so the same pet
          // answering the same trigger again reuses the wave's own cursor
          // instead of queueing behind the previous activation.
          const waveKey = `${petId ?? `toy:${side}`}|${event.trigger ?? event.abilityName ?? ''}`;
          if (fastWave && fastWave.key === waveKey) {
            cursor = fastWave.startMs;
          } else {
            fastWave = { key: waveKey, startMs: cursor };
          }
          // No banner at all in FAST; an icon over the acting pet stands in.
          if (petId != null) {
            push({
              kind: 'fastIcon',
              startMs: cursor,
              endMs: cursor + beats.fastIconMs,
              seq: event.seq,
              group: event.group,
              petId,
              side,
              payload: null,
            });
          }
          if (petId != null) {
            liveSourceOutline = push<OutlineCue>({
              kind: 'sourceOutline',
              startMs: cursor,
              endMs: cursor + beats.fastIconMs,
              seq: event.seq,
              group: event.group,
              petId,
            });
          }
          const start = cursor;
          cursor += beats.fastIconLeadMs;
          commitStep(event, start, cursor, start, stepCuesFrom());
          break;
        }
        liveBanner = push<BannerCue>({
          kind: 'banner',
          startMs: cursor,
          endMs: cursor + beats.bannerLeadMs + beats.bannerHoldMs,
          seq: event.seq,
          group: event.group,
          actorKind: event.actor.kind,
          petId,
          name:
            event.actor.kind === 'pet'
              ? event.actor.pet.name
              : event.actor.toy.name,
          level: event.level,
          side,
          text: event.text,
          trigger: event.trigger,
          abilitySource: event.abilitySource,
          payloads: [],
        });
        if (petId != null) {
          liveSourceOutline = push<OutlineCue>({
            kind: 'sourceOutline',
            startMs: cursor,
            endMs: cursor + beats.bannerLeadMs,
            seq: event.seq,
            group: event.group,
            petId,
          });
        }
        const start = cursor;
        cursor += beats.bannerLeadMs;
        commitStep(event, start, cursor, start, stepCuesFrom());
        break;
      }

      case 'projectile': {
        enterGroup(event.group, cursor);
        const projectile = event as AnimationProjectileEvent;
        // A multi part effect throws one object per part, staggered, and the
        // parts land side by side rather than one after the other.
        const startMs = Math.max(
          groupProjectileStartMs != null
            ? groupProjectileStartMs + beats.projectileStaggerMs
            : cursor,
          groupBeatFloorMs,
        );
        groupProjectileStartMs = startMs;
        // A trumpet's motion belongs to the counter widget, not to the board:
        // a gain flies banner to counter and a spend flies counter to pet, both
        // drawn by the stat change's own token (checklist 14 and 19). The
        // projectile step is therefore a marker with no flight and no icon,
        // which is what keeps a spend to exactly one token.
        const trumpetPayload = projectile.payload === 'trumpet';
        // A reward of attack and health together is one `HeartFist` in the
        // client, thrown once (f10 t=34.19 to 34.53, where the Hippo's knock
        // out reward falls as a single object with the heart behind the fist).
        // Two icons one after the other was ours, and the buff close-up is
        // what caught it.
        const pairable =
          groupProjectileCue &&
          groupProjectileCue.pairedPayload == null &&
          !groupProjectileCue.damage &&
          projectile.payload !== groupProjectileCue.payload &&
          (projectile.payload === 'heart' ||
            projectile.payload === 'attack-glyph') &&
          (groupProjectileCue.payload === 'heart' ||
            groupProjectileCue.payload === 'attack-glyph') &&
          groupProjectileCue.targets.length === projectile.targets.length &&
          groupProjectileCue.targets.every(
            (target, index) => target.petId === projectile.targets[index].id,
          );
        if (pairable && groupProjectileCue) {
          groupProjectileCue.pairedPayload = projectile.payload;
          addPayloadToBanner(projectile.payload);
          pendingDeliveryMs = groupProjectileCue.endMs;
          commitStep(
            event,
            groupProjectileCue.startMs,
            groupProjectileCue.endMs,
            groupProjectileCue.endMs,
            stepCuesFrom(),
          );
          break;
        }
        const arrivalMs = trumpetPayload
          ? startMs
          : startMs + beats.projectileFlightMs;
        addPayloadToBanner(projectile.payload);
        if (trumpetPayload) {
          // nothing is drawn here.
        } else if (mode === 'normal' && projectile.targets.length > 0) {
          push({
            kind: 'projectile',
            startMs,
            endMs: arrivalMs,
            seq: event.seq,
            group: event.group,
            payload: projectile.payload,
            fromPetId:
              projectile.source.kind === 'pet' ? projectile.source.pet.id : null,
            fromSide:
              projectile.source.kind === 'pet'
                ? projectile.source.pet.side
                : projectile.source.toy.side,
            targets: projectile.targets.map((target) => ({
              petId: target.id,
              side: target.side,
            })),
            damage: deliversDamage(eventIndex),
            pairedPayload: null,
          });
          groupProjectileCue = cues[cues.length - 1] as ProjectileCue;
        } else if (mode === 'fast' && projectile.source.kind === 'pet') {
          // FAST has no travel: the icon appears at the source instead.
          push({
            kind: 'fastIcon',
            startMs,
            endMs: startMs + beats.fastIconMs,
            seq: event.seq,
            group: event.group,
            petId: projectile.source.pet.id,
            side: projectile.source.pet.side,
            payload: projectile.payload,
          });
        }
        pendingDeliveryMs = arrivalMs;
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, arrivalMs);
        }
        if (liveSourceOutline) {
          liveSourceOutline.endMs = Math.max(liveSourceOutline.endMs, arrivalMs);
        }
        cursor = Math.max(cursor, arrivalMs);
        commitStep(event, startMs, arrivalMs, arrivalMs, stepCuesFrom());
        break;
      }

      case 'clash': {
        closeBanner(cursor);
        pendingDeliveryMs = null;
        const clash = event as AnimationClashEvent;
        // The recorder opens a clash window on the pet that strikes, so the
        // first hit is the jumper's and the second is the counter attack.
        const jumperId = clash.jump ? clash.hits[0].source.id : null;
        const jumpTargetId = clash.jump ? clash.hits[0].target.id : null;
        const cadenceFloorMs =
          lastClashContactMs != null
            ? lastClashContactMs + beats.clashCadenceMs
            : 0;
        const contactMs = clash.jump
          ? Math.max(cursor + beats.jumpOutMs, cadenceFloorMs)
          : Math.max(cursor + beats.clashLeadMs, cadenceFloorMs);
        const startMs = clash.jump
          ? contactMs - beats.jumpOutMs
          : Math.max(0, contactMs - beats.clashWindupMs);
        const returnStartMs = clash.jump
          ? contactMs + beats.jumpHoldMs
          : contactMs;
        const endMs = clash.jump
          ? returnStartMs + beats.jumpReturnMs
          : contactMs + beats.clashRecoilMs;
        push({
          kind: 'clash',
          startMs,
          endMs,
          seq: event.seq,
          group: event.group,
          jump: clash.jump,
          contactMs,
          returnStartMs,
          jumperId,
          jumpTargetId,
          hits: clash.hits.map((hit) => ({
            sourceId: hit.source.id,
            targetId: hit.target.id,
            damage: hit.damage,
            blocked: hit.blocked,
          })),
          attackerIds: clash.hits.map((hit) => hit.source.id),
        });
        if (clash.jump) {
          // A jump attack is an ability, and the pet performing one wears the
          // green source outline for the whole of it: on the reference contact
          // frame the African Wild Dog is outlined green over the Otter, not
          // red like an ordinary clashing front pet
          // (f11 t=30.45, clips/f11-jump-african-wild-dog/f_00862_0030453.jpg).
          push<OutlineCue>({
            kind: 'sourceOutline',
            startMs,
            endMs,
            seq: event.seq,
            group: event.group,
            petId: clash.hits[0].source.id,
          });
          // The attacker lands back in its own slot in a white puff.
          push({
            kind: 'impactPuff',
            startMs: endMs,
            endMs: endMs + beats.landingPuffMs,
            seq: event.seq,
            group: event.group,
            petId: clash.hits[0].source.id,
            variant: 'landing',
          });
        } else {
          for (const hit of clash.hits) {
            windupOutline(hit.source.id, startMs, contactMs, event.seq, event.group);
          }
        }
        // Both damage numbers are in the contact frame, checklist 1.
        for (const hit of clash.hits) {
          damagePopup(
            hit.target.id,
            hit.target.side,
            hit.blocked ? 0 : hit.damage,
            contactMs,
            event.seq,
            event.group,
          );
          hurtOutline(hit.target.id, contactMs, event.seq, event.group);
        }
        lastDamageMs = contactMs;
        lastDamageWasClash = true;
        lastClashContactMs = contactMs;
        cursor = clash.jump ? endMs : contactMs + beats.clashRecoilMs;
        commitStep(event, startMs, endMs, contactMs, stepCuesFrom());
        break;
      }

      case 'hit': {
        enterGroup(event.group, cursor);
        const hit = event as AnimationHitEvent;
        const atMs = deliveryAt();
        push({
          kind: 'impactPuff',
          startMs: atMs,
          endMs: atMs + beats.impactPuffMs,
          seq: event.seq,
          group: event.group,
          petId: hit.target.id,
          variant: 'impact',
        });
        damagePopup(
          hit.target.id,
          hit.target.side,
          hit.blocked ? 0 : hit.damage,
          atMs,
          event.seq,
          event.group,
        );
        hurtOutline(hit.target.id, atMs, event.seq, event.group);
        lastDamageMs = atMs;
        lastDamageWasClash = false;
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, atMs);
        }
        cursor = Math.max(cursor, atMs + beats.hitSettleMs);
        commitStep(event, atMs, atMs + beats.impactPuffMs, atMs, stepCuesFrom());
        break;
      }

      case 'statChange': {
        enterGroup(event.group, cursor);
        const statChange = event as AnimationStatChangeEvent;
        const atMs = deliveryAt();
        if (
          statChange.kind === 'trumpet-gain' ||
          statChange.kind === 'trumpet-spend'
        ) {
          const spend = statChange.kind === 'trumpet-spend';
          const tokenMs = spend ? beats.trumpetSpendTokenMs : beats.trumpetTokenMs;
          push({
            kind: 'trumpetToken',
            startMs: atMs,
            endMs: atMs + tokenMs,
            seq: event.seq,
            group: event.group,
            side: statChange.side,
            direction: spend ? 'to-pet' : 'to-counter',
            petId: spend ? (statChange.target?.id ?? null) : null,
          });
          const flashAt = spend ? atMs : atMs + tokenMs;
          push({
            kind: 'trumpetCounterFlash',
            startMs: flashAt,
            endMs: flashAt + beats.trumpetFlashMs,
            seq: event.seq,
            group: event.group,
            side: statChange.side,
            tone: spend ? 'spend' : 'gain',
            total:
              statChange.total ??
              Math.max(0, board.trumpets[statChange.side] + statChange.amount),
          });
          if (liveBanner) {
            liveBanner.endMs = Math.max(liveBanner.endMs, flashAt);
          }
          const settle = spend ? beats.trumpetSpendGapMs : tokenMs + beats.trumpetFlashMs;
          if (spend) {
            groupBeatFloorMs = Math.max(groupBeatFloorMs, atMs + settle);
          }
          cursor = Math.max(cursor, atMs + settle);
          commitStep(event, atMs, flashAt + beats.trumpetFlashMs, flashAt, stepCuesFrom());
          break;
        }

        const targetId = statChange.target?.id ?? null;
        if (statChange.kind === 'exp' && targetId != null) {
          push({
            kind: 'xpBurst',
            startMs: atMs,
            endMs: atMs + beats.xpBurstMs,
            seq: event.seq,
            group: event.group,
            petId: targetId,
            levelFrom: statChange.levelFrom,
            levelTo: statChange.levelTo,
          });
        } else {
          const buffLands =
            (statChange.kind === 'attack' || statChange.kind === 'health') &&
            statChange.amount > 0;
          if ((statChange.kind === 'mana' || buffLands) && targetId != null) {
            // Mana lands in a white flash, checklist 14, and the buff
            // close-up shows a stat gain doing exactly the same thing: at f10
            // t=34.53 the Hippo is painted out white as its reward arrives and
            // white sparks lift off it for the next quarter second.
            push({
              kind: 'impactPuff',
              startMs: atMs,
              endMs: atMs + beats.impactPuffMs,
              seq: event.seq,
              group: event.group,
              petId: targetId,
              variant: statChange.kind === 'mana' ? 'mana' : 'buff',
            });
          }
          push({
            kind: 'statPill',
            startMs: atMs,
            endMs: atMs + beats.statPillMs,
            seq: event.seq,
            group: event.group,
            petId: targetId,
            side: statChange.side,
            statKind: statChange.kind,
            amount: statChange.amount,
          });
        }
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, atMs);
        }
        cursor = Math.max(cursor, atMs + beats.statSettleMs);
        commitStep(event, atMs, atMs + beats.statPillMs, atMs, stepCuesFrom());
        break;
      }

      case 'statCopy': {
        enterGroup(event.group, cursor);
        const atMs = deliveryAt();
        push({
          kind: 'statCopyLabel',
          startMs: atMs,
          endMs: atMs + beats.statPillMs,
          seq: event.seq,
          group: event.group,
          petId: event.target.id,
          attack: event.attack,
          health: event.health,
        });
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, atMs);
        }
        cursor = Math.max(cursor, atMs + beats.statSettleMs);
        commitStep(event, atMs, atMs + beats.statPillMs, atMs, stepCuesFrom());
        break;
      }

      case 'faint': {
        pendingDeliveryMs = null;
        // Dead in place from the moment the damage landed, and held there until
        // the whole damage step has resolved (checklist 3).
        const pet = findPet(board, event.pet.id);
        const startMs = Math.min(cursor, lastDamageMs ?? cursor);
        const cue = push<CorpseCue>({
          kind: 'corpse',
          startMs,
          endMs: Number.MAX_SAFE_INTEGER,
          seq: event.seq,
          group: event.group,
          petId: event.pet.id,
          side: event.pet.side,
          index: pet?.index ?? event.pet.index,
          name: event.pet.name,
          level: event.pet.level,
          attack: pet?.attack ?? event.pet.attack,
          health: pet?.health ?? event.pet.health,
          viaClash: lastDamageWasClash,
        });
        openCorpses.set(event.pet.id, cue);
        commitStep(event, startMs, startMs, startMs, stepCuesFrom());
        break;
      }

      case 'corpseLaunchGroup': {
        pendingDeliveryMs = null;
        const groupId = `launch-${event.seq}`;
        // Dead in place first, wearing the bandage, and only then away
        // (checklist 3). How long that is depends on what killed it: a clash
        // throws its loser on the blow, a snipe or an ability leaves the body
        // standing in its slot for the best part of a second (measured on
        // f02/f06 against f01/f02/f03).
        const holdUntilMs = event.pets.reduce((latest, ref) => {
          const corpse = openCorpses.get(ref.id);
          if (!corpse) {
            return latest;
          }
          const hold = corpse.viaClash
            ? beats.corpseHoldMs
            : beats.corpseBandageHoldMs;
          return Math.max(latest, corpse.startMs + hold);
        }, 0);
        // A clash death leaves on the blow, so it does not wait out the recoil
        // the cursor is sitting on: on f02 the cow is hit at t=31.75 and is
        // airborne at 31.78, and on f03 the cow is hit at 33.571 and airborne
        // at 33.595. Anything else waits for the cursor as well as the hold.
        const allViaClash =
          event.pets.length > 0 &&
          event.pets.every((ref) => openCorpses.get(ref.id)?.viaClash === true);
        // The body leaving early does not make the rest of the beat early: the
        // board still takes its own time to re-form, so the stream advances off
        // where the launch *would* have been (f02: the cow is hit at t=31.75
        // and airborne at 31.78, and the next contact is still 1.37 s later).
        const streamLaunchAt = Math.max(cursor, holdUntilMs);
        // `holdUntilMs` is already at or after the corpse cue's own start, so
        // it needs no further floor, and not reaching for the entrance's end
        // here is what lets the same director run on the preview build, which
        // has no entrance.
        const launchAt = allViaClash ? holdUntilMs : streamLaunchAt;
        const endMs = launchAt + beats.corpseLaunchMs;
        for (const ref of event.pets) {
          const corpse = openCorpses.get(ref.id);
          if (corpse) {
            corpse.endMs = Math.max(corpse.startMs, launchAt);
            openCorpses.delete(ref.id);
          }
          const pet = findPet(board, ref.id);
          push({
            kind: 'corpseLaunch',
            startMs: launchAt,
            endMs,
            seq: event.seq,
            group: event.group,
            petId: ref.id,
            side: ref.side,
            index: pet?.index ?? ref.index,
            name: ref.name,
            level: ref.level,
            attack: pet?.attack ?? ref.attack,
            health: pet?.health ?? ref.health,
            groupId,
            viaClash: corpse?.viaClash ?? false,
          });
        }
        // The star spray marks where a *thrown* body left the field. Nothing is
        // thrown when the kill was not a clash, and the reference has no spray
        // there either (f02 t=30.88 to 31.5 is one cloud in a slot and nothing
        // else).
        if (allViaClash && event.pets.length > 0) {
          push({
            kind: 'starburst',
            startMs: endMs - beats.corpseBurstMs,
            endMs,
            seq: event.seq,
            group: event.group,
            side: event.pets[0].side,
            index: findPet(board, event.pets[0].id)?.index ?? event.pets[0].index,
            groupId,
          });
        }
        cursor = streamLaunchAt + beats.corpseAdvanceMs;
        commitStep(event, launchAt, endMs, launchAt, stepCuesFrom());
        break;
      }

      case 'pushForward': {
        pendingDeliveryMs = null;
        // Starts inside the corpse flight, and N deaths make one slide.
        const startMs = cursor;
        const endMs = startMs + beats.pushForwardMs;
        for (const move of event.moves) {
          push({
            kind: 'slide',
            startMs,
            endMs,
            seq: event.seq,
            group: event.group,
            petId: move.pet.id,
            side: event.side,
            fromIndex: move.from,
            toIndex: move.to,
          });
        }
        cursor = endMs;
        commitStep(event, startMs, endMs, startMs, stepCuesFrom());
        break;
      }

      case 'move': {
        enterGroup(event.group, cursor);
        const startMs = deliveryAt();
        const endMs = startMs + beats.moveArcMs;
        push({
          kind: 'moveArc',
          startMs,
          endMs,
          seq: event.seq,
          group: event.group,
          petId: event.pet.id,
          side: event.side,
          fromIndex: event.from,
          toIndex: event.to,
        });
        for (const displaced of event.displaced) {
          push({
            kind: 'slide',
            startMs,
            endMs,
            seq: event.seq,
            group: event.group,
            petId: displaced.pet.id,
            side: event.side,
            fromIndex: displaced.from,
            toIndex: displaced.to,
          });
        }
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, endMs);
        }
        // The buff that came with the move is its own cue, a beat after the
        // moved pet has landed, never during the flight (checklist 9).
        pendingDeliveryMs = null;
        groupBeatFloorMs = Math.max(groupBeatFloorMs, endMs + beats.moveBuffGapMs);
        cursor = Math.max(cursor, endMs);
        commitStep(event, startMs, endMs, startMs, stepCuesFrom());
        break;
      }

      case 'summon': {
        enterGroup(event.group, cursor);
        pendingDeliveryMs = null;
        if (groupSummonStartMs == null) {
          groupSummonStartMs = cursor;
          groupSummonCount = 0;
        }
        const startMs = groupSummonStartMs + groupSummonCount * beats.summonStaggerMs;
        groupSummonCount += 1;
        const endMs = startMs + beats.summonPuffMs;
        push({
          kind: 'summonPuff',
          startMs,
          endMs,
          seq: event.seq,
          group: event.group,
          petId: event.pet.id,
          side: event.side,
          index: event.index,
          revealMs: startMs + beats.summonRevealMs,
        });
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, endMs);
        }
        cursor = Math.max(cursor, endMs);
        commitStep(
          event,
          startMs,
          endMs,
          startMs + beats.summonRevealMs,
          stepCuesFrom(),
        );
        break;
      }

      case 'transform': {
        enterGroup(event.group, cursor);
        pendingDeliveryMs = null;
        const startMs = cursor;
        // The same cloud the summon uses, in place, with the swap hidden
        // inside it rather than crossfaded (checklist 8).
        const endMs = startMs + beats.transformPuffMs;
        push({
          kind: 'transformPuff',
          startMs,
          endMs,
          seq: event.seq,
          group: event.group,
          fromPetId: event.from.id,
          toPetId: event.to.id,
          side: event.side,
          index: event.index,
          revealMs: startMs + beats.transformRevealMs,
        });
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, endMs);
        }
        cursor = Math.max(cursor, endMs);
        commitStep(
          event,
          startMs,
          endMs,
          startMs + beats.transformRevealMs,
          stepCuesFrom(),
        );
        break;
      }

      case 'equipmentGain': {
        enterGroup(event.group, cursor);
        const atMs = deliveryAt();
        push({
          kind: 'equipmentGain',
          startMs: atMs,
          endMs: atMs + beats.equipmentGainMs,
          seq: event.seq,
          group: event.group,
          petId: event.pet.id,
          equipment: event.equipment,
          ailment: event.ailment,
        });
        if (liveBanner) {
          liveBanner.endMs = Math.max(liveBanner.endMs, atMs);
        }
        cursor = Math.max(cursor, atMs + beats.equipmentGainMs);
        commitStep(event, atMs, atMs + beats.equipmentGainMs, atMs, stepCuesFrom());
        break;
      }

      case 'equipmentBreak': {
        enterGroup(event.group, cursor);
        pendingDeliveryMs = null;
        const atMs = cursor;
        push({
          kind: 'equipmentBreak',
          startMs: atMs,
          endMs: atMs + beats.equipmentBreakMs,
          seq: event.seq,
          group: event.group,
          petId: event.pet.id,
          equipment: event.equipment,
          ailment: event.ailment,
        });
        // The shatter is a reaction drawn on the pet, and nothing waits for it
        // (checklist 12): it overlaps whatever comes next rather than pushing
        // it back, so a knockout chain that breaks a perk keeps the ordinary
        // trade cadence instead of stretching to about 0.85 s.
        commitStep(event, atMs, atMs + beats.equipmentBreakMs, atMs, stepCuesFrom());
        break;
      }

      case 'outcome': {
        winner = event.winner;
        commitStep(event, cursor, cursor, cursor, []);
        break;
      }

      default:
        break;
    }
  }

  closeBanner(cursor);
  const openEndMs = cursor + beats.corpseLaunchMs;
  for (const corpse of openCorpses.values()) {
    corpse.endMs = openEndMs;
  }

  // The battle ends on its last beat, not on the last decoration still fading
  // over it. A hurt outline lives a whole second after the hit it marks, and
  // waiting it out added most of a second of nothing to every fixture; the end
  // screen dims over it instead, which is what the clips show.
  const lastCueEnd = cues.reduce(
    (max, cue) =>
      cue.kind === 'hurtOutline' || !Number.isFinite(cue.endMs)
        ? max
        : Math.max(max, cue.endMs),
    cursor,
  );
  const battleEndMs = Math.max(cursor, lastCueEnd) + beats.outcomeDelayMs;
  const durationMs = battleEndMs + (includeOutro ? OUTRO_BEATS.totalMs : 0);

  cues.sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);

  return {
    mode,
    battleEndMs,
    durationMs,
    steps,
    cues,
    initialBoard: cloneBoard(options.initialBoard),
    finalBoard: cloneBoard(board),
    winner,
  };
};

const BOARD_CHANGING: ReadonlySet<AnimationStepKind> = new Set<AnimationStepKind>([
  'clash',
  'hit',
  'statChange',
  'statCopy',
  'corpseLaunch',
  'pushForward',
  'move',
  'summon',
  'transform',
  'equipment',
]);

/**
 * When each board state comes up, which is what REWIND steps through.
 *
 * A step starts before it changes anything, so this reads `commitMs` rather
 * than `startMs`: landing on one of these instants puts exactly that board on
 * screen, which is what a step back has to show.
 */
export const boardStateTimes = (timeline: AnimationTimeline): number[] => {
  const times: number[] = [0];
  for (const step of timeline.steps) {
    if (!BOARD_CHANGING.has(step.kind)) {
      continue;
    }
    if (step.commitMs > times[times.length - 1]) {
      times.push(step.commitMs);
    }
  }
  return times;
};

/** Beats the controls step through: every step that changes the board. */
export const checkpointTimes = (timeline: AnimationTimeline): number[] => {
  const times: number[] = [0];
  const boardChanging = BOARD_CHANGING;
  for (const step of timeline.steps) {
    if (!boardChanging.has(step.kind)) {
      continue;
    }
    const at = step.startMs;
    if (times[times.length - 1] !== at) {
      times.push(at);
    }
  }
  return times;
};
