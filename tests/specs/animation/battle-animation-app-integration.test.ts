import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  AnimationBoardState,
  BATTLE_BACKGROUNDS,
  DEFAULT_BATTLE_BACKGROUND,
  OPPONENT_BOARD_FACING,
  PLAYER_BOARD_FACING,
  SPRITE_SHEET_FACING,
  TimelineSampler,
  backgroundUrl,
  boardFacing,
  buildBattleTimeline,
  buildSeedBoard,
  facingTransform,
  initialPlayback,
  mirrorsSprite,
  pickBackground,
  play,
} from '../../../src/app/ui/shell/simulation/battle-animation';
import { loadFixture, readGolden } from '../../support/animation-event-fixtures';

const repoRoot = path.resolve(__dirname, '../../..');
const stageDir = path.join(
  repoRoot,
  'src/app/ui/shell/simulation/battle-animation',
);
const stageTemplate = readFileSync(
  path.join(stageDir, 'battle-animation-stage.component.html'),
  'utf8',
);
const shellTemplate = readFileSync(
  path.join(
    repoRoot,
    'src/app/ui/shell/components/app-shell-battle-results.component.html',
  ),
  'utf8',
);
const backgroundDir = path.join(
  repoRoot,
  'src/assets/art/Public/Public/Background',
);

interface FixturePet {
  pet: string;
  attack: number;
  health: number;
  level?: number;
  perk?: string;
}

const seedFor = (id: string): AnimationBoardState => {
  const fixture = loadFixture(id) as {
    player?: FixturePet[];
    opponent?: FixturePet[];
  };
  const toSeed = (pets: FixturePet[] | undefined) =>
    (pets ?? []).map((pet) => ({
      name: pet.pet,
      attack: pet.attack,
      health: pet.health,
      level: pet.level ?? 1,
      equipment: pet.perk ?? null,
    }));
  return buildSeedBoard(toSeed(fixture.player), toSeed(fixture.opponent));
};

