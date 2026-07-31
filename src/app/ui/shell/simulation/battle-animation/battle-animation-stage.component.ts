import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  AnimationEvent,
  AnimationPayloadKind,
  AnimationSide,
} from 'app/domain/interfaces/animation-event.interface';
import { Log } from 'app/domain/interfaces/log.interface';
import { getEquipmentIconPath, getPetIconPath } from 'app/runtime/asset-catalog';
import {
  AnimationBoardPet,
  AnimationBoardState,
  buildSeedBoard,
} from './board-state';
import { AnimationTimeline } from './cues';
import { buildBattleTimeline } from './director';
import {
  CorpseView,
  FrameView,
  PetView,
  PopupView,
  ProjectileView,
  TimelineSampler,
} from './frame';
import {
  PlaybackState,
  advancePlayback,
  initialPlayback,
  pause,
  play,
  remapTimeAcrossTimelines,
  rewind,
  seek,
  skip,
} from './playback';
import { buildSeedBoardFromLogs } from './seed-board';

interface Point {
  x: number;
  y: number;
}

const PAYLOAD_ICONS: Record<AnimationPayloadKind, string> = {
  'attack-glyph': '/assets/art/Public/Public/Icons/fist-from-textmap.png',
  heart: '/assets/art/Public/Public/Icons/heart-from-textmap.png',
  'mana-potion':
    '/assets/art/Public/Public/Icons/TextMap-resources.assets-31-split/mana.png',
  'xp-book': '/assets/art/Public/Public/Icons/TextMap-resources.assets-31-split/xp.png',
  'perk-icon':
    '/assets/art/Public/Public/Icons/TextMap-resources.assets-31-split/snipe.png',
  trumpet:
    '/assets/art/Public/Public/Icons/TextMap-resources.assets-31-split/trumpet.png',
};

const ATTACK_ICON = PAYLOAD_ICONS['attack-glyph'];
const HEALTH_ICON = PAYLOAD_ICONS.heart;
const MANA_ICON = PAYLOAD_ICONS['mana-potion'];
const XP_ICON = PAYLOAD_ICONS['xp-book'];
const TRUMPET_ICON = PAYLOAD_ICONS.trumpet;

/** Field geometry, in percent of the stage box. */
const MIDLINE_X = 50;
const SLOT_GAP_X = 8.6;
const FRONT_OFFSET_X = 4.6;
/**
 * How close to the midline a clashing pet gets. The two sprites meet with the
 * flash between them and do not overlap, checklist 1.
 */
const CLASH_GAP_X = 3.4;
const GROUND_Y = 66;
const LIFT_Y = 26;
const BANNER_ANCHOR: Point = { x: 34, y: 16 };
/** Where a corpse flies to before it bursts, in percent of the stage. */
const CORPSE_EXIT_DX = 22;
const CORPSE_EXIT_DY = 56;
const COUNTER_ANCHOR: Record<AnimationSide, Point> = {
  player: { x: 12, y: 12 },
  opponent: { x: 88, y: 12 },
};

/**
 * The event driven fight animation.
 *
 * It consumes `Battle.events` and nothing else: no prose is parsed, no log text
 * is matched. The director turns the stream into a timeline, the sampler turns
 * the timeline into the frame at the clock's current millisecond, and this
 * component only places what the frame says is on screen.
 */
