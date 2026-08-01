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
  DEFAULT_BATTLE_BACKGROUND,
  backgroundUrl,
  pickBackground,
} from './backgrounds';
import {
  AnimationBoardPet,
  AnimationBoardState,
  buildSeedBoard,
} from './board-state';
import { AnimationTimeline } from './cues';
import { facingTransform } from './facing';
import { buildBattleTimeline } from './director';
import {
  CorpseView,
  FrameView,
  PetAnchor,
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

/**
 * The art the stage is built from.
 *
 * Two sources, in the order the game-replication skill sets: the ripped asset
 * pack's own text-map sprites first, then pieces cut out of 3x captures of the
 * real client by `harness/extract_assets.py` for the in-battle chrome the pack
 * does not carry. Nothing here is drawn by hand: the SVG rock and the SVG
 * experience book that used to live in this file were the last two, and both
 * exist in the pack (`fist`, `xp`) as the very sprites the client prints.
 */
const ICONS = '/assets/art/Public/Public/Icons/TextMap-resources.assets-31-split';
const EXTRACTED = '/assets/art/Extracted';

const PAYLOAD_ICONS: Record<AnimationPayloadKind, string> = {
  'attack-glyph': `${ICONS}/fist.png`,
  heart: `${ICONS}/heart.png`,
  'mana-potion': `${ICONS}/mana.png`,
  'xp-book': `${ICONS}/xp.png`,
  'perk-icon': `${ICONS}/perk.png`,
  trumpet: `${ICONS}/trumpet.png`,
};

/**
 * The replay bar's printing, cut off the client's own bar. PLAY is the SKIP
 * triangle with its stop bar cropped away, because a capture of a running
 * replay never shows the bar in its paused state.
 */
const GLYPHS = {
  rewind: `${EXTRACTED}/glyph-rewind.png`,
  pause: `${EXTRACTED}/glyph-pause.png`,
  play: `${EXTRACTED}/glyph-play.png`,
  autoplay: `${EXTRACTED}/glyph-autoplay.png`,
  fast: `${EXTRACTED}/glyph-fast.png`,
  skip: `${EXTRACTED}/glyph-skip.png`,
} as const;

/**
 * The end screen's face.
 *
 * Only the winning face has been captured off the client so far, so a loss and
 * a draw keep the caption alone rather than wearing a face that was invented
 * for them; the missing capture is recorded in the experiment's task list.
 */
const OUTRO_FACES: Partial<Record<AnimationSide | 'draw', string>> = {
  player: `${EXTRACTED}/outro-face.png`,
};

const ATTACK_ICON = PAYLOAD_ICONS['attack-glyph'];
const HEALTH_ICON = PAYLOAD_ICONS.heart;
const MANA_ICON = PAYLOAD_ICONS['mana-potion'];
const XP_ICON = PAYLOAD_ICONS['xp-book'];
const TRUMPET_ICON = PAYLOAD_ICONS.trumpet;

/**
 * Field geometry, in percent of the play area.
 *
 * The play area is the 16:9 box inside the black bars, so a percentage here
 * means the same thing it means on the reference recording, which is a 960 by
 * 600 viewport carrying a 960 by 540 play area (rows 30 to 569 of every frame
 * in clips/, measured on f11 t=30.45).
 */
const MIDLINE_X = 50;
/**
 * Slot pitch, measured on the reference board of f11 t=30.45: the opponent's
 * three pets stand at x=537, 625 and 720 of 960, so one slot is 90px, 9.4% of
 * the play area's width.
 */
const SLOT_GAP_X = 9.4;
/**
 * Where each side's front pet stands. On the same frame the opponent's front
 * pet is at x=537, 5.9% right of the midline, and the player's second pet is
 * at x=327, 16.3% left of it, which puts the player's front at 6.9% left. The
 * midpoint of the two readings is used, so the boards are symmetric.
 */
const FRONT_OFFSET_X = 6.4;
/**
 * How close to the midline a clashing pet gets. The two sprites meet with the
 * flash between them and do not overlap, checklist 1.
 */
const CLASH_GAP_X = 6;
/**
 * Where a pet's card ends, which is the bottom of its stat badges. Measured on
 * the reference frame f11 t=30.45: the player pig's badges end at y=432 of a
 * play area running 30 to 569, so 0.744 of it. That stands the sprite on the
 * dirt lane with its head over the bushes behind it, exactly as the real game
 * composes the board.
 */
/*
 * Round 7 re-reading: on the reference a pet's feet sit about 6px of a 960 wide
 * frame above the bottom of the dirt band and ours sat 12px above it, so the
 * card's foot goes down by 6px of that frame, 1.1% of the play area.
 */
const GROUND_Y = 75.5;
const LIFT_Y = 26;
/**
 * The ability toast. On the same reference frame the plate runs x=264 to 565
 * and y=141 to 258, so its centre is 43.4% across and 20.7% down the play
 * area, which hangs it clear under the control bar and over the near board.
 */
const BANNER_ANCHOR: Point = { x: 43.4, y: 31.4 };
/**
 * Where a corpse flies to before it bursts, in percent of the play area.
 *
 * It leaves over its own board, not across the field: the player's pig corpse
 * is up and to the left at f01 t=32.01
 * (clips/f01-plain-trades/f_00905_0032006.jpg) and the opponent's is up and to
 * the right at t=37.39 (f_01070_0037391.jpg), so the sign follows the side.
 */
const CORPSE_EXIT_DX = 22;
const CORPSE_EXIT_DY = 56;
/**
 * The other player's avatar, standing at the field's right in every reference
 * battle frame. It is `Mascot/TurtleBattle.png` from the pack, which matches
 * the reference figure part for part: cream bucket hat, purple hair, cream
 * shirt, green shorts, turtle shell on the back, green boots.
 *
 * Placement measured on f11 t=30.45, where the sprite's cream runs x=853 to
 * 923 and y=210 to 333 against the same cream in the asset, which fixes the
 * scale at 0.278 and so the drawn box at 85 by 132 of a 960 by 540 play area.
 */
const MASCOT_SPRITE = '/assets/art/Public/Public/Mascot/TurtleBattle.png';
/** How many cloud links the corpse trail is drawn as. */
const CORPSE_TRAIL_LINKS = 7;
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
  /**
   * Play the moment the battle is loaded, from the first frame of the
   * entrance. The fullscreen presentation is opened this way, so one press of
   * the calculator's battle animation button is the whole entry: the shutter,
   * the line-up, then the battle, with nothing to press in between.
   */
  @Input() autoPlay = false;
  /**
   * The stage is the whole screen rather than a pane in the calculator. It
   * drops the tools that are ours and not the game's, and it offers the way
   * back out on the end screen.
   */
  @Input() fullscreen = false;
  /**
   * Fight on a biome drawn from the pack instead of the replay's own one. A
   * calculator run is not a shop run, so there is no biome to inherit, and the
   * roll is taken once per battle rather than once per frame.
   */
  @Input() randomBackground = false;
  /**
   * The names on the entrance banners. The real client puts the two teams'
   * names there, blue on the near side and orange on the far side (f11
   * t=22.16, out/f11-jump-african-wild-dog_board.jpg), so the calculator's own
   * team name is carried through when there is one and the sides fall back to
   * what they are otherwise.
   */
  @Input() playerTeamName = '';
  @Input() opponentTeamName = '';

  @Output() legacyRequested = new EventEmitter<void>();
  @Output() exitRequested = new EventEmitter<void>();

  /** The biome this battle is fought on, rolled when the battle is built. */
  backgroundName = DEFAULT_BATTLE_BACKGROUND;

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
      // The reference play area is 540 tall and everything on it was measured
      // against a 30th of that, so the unit follows the play area's height with
      // only enough of a clamp to keep a collapsed pane from dividing by zero.
      const height = entries[0]?.contentRect.height ?? 0;
      const next = Math.max(6, Math.min(96, Math.round(height / 30)));
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

  /**
   * The recorder's end-of-battle signal, published on the stage root.
   *
   * It is read from a data attribute rather than from the tools row's clock
   * text, because the tools row only exists on the inline pane and the recorder
   * moves the stage into its own holder before pressing play.
   */
  get animationComplete(): boolean {
    const timeline = this.timeline;
    if (!timeline || timeline.durationMs <= 0) {
      return false;
    }
    return this.playback.timeMs >= timeline.durationMs - 1;
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

  /**
   * Checklist 17. REWIND restarts the battle from the top of the entrance and
   * keeps playing, which is what the reference strip does, so it is also the
   * way off the end screen.
   */
  onRewind(): void {
    const timeline = this.timeline;
    if (!timeline) {
      return;
    }
    this.playback = rewind(this.playback, timeline, this.autoplay);
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

  /** Leaves the fullscreen animation, which puts the calculator back. */
  onExit(): void {
    this.stopLoop();
    this.exitRequested.emit();
  }

  // ---------------------------------------------------------------- paint --

  /** The battlefield art this battle is fought on. */
  get fieldBackground(): string {
    return backgroundUrl(this.backgroundName);
  }

  /**
   * Which way this board's art looks, applied on the pet's own image so that a
   * pet standing still, lunging, jumping, flying off as a corpse and arriving
   * as a summon all face the same way.
   */
  iconTransform(side: AnimationSide): string {
    return facingTransform(side);
  }

  // ------------------------------------------------------------- geometry --

  slotX(side: AnimationSide, slot: number): number {
    const offset = FRONT_OFFSET_X + slot * SLOT_GAP_X;
    return side === 'player' ? MIDLINE_X - offset : MIDLINE_X + offset;
  }

  /**
   * Where a pet actually is this frame, which is what everything drawn on it
   * reads. A popup takes the same point, so a numeral rides with a jumping pet
   * instead of hanging over the slot it left.
   */
  anchorPoint(view: PetAnchor): Point {
    let x = this.slotX(view.side, view.slot);
    if (view.jumpTargetSlot != null && view.jumpTargetSide) {
      const target = this.slotX(view.jumpTargetSide, view.jumpTargetSlot);
      x += (target - x) * view.lean;
    } else if (view.lean > 0) {
      const meeting =
        view.side === 'player' ? MIDLINE_X - CLASH_GAP_X : MIDLINE_X + CLASH_GAP_X;
      x += (meeting - x) * view.lean;
    }
    return { x, y: GROUND_Y - view.lift * LIFT_Y };
  }

  petStyle(view: PetView): Record<string, string> {
    const point = this.anchorPoint(view);
    let x = point.x;
    let y = point.y;
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
      // A pet that has left its slot paints over the ones it is passing or
      // landing on, or a jump attacker disappears behind its target at the
      // contact frame (checklist 14).
      'z-index': `${view.lean > 0 || view.lift > 0 ? 14 : 10}`,
      opacity: `${(0.25 + 0.75 * view.reveal) * (entrance > 0 ? 1 : 0)}`,
      transform: `translate(-50%, -100%) scale(${0.7 + 0.3 * view.reveal})`,
    };
  }

  /** Away from the midline, over its own board, and turning as it goes. */
  private corpseExitSign(side: AnimationSide): number {
    return side === 'player' ? -1 : 1;
  }

  corpseStyle(view: CorpseView): Record<string, string> {
    const sign = this.corpseExitSign(view.side);
    const from = this.slotX(view.side, view.slot);
    const x = from + sign * CORPSE_EXIT_DX * view.progress;
    const y = GROUND_Y - CORPSE_EXIT_DY * view.progress;
    return {
      left: `${x}%`,
      top: `${y}%`,
      opacity: `${1 - Math.max(0, view.progress - 0.8) * 5}`,
      transform: `translate(-50%, -100%) rotate(${sign * view.progress * 90}deg)`,
    };
  }

  /**
   * The puff chain a corpse leaves behind it, checklist 3. The reference trail
   * is a row of fat overlapping clouds laid along the flight path rather than
   * a wisp trailing off the sprite (f01 t=32.01 and t=37.39), so each link is
   * placed at its own fraction of the path and fades with age.
   */
  corpseTrail(view: CorpseView): Array<{ index: number; style: Record<string, string> }> {
    const sign = this.corpseExitSign(view.side);
    const from = this.slotX(view.side, view.slot);
    const links: Array<{ index: number; style: Record<string, string> }> = [];
    for (let index = 0; index < CORPSE_TRAIL_LINKS; index += 1) {
      const at = (view.progress * index) / CORPSE_TRAIL_LINKS;
      const age = 1 - index / CORPSE_TRAIL_LINKS;
      links.push({
        index,
        style: {
          left: `${from + sign * CORPSE_EXIT_DX * at}%`,
          top: `${GROUND_Y - 6 - CORPSE_EXIT_DY * at}%`,
          opacity: `${(0.35 + 0.65 * (1 - age)) * (1 - Math.max(0, view.progress - 0.8) * 5)}`,
          transform: `translate(-50%, -50%) scale(${0.62 + 0.38 * (1 - age)})`,
        },
      });
    }
    return links;
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
    const point = this.anchorPoint(view.anchor);
    const x = point.x;
    const rise = view.progress * 6;
    const y = point.y - 16 - rise;
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

  /** Below the bar and the counters, never over them (checklist 17). */
  bannerStyle(): Record<string, string> {
    return this.pointStyle(BANNER_ANCHOR.x, BANNER_ANCHOR.y);
  }

  slotPointStyle(side: AnimationSide, slot: number, dy = 0): Record<string, string> {
    return this.pointStyle(this.slotX(side, slot), GROUND_Y - 12 + dy);
  }

  /** Where a corpse group leaves the screen, which is where it bursts. */
  burstStyle(side: AnimationSide, slot: number): Record<string, string> {
    return this.pointStyle(
      this.slotX(side, slot) + this.corpseExitSign(side) * CORPSE_EXIT_DX,
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

  /** The bar's printing, so the template never names a file. */
  readonly glyph = GLYPHS;

  /**
   * What a shattering perk throws out, checklist 10: copies of the perk's own
   * sprite rather than coloured chips.
   */
  shardImage(pet: AnimationBoardPet): string | null {
    const icon = this.equipmentIcon(pet);
    return icon ? `url(${icon})` : null;
  }

  outroFace(winner: AnimationSide | 'draw'): string | null {
    return OUTRO_FACES[winner] ?? null;
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

  /** The two banner names, with the sides' own labels as the fallback. */
  get playerBannerName(): string {
    return this.playerTeamName.trim() || 'Player';
  }

  get opponentBannerName(): string {
    return this.opponentTeamName.trim() || 'Opponent';
  }

  readonly mascotSprite = MASCOT_SPRITE;
  readonly corpseTrailLinks = Array.from(
    { length: CORPSE_TRAIL_LINKS },
    (_, index) => index,
  );
  readonly sides: AnimationSide[] = ['player', 'opponent'];
  /** Shards a consumed melon scatters around the pet, checklist 10. */
  readonly shardSlots = Array.from({ length: 6 }, (_, index) => index);
  readonly attackIcon = ATTACK_ICON;
  readonly healthIcon = HEALTH_ICON;
  readonly manaIcon = MANA_ICON;
  readonly xpIcon = XP_ICON;
  readonly trumpetIcon = TRUMPET_ICON;

  trackByIndex = (index: number): number => index;
  trackByIndexed = (_: number, link: { index: number }): number => link.index;
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
    this.backgroundName = pickBackground(this.randomBackground);
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
        // Wall clock, not frame count: a slow frame still advances the clock by
        // what it cost, so a battle takes the time its timeline says it does
        // even while a screen recorder is stealing frames. The cap is only
        // there so a backgrounded tab does not resume with one huge jump.
        const deltaMs = Math.min(1000, now - this.lastTickMs);
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
