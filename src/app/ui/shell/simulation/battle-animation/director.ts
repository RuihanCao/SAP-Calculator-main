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
} from './cues';
import { AnimationMode, INTRO_BEATS, OUTRO_BEATS, getBeats } from './timing';

/** One cue without its id, distributed over the union so a literal type checks. */
type CueDraft<T> = T extends AnimationCue ? Omit<T, 'id'> : never;

export interface DirectorOptions {
  mode?: AnimationMode;
  /** The board the stream starts from; the stream itself never states it. */
  initialBoard: AnimationBoardState;
  /** The entrance, checklist 18. Off for tests that only read battle beats. */
  includeIntro?: boolean;
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
 * the corpse flight, the next banner comes up over the fading popups, and the
 * clash cadence is a floor the following clash may not start before, so a faint
 * and its slide fit inside it instead of adding to it (checklist 12).
 */
export const buildBattleTimeline = (
  events: ReadonlyArray<AnimationEvent>,
  options: DirectorOptions,
): AnimationTimeline => {
  const mode = options.mode ?? 'normal';
  const beats = getBeats(mode);
  const includeIntro = options.includeIntro !== false;
  const includeOutro = options.includeOutro !== false;
  const introEndMs = includeIntro ? INTRO_BEATS.totalMs : 0;

  const cues: AnimationCue[] = [];
  const steps: AnimationStep[] = [];
  const board = cloneBoard(options.initialBoard);

  let cursor = introEndMs;
  /** No clash may contact before this, which is the cadence of checklist 12. */
  let clashFloorMs = introEndMs;
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
  /** Nothing in the current group may start before this (a spend's own gap). */
  let groupBeatFloorMs = 0;
  /** When the damage step that is killing pets landed, so a corpse holds. */
  let lastDamageMs: number | null = null;
  let groupSummonStartMs: number | null = null;
  let groupSummonCount = 0;

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
   * whole run of deliveries and is closed by anything that is not one.
   */
  const deliveryAt = (): number => pendingDeliveryMs ?? cursor;

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

  for (const event of events) {
    const before = cues.length;
    const stepCuesFrom = (): AnimationCue[] => cues.slice(before);

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
        const arrivalMs = startMs + beats.projectileFlightMs;
        addPayloadToBanner(projectile.payload);
        if (mode === 'normal' && projectile.targets.length > 0) {
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
          });
        } else if (projectile.source.kind === 'pet') {
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
        const windupStart = Math.max(cursor, clashFloorMs);
        const flightMs = clash.jump ? beats.jumpFlightMs : 0;
        const contactMs =
          windupStart + beats.clashWindupMs + Math.round(flightMs * 0.45);
        const endMs = clash.jump
          ? contactMs + Math.round(flightMs * 0.55)
          : contactMs + beats.clashRecoilMs;
        push({
          kind: 'clash',
          startMs: windupStart,
          endMs,
          seq: event.seq,
          group: event.group,
          jump: clash.jump,
          contactMs,
          hits: clash.hits.map((hit) => ({
            sourceId: hit.source.id,
            targetId: hit.target.id,
            damage: hit.damage,
            blocked: hit.blocked,
          })),
          attackerIds: clash.hits.map((hit) => hit.source.id),
        });
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
        clashFloorMs = contactMs + beats.clashSettleMs;
        cursor = contactMs + beats.clashRecoilMs;
        commitStep(event, windupStart, endMs, contactMs, stepCuesFrom());
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
        });
        openCorpses.set(event.pet.id, cue);
        commitStep(event, startMs, startMs, startMs, stepCuesFrom());
        break;
      }

      case 'corpseLaunchGroup': {
        pendingDeliveryMs = null;
        const groupId = `launch-${event.seq}`;
        const launchAt = cursor;
        const endMs = launchAt + beats.corpseLaunchMs;
        for (const ref of event.pets) {
          const corpse = openCorpses.get(ref.id);
          if (corpse) {
            corpse.endMs = launchAt;
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
          });
        }
        if (event.pets.length > 0) {
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
        cursor = launchAt + beats.corpseAdvanceMs;
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
        cursor = startMs + Math.round(beats.pushForwardMs * 0.5);
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
        cursor = atMs + Math.round(beats.equipmentBreakMs * 0.6);
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

  const lastCueEnd = cues.reduce(
    (max, cue) => Math.max(max, Number.isFinite(cue.endMs) ? cue.endMs : max),
    cursor,
  );
  const battleEndMs = Math.max(cursor, lastCueEnd) + beats.outcomeDelayMs;
  const durationMs = battleEndMs + (includeOutro ? OUTRO_BEATS.totalMs : 0);

  cues.sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);

  return {
    mode,
    introEndMs,
    battleEndMs,
    durationMs,
    steps,
    cues,
    initialBoard: cloneBoard(options.initialBoard),
    finalBoard: cloneBoard(board),
    winner,
  };
};

/** Board states the controls step through: every step that changes the board. */
export const checkpointTimes = (timeline: AnimationTimeline): number[] => {
  const times: number[] = [timeline.introEndMs];
  const boardChanging = new Set<AnimationStepKind>([
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