@Component({
  selector: 'app-battle-animation-stage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './battle-animation-stage.component.html',
  styleUrl: './battle-animation-stage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleAnimationStageComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input({ required: true }) events: ReadonlyArray<AnimationEvent> = [];
  @Input() logs: ReadonlyArray<Log> = [];
  @Input() speed = 1;
  @Input() autoPlay = false;

  @Output() legacyRequested = new EventEmitter<void>();

  normalTimeline: AnimationTimeline | null = null;
  fastTimeline: AnimationTimeline | null = null;
  sampler: TimelineSampler | null = null;
  frame: FrameView | null = null;
  fast = false;
  /**
   * Checklist 17: on, the battle runs to the end; off, PLAY buys one beat.
   * The real client keeps the toggle for the whole browser session, so it is
   * not reset when a new battle is loaded.
   */
  autoplay = true;
  playback: PlaybackState = initialPlayback();

  /**
   * One em is the stage's scale unit, so the same layout reads in the split
   * pane and full screen. Everything in the stylesheet is sized in em.
   */
  fieldFontPx = 14;

  @ViewChild('field') private fieldRef?: ElementRef<HTMLElement>;

  private rafHandle: number | null = null;
  private lastTickMs = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['events'] || changes['logs']) {
      this.rebuild();
    }
    if (changes['speed']) {
      this.playback = { ...this.playback, speed: this.speed };
    }
  }

  ngAfterViewInit(): void {
    this.observeField();
  }

  ngOnDestroy(): void {
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private observeField(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver?.disconnect();
    const element = this.fieldRef?.nativeElement;
    if (!element) {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      const next = Math.max(9, Math.min(26, Math.round(height / 30)));
      if (next !== this.fieldFontPx) {
        this.fieldFontPx = next;
        this.cdr.detectChanges();
      }
    });
    this.resizeObserver.observe(element);
  }

  // ------------------------------------------------------------- transport --

  get timeline(): AnimationTimeline | null {
    return this.fast ? this.fastTimeline : this.normalTimeline;
  }

  get playing(): boolean {
    return this.playback.playing || this.playback.skip != null;
  }

  get progress(): number {
    const timeline = this.timeline;
    if (!timeline || timeline.durationMs <= 0) {
      return 0;
    }
    return this.playback.timeMs / timeline.durationMs;
  }

  togglePlay(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    this.playback = this.playing
      ? pause(this.playback)
      : play(this.playback, timeline, this.autoplay);
    this.syncLoop();
  }

  toggleAutoplay(): void {
    this.autoplay = !this.autoplay;
    if (this.playing) {
      const timeline = this.timeline;
      this.playback = timeline
        ? play(pause(this.playback), timeline, this.autoplay)
        : this.playback;
    }
    this.render();
  }

  /** 0..1, so the bar arrives with the entrance and goes when the battle does. */
  get controlsOpacity(): number {
    return this.frame?.controls ?? 1;
  }

  /** Checklist 17: one board state back, and still playable afterwards. */
  onRewind(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    this.playback = rewind(this.playback, timeline);
    this.render();
    this.syncLoop();
  }

  onSkip(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    this.playback = skip(this.playback, timeline);
    this.syncLoop();
  }

  onRestart(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    this.playback = play(seek(this.playback, timeline, 0), timeline, this.autoplay);
    this.syncLoop();
  }

  /** Skips the entrance, which the real game also lets you cut through. */
  skipIntro(): void {
    const timeline = this.timeline;
    if (!timeline || this.playback.timeMs >= timeline.introEndMs) {
      return;
    }
    this.playback = seek(this.playback, timeline, timeline.introEndMs);
    this.render();
  }

  toggleFast(): void {
    const from = this.timeline;
    this.fast = !this.fast;
    const to = this.timeline;
    if (from && to) {
      this.playback = {
        ...this.playback,
        timeMs: remapTimeAcrossTimelines(from, to, this.playback.timeMs),
      };
      this.sampler = new TimelineSampler(to);
    }
    this.render();
  }

  onScrub(rawValue: string | number): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.playback = seek(this.playback, timeline, parsed);
    this.render();
  }

  useLegacy(): void {
    this.legacyRequested.emit();
  }

  // ------------------------------------------------------------- geometry --

  slotX(side: AnimationSide, slot: number): number {
    const offset = FRONT_OFFSET_X + slot * SLOT_GAP_X;
    return side === 'player' ? MIDLINE_X - offset : MIDLINE_X + offset;
  }

  petStyle(view: PetView): Record<string, string> {
    let x = this.slotX(view.pet.side, view.slot);
    if (view.jumpTargetSlot != null && view.jumpTargetSide) {
      const target = this.slotX(view.jumpTargetSide, view.jumpTargetSlot);
      x += (target - x) * view.lean;
    } else if (view.lean > 0) {
      const meeting =
        view.pet.side === 'player' ? MIDLINE_X - CLASH_GAP_X : MIDLINE_X + CLASH_GAP_X;
      x += (meeting - x) * view.lean;
    }
    let y = GROUND_Y - view.lift * LIFT_Y;
    let entrance = 1;
    const intro = this.frame?.intro;
    if (intro) {
      // The line-up of checklist 18: the player board slides in from the left,
      // the opponent board is delivered from the top right.
      if (view.pet.side === 'player') {
        entrance = intro.playerBoard;
        x -= (1 - entrance) * 55;
      } else {
        entrance = intro.opponentBoard;
        x += (1 - entrance) * 45;
        y -= (1 - entrance) * 35;
      }
    }
    return {
      left: `${x}%`,
      top: `${y}%`,
      opacity: `${(0.25 + 0.75 * view.reveal) * (entrance > 0 ? 1 : 0)}`,
      transform: `translate(-50%, -100%) scale(${0.7 + 0.3 * view.reveal})`,
    };
  }

  corpseStyle(view: CorpseView): Record<string, string> {
    const from = this.slotX(view.side, view.slot);
    const x = from + CORPSE_EXIT_DX * view.progress;
    const y = GROUND_Y - CORPSE_EXIT_DY * view.progress;
    return {
      left: `${x}%`,
      top: `${y}%`,
      opacity: `${1 - Math.max(0, view.progress - 0.8) * 5}`,
      transform: `translate(-50%, -100%) rotate(${view.progress * 90}deg)`,
    };
  }

  projectileStyle(view: ProjectileView): Record<string, string> {
    const fromX =
      view.fromSlot != null ? this.slotX(view.fromSide, view.fromSlot) : BANNER_ANCHOR.x;
    const fromY = view.fromSlot != null ? GROUND_Y - 8 : BANNER_ANCHOR.y;
    const toX = this.slotX(view.toSide, view.toSlot);
    const toY = GROUND_Y - 8;
    const p = view.progress;
    const x = fromX + (toX - fromX) * p;
    const apex = 4 * p * (1 - p);
    const y = fromY + (toY - fromY) * p - apex * 34;
    return { left: `${x}%`, top: `${y}%` };
  }

  popupStyle(view: PopupView): Record<string, string> {
    const x = this.slotX(view.side, view.slot);
    const rise = view.progress * 6;
    const y = GROUND_Y - 16 - rise;
    return {
      left: `${x}%`,
      top: `${y}%`,
      opacity: `${view.progress > 0.75 ? (1 - view.progress) * 4 : 1}`,
      transform: `translate(calc(-50% + ${view.offset * 2.6}em), -100%)`,
    };
  }

  pointStyle(x: number, y: number): Record<string, string> {
    return { left: `${x}%`, top: `${y}%` };
  }

  slotPointStyle(side: AnimationSide, slot: number, dy = 0): Record<string, string> {
    return this.pointStyle(this.slotX(side, slot), GROUND_Y - 12 + dy);
  }

  /** Where a corpse group leaves the screen, which is where it bursts. */
  burstStyle(side: AnimationSide, slot: number): Record<string, string> {
    return this.pointStyle(
      this.slotX(side, slot) + CORPSE_EXIT_DX,
      GROUND_Y - CORPSE_EXIT_DY,
    );
  }

  counterStyle(side: AnimationSide): Record<string, string> {
    return this.pointStyle(COUNTER_ANCHOR[side].x, COUNTER_ANCHOR[side].y);
  }

  tokenStyle(
    side: AnimationSide,
    direction: 'to-counter' | 'to-pet',
    toSlot: number | null,
    progress: number,
  ): Record<string, string> {
    const counter = COUNTER_ANCHOR[side];
    const petPoint: Point = {
      x: toSlot != null ? this.slotX(side, toSlot) : counter.x,
      y: GROUND_Y - 10,
    };
    const from = direction === 'to-counter' ? BANNER_ANCHOR : counter;
    const to = direction === 'to-counter' ? counter : petPoint;
    return this.pointStyle(
      from.x + (to.x - from.x) * progress,
      from.y + (to.y - from.y) * progress,
    );
  }

  flashStyle(): Record<string, string> {
    const flash = this.frame?.flash;
    if (!flash) {
      return {};
    }
    const a = this.slotX(flash.aSide, flash.aSlot);
    const b = this.slotX(flash.bSide, flash.bSlot);
    return {
      left: `${(a + b) / 2}%`,
      top: `${GROUND_Y - 12}%`,
      opacity: `${1 - flash.progress}`,
      transform: `translate(-50%, -50%) scale(${0.6 + flash.progress * 1.6})`,
    };
  }

  // ----------------------------------------------------------------- art ---

  petIcon(name: string): string | null {
    return getPetIconPath(name);
  }

  equipmentIcon(pet: AnimationBoardPet): string | null {
    return pet.equipment
      ? getEquipmentIconPath(pet.equipment, pet.equipmentIsAilment)
      : null;
  }

  payloadIcon(payload: AnimationPayloadKind): string {
    return PAYLOAD_ICONS[payload];
  }

  statIcon(kind: string | null): string {
    switch (kind) {
      case 'health':
        return HEALTH_ICON;
      case 'mana':
        return MANA_ICON;
      case 'exp':
        return XP_ICON;
      case 'trumpet-gain':
      case 'trumpet-spend':
        return TRUMPET_ICON;
      default:
        return ATTACK_ICON;
    }
  }

  readonly sides: AnimationSide[] = ['player', 'opponent'];
  readonly trophySlots = Array.from({ length: 10 }, (_, index) => index);
  readonly heartSlots = Array.from({ length: 5 }, (_, index) => index);
  /** Shards a consumed melon scatters around the pet, checklist 10. */
  readonly shardSlots = Array.from({ length: 6 }, (_, index) => index);
  readonly attackIcon = ATTACK_ICON;
  readonly healthIcon = HEALTH_ICON;
  readonly manaIcon = MANA_ICON;
  readonly xpIcon = XP_ICON;
  readonly trumpetIcon = TRUMPET_ICON;

  trackByIndex = (index: number): number => index;
  trackByPetId = (_: number, view: PetView): number => view.pet.id;
  trackById = (_: number, view: { id: string }): string => view.id;
  trackByCorpse = (_: number, view: CorpseView): number => view.petId;

  // -------------------------------------------------------------- internals --

  private rebuild(): void {
    this.stopLoop();
    const events = [...(this.events ?? [])];
    if (events.length === 0) {
      this.normalTimeline = null;
      this.fastTimeline = null;
      this.sampler = null;
      this.frame = null;
      this.playback = initialPlayback(this.speed);
      this.cdr.markForCheck();
      return;
    }
    const initialBoard = this.resolveSeedBoard(events);
    this.normalTimeline = buildBattleTimeline(events, { initialBoard, mode: 'normal' });
    this.fastTimeline = buildBattleTimeline(events, { initialBoard, mode: 'fast' });
    const timeline = this.timeline;
    this.sampler = timeline ? new TimelineSampler(timeline) : null;
    this.playback = initialPlayback(this.speed);
    this.render();
    this.observeField();
    if (this.autoPlay) {
      this.togglePlay();
    }
  }

  /**
   * The stream states what happens, never what the boards were, so the seed
   * comes from the battle's own first board log. Without logs the roster is
   * recovered from the first sighting of each starting pet in the stream.
   */
  private resolveSeedBoard(events: AnimationEvent[]): AnimationBoardState {
    const fromLogs = buildSeedBoardFromLogs(this.logs ?? []);
    if (fromLogs) {
      return fromLogs;
    }
    const seen = new Map<number, { name: string; attack: number; health: number; index: number; level: number }>();
    const note = (ref: {
      id: number;
      name: string;
      index: number;
      level: number;
      attack: number;
      health: number;
    }): void => {
      if (ref.id > 100 || seen.has(ref.id)) {
        return;
      }
      seen.set(ref.id, {
        name: ref.name,
        attack: ref.attack,
        health: ref.health,
        index: ref.index,
        level: ref.level,
      });
    };
    for (const event of events) {
      switch (event.type) {
        case 'clash':
          for (const hit of event.hits) {
            note(hit.source);
            note(hit.target);
          }
          break;
        case 'hit':
          note(event.target);
          break;
        case 'faint':
          note(event.pet);
          break;
        default:
          break;
      }
    }
    const bySide = (base: number) => {
      const pets: Array<{ name: string; attack: number; health: number; level: number } | null> = [
        null,
        null,
        null,
        null,
        null,
      ];
      for (const [id, ref] of seen) {
        if (id < base || id > base + 4) {
          continue;
        }
        pets[id - base] = {
          name: ref.name,
          attack: ref.attack,
          health: ref.health,
          level: ref.level,
        };
      }
      return pets;
    };
    return buildSeedBoard(bySide(1), bySide(11));
  }

  private syncLoop(): void {
    if (this.playing) {
      this.startLoop();
    } else {
      this.stopLoop();
      this.render();
    }
  }

  private startLoop(): void {
    if (this.rafHandle != null || typeof requestAnimationFrame === 'undefined') {
      return;
    }
    this.lastTickMs = performance.now();
    this.zone.runOutsideAngular(() => {
      const tick = (now: number): void => {
        const timeline = this.timeline;
        if (!timeline) {
          this.rafHandle = null;
          return;
        }
        const deltaMs = Math.min(120, now - this.lastTickMs);
        this.lastTickMs = now;
        this.playback = advancePlayback(this.playback, timeline, deltaMs);
        this.render();
        if (!this.playing) {
          this.rafHandle = null;
          return;
        }
        this.rafHandle = requestAnimationFrame(tick);
      };
      this.rafHandle = requestAnimationFrame(tick);
    });
  }

  private stopLoop(): void {
    if (this.rafHandle != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = null;
  }

  private render(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    if (!this.sampler || this.sampler.timeline !== timeline) {
      this.sampler = new TimelineSampler(timeline);
    }
    this.frame = this.sampler.frameAt(this.playback.timeMs);
    this.cdr.detectChanges();
    if (!this.resizeObserver && this.fieldRef) {
      // The field only exists once a frame has been drawn, so the scale unit is
      // measured on the first render rather than in ngAfterViewInit.
      this.observeField();
    }
  }
}