describe('App integration overrides, round 4', () => {
  describe('facing', () => {
    /**
     * The two constants are measurements, not preferences, so the spec states
     * the numbers they came from.
     *
     * The pack draws pets looking left: in Pets/Duck.png the yellow beak sits
     * at x=62 against a body centroid at x=122, and in Pets/Swan.png the beak
     * is at x=40 against a body at x=111.
     *
     * The real game turns the near board around: in the reference frame
     * clips/f01-plain-trades/f_00829_0029361.jpg the player board's duck has
     * its beak at x=49 against a body at x=38 and its swan's beak at x=62
     * against a body at x=47, both heads on the right, while the same frame's
     * opponent cow and otter match the art as drawn.
     */
    it('keeps the art as drawn on the far board and turns the near one around', () => {
      expect(SPRITE_SHEET_FACING).toBe('left');
      expect(PLAYER_BOARD_FACING).toBe('right');
      expect(OPPONENT_BOARD_FACING).toBe('left');
      expect(boardFacing('player')).toBe('right');
      expect(boardFacing('opponent')).toBe('left');
      expect(mirrorsSprite('player')).toBe(true);
      expect(mirrorsSprite('opponent')).toBe(false);
      expect(facingTransform('player')).toBe('scaleX(-1)');
      expect(facingTransform('opponent')).toBe('none');
    });

    it('faces the two boards at each other rather than the same way', () => {
      expect(boardFacing('player')).not.toBe(boardFacing('opponent'));
    });

    /**
     * The flip is bound onto the pet's own image, so a pet standing still, one
     * lunging, one jumping and one flying off as a corpse all inherit it. The
     * two places a pet's art is drawn both have to carry the binding, or one
     * of them faces the wrong way.
     */
    it('binds the facing on every drawing of a pet', () => {
      const bindings = stageTemplate.match(
        /\[style\.transform\]="iconTransform\([^"]+\)"/g,
      );
      expect(bindings).not.toBeNull();
      expect(bindings?.length).toBe(2);
      expect(stageTemplate).toContain('iconTransform(pet.pet.side)');
      expect(stageTemplate).toContain('iconTransform(corpse.side)');
      // And the flip is not also hard-coded in the stylesheet, which would
      // double it back on one of the boards.
      const styles = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.scss'),
        'utf8',
      );
      expect(styles).not.toMatch(/\.anim-pet-icon\s*\{[^}]*scaleX/);
    });
  });

  describe('background art', () => {
    it('defaults to the biome the reference replays are recorded on', () => {
      expect(DEFAULT_BATTLE_BACKGROUND).toBe('FieldBattle');
      expect(pickBackground(false)).toBe('FieldBattle');
      expect(backgroundUrl('FieldBattle')).toBe(
        "url('/assets/art/Public/Public/Background/FieldBattle.png')",
      );
    });

    it('names only sheets the pack actually ships, and all of them', () => {
      const onDisk = readdirSync(backgroundDir)
        .filter((file) => file.endsWith('Battle.png'))
        .map((file) => file.replace(/\.png$/, ''))
        .sort();
      expect([...BATTLE_BACKGROUNDS].sort()).toEqual(onDisk);
      expect(onDisk).toContain(DEFAULT_BATTLE_BACKGROUND);
    });

    it('draws a random field from the pack and nowhere else', () => {
      for (let roll = 0; roll < 1; roll += 0.017) {
        expect(BATTLE_BACKGROUNDS).toContain(pickBackground(true, roll));
      }
      expect(pickBackground(true, 0)).toBe(BATTLE_BACKGROUNDS[0]);
      expect(pickBackground(true, 0.9999999)).toBe(
        BATTLE_BACKGROUNDS[BATTLE_BACKGROUNDS.length - 1],
      );
      // A roll out of range still lands on a real sheet.
      expect(BATTLE_BACKGROUNDS).toContain(pickBackground(true, 1));
      expect(BATTLE_BACKGROUNDS).toContain(pickBackground(true, Number.NaN));
    });

    it('paints the field from the art rather than from a drawn gradient', () => {
      expect(stageTemplate).toContain('[style.background-image]="fieldBackground"');
      const styles = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.scss'),
        'utf8',
      );
      expect(styles).toContain('Background/FieldBattle.png');
      expect(styles).not.toContain('.anim-sky');
      expect(styles).not.toContain('.anim-ground');
    });
  });

  describe('the end screen', () => {
    /**
     * The real game's end screen also flies in a trophy row and a heart row
     * and animates one of them, which is a shop run's score. A calculator has
     * no run, so the screen carries the outcome and the two things there are
     * to do here.
     */
    it('carries no trophy or heart channel', () => {
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      const sampler = new TimelineSampler(timeline);
      const frame = sampler.frameAt(timeline.battleEndMs + 3200);
      expect(frame.phase).toBe('outro');
      expect(Object.keys(frame.outro ?? {}).sort()).toEqual([
        'dim',
        'face',
        'winner',
      ]);
      expect(frame.outro?.dim).toBeGreaterThan(0);
    });

    it('offers REWIND and EXIT and nothing else', () => {
      const outroBlock = stageTemplate.slice(
        stageTemplate.indexOf('<div class="anim-outro"'),
      );
      const buttons = outroBlock.match(/data-anim-outro="[a-z]+"/g);
      expect(buttons).toEqual(['data-anim-outro="rewind"', 'data-anim-outro="exit"']);
      expect(outroBlock).not.toMatch(/trophy|heart|Trophy|Heart/);
      expect(outroBlock).toContain('VICTORY');
      expect(outroBlock).toContain('DEFEAT');
    });
  });

  describe('the entry and the way out', () => {
    it('opens on one press, full screen, playing itself', () => {
      expect(shellTemplate).toContain('data-battle-animation="open"');
      expect(shellTemplate).toContain('(click)="openBattleAnimation()"');
      const fullscreen = shellTemplate.slice(
        shellTemplate.indexOf('battle-animation-fullscreen'),
      );
      expect(fullscreen).toContain('[autoPlay]="true"');
      expect(fullscreen).toContain('[fullscreen]="true"');
      expect(fullscreen).toContain('(exitRequested)="closeBattleAnimation()"');
    });

    /**
     * Autostart means the entrance, not the battle: a fresh playback that is
     * told to play sits at the first millisecond, which the sampler still
     * calls the entrance.
     */
    it('starts at the first frame of the entrance', () => {
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      const started = play(initialPlayback(), timeline);
      expect(started.timeMs).toBe(0);
      expect(started.playing).toBe(true);
      const sampler = new TimelineSampler(timeline);
      expect(sampler.frameAt(started.timeMs).phase).toBe('intro');
      expect(timeline.introEndMs).toBeGreaterThan(0);
    });

    it('shows no scrubber and no skip-intro button on the game screen', () => {
      expect(stageTemplate).toContain('class="anim-tools" *ngIf="!fullscreen"');
      expect(stageTemplate).not.toContain('skipIntro');
      expect(stageTemplate).not.toContain('anim-skip-intro');
    });

    it('lets the calculator ask for a random field', () => {
      expect(shellTemplate).toContain('data-battle-animation="random-background"');
      expect(shellTemplate).toContain('[randomBackground]="randomBattleBackground"');
    });
  });
});
