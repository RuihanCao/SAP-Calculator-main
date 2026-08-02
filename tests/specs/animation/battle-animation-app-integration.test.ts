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
  OUTRO_BEATS,
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
     * three places a pet's art is drawn all have to carry the binding, or one
     * of them faces the wrong way: the sprite, the white copy of it a contact
     * frame lays over the top, and the corpse.
     */
    it('binds the facing on every drawing of a pet', () => {
      const bindings = stageTemplate.match(
        /\[style\.transform\]="iconTransform\([^"]+\)"/g,
      );
      expect(bindings).not.toBeNull();
      expect(bindings?.length).toBe(3);
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

/**
 * Round 5. Every number below is read off a reference frame, and the frame is
 * named, so a later reader can re-measure rather than take this on trust.
 *
 * The frames used here:
 *   clips/f11-jump-african-wild-dog/f_00862_0030453.jpg  the board and the bar
 *   clips/f01-plain-trades/f_00905_0032006.jpg           a corpse in flight
 *   out/f11-jump-african-wild-dog_board.jpg              the entrance banners
 *   out/outro_victory_end.jpg                            the end screen
 */
describe('Round 5, measured against the reference frames', () => {
  const styles = readFileSync(
    path.join(stageDir, 'battle-animation-stage.component.scss'),
    'utf8',
  );

  describe('the letterbox, item 4', () => {
    /**
     * Every reference recording is a 960 by 600 viewport whose content runs
     * rows 30 to 569, so a 960 by 540 play area with black bars over and under
     * it. 960/540 is 16:9, and the measured 960/541 is 1.7745 against 1.7778.
     * Without the box the play area took the whole viewport and the lane band
     * came out 10% thin at 1280 by 800.
     */
    it('keeps a 16:9 play area inside black bars', () => {
      expect(styles).toMatch(/\.anim-field\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
      expect(styles).toMatch(/\.anim-field\s*\{[^}]*max-height:\s*100%/);
      expect(styles).toMatch(/\.anim-field\s*\{[^}]*max-width:\s*100%/);
      expect(styles).toMatch(/\.anim-stage-box\s*\{[^}]*background:\s*#000/);
      expect(stageTemplate).toContain('class="anim-stage-box"');
    });

    /** Item 16: the shutter is the screen going black, so it is black. */
    it('closes the shutter to pure black', () => {
      const shutter = styles.slice(styles.indexOf('.anim-shutter {'));
      expect(shutter.slice(0, 200)).toMatch(/background:\s*#000\s*;/);
      expect(styles).not.toContain('#10151c');
    });
  });

  describe('the pet card, items 6, 7 and 8', () => {
    /**
     * Item 7. The lane runs 80px of the 540 play area on the reference frame
     * and the worm's art fills 82px of it, so a pet's box is about 15.6% of
     * the play area: 4.7 of the stage's scale unit, which is a thirtieth of
     * the play area's height. The old 4 left every pet about 18% short.
     */
    it('sizes the sprite box against the lane', () => {
      expect(styles).toMatch(/\.anim-pet-art\s*\{[^}]*width:\s*4\.7em/);
      expect(styles).toMatch(/\.anim-pet-art\s*\{[^}]*height:\s*4\.7em/);
      expect(styles).toMatch(/\.anim-pet-icon\s*\{[^}]*width:\s*4\.7em/);
    });

    /**
     * Item 6. Structure, not styling: the numeral is inside a charcoal rock and
     * inside a red heart, each keylined black and haloed white, over one white
     * plate. A bordered pill with an icon next to a number is a different
     * object.
     */
    it('builds the badges as a numeral inside a rock and inside a heart', () => {
      const attack = styles.slice(styles.indexOf('.anim-pet-attack {'));
      const health = styles.slice(styles.indexOf('.anim-pet-health {'));
      // Round 7: the shapes are the pack's own text-map sprites, which arrive
      // with the client's charcoal rock, red heart, black keyline and white
      // halo already on them. They used to be SVG paths approximating that.
      expect(attack.slice(0, 200)).toContain('fist.png');
      expect(health.slice(0, 200)).toContain('heart.png');
      const mana = styles.slice(styles.indexOf('.anim-pet-mana {'));
      expect(mana.slice(0, 200)).toContain('mana.png');
      // The numeral is inside the shape, white, outlined in black.
      expect(styles).toMatch(/\.anim-pet-stat\s*\{[^}]*color:\s*#fff/);
      expect(styles).toMatch(/\.anim-pet-stat\s*\{[^}]*@include keyline\([^)]*#0d0d0d\)/);
      // And the shape is the badge's background, so nothing sits beside it.
      expect(stageTemplate).not.toMatch(
        /anim-pet-stat[^>]*>\s*\n?\s*<img \[src\]="attackIcon"/,
      );
      // One white plate carries the pair.
      const statPlate = styles.slice(styles.indexOf('.anim-pet-stats::before {'));
      expect(statPlate.slice(0, 300)).toContain('background: #fff');
    });

    /**
     * Item 8. The plaque is a wooden two-lobed sign with a small white "Lvl"
     * and a tall yellow numeral, not a flat brown "Lv1" chip. On the reference
     * frame it is 39 by 26 of the 540 play area, so 2.17 by 1.44 scale units.
     */
    it('draws the level plaque as a wooden two-lobed sign', () => {
      // Round 7: cut whole out of the client rather than drawn. Everything
      // except the numeral is in the cut, cap and "Lvl" included, because only
      // the numeral changes; round 5 read the cap as the lettering's own
      // keyline and left it out, which came back a third short.
      const plaque = styles.slice(styles.indexOf('.anim-pet-level {'));
      // Round 8: the plaque is one ripped sprite drawn whole, LevelMap_0/1/2,
      // so there is nothing to compose and nothing to keyline.
      expect(stageTemplate).toContain('levelPlaque(pet.pet.level)');
      const art = styles.slice(styles.indexOf('.anim-pet-level-art {'));
      expect(art.slice(0, 200)).toContain('width: 100%');
      expect(plaque).toMatch(/width:\s*2\.57em/);
      expect(styles).not.toContain("fill='%23a06a24'");
      // Round 8: the numeral is part of the sprite, so there is no numeral rule
      // left to colour; what used to be typed is now drawn by the client.
      expect(styles).not.toContain('.anim-pet-level-word');
      // The client sets the plaque back over its own team's rear.
      expect(styles).toContain('translateX(-1.25em)');
      expect(styles).toContain('translateX(1.25em)');
      expect(styles).not.toContain('#a1642f');
    });
  });

  describe('fainting and the corpse, items 2 and 10', () => {
    /**
     * Item 2. There is no red cross anywhere in the reference. The corpse
     * whites out and launches: on f01 t=32.01 the pig is washed to white with
     * its keyline intact, and the same frame shows the trail behind it as a
     * chain of fat clouds rather than a wisp.
     */
    it('whites the corpse out instead of stamping a cross on it', () => {
      expect(stageTemplate).not.toContain('anim-pet-cross');
      expect(stageTemplate).not.toContain('&#10006;');
      expect(styles).not.toContain('anim-pet-cross');
      expect(styles).toMatch(/\.anim-corpse \.anim-pet-icon\s*\{[^}]*brightness\(/);
      expect(styles).not.toMatch(/\.anim-corpse\s*\{[^}]*grayscale/);
    });

    /**
     * Round 9. The pet that has just died is *not* washed out: it stands in its
     * own slot in its own colour until the corpse launches. f02's worm is pink
     * again by t=30.16 and stays that way with a health of 0 until 30.84, and
     * f06's otter is brown at -1 for the same beat.
     */
    it('leaves the pet dead in its slot at full colour, not washed out', () => {
      const fainted = styles.match(/\.anim-pet-fainted[^{]*\{[^}]*\}/g) ?? [];
      expect(fainted.every((rule) => !/brightness\(/.test(rule))).toBe(true);
    });

    /**
     * Item 1 of round 9, and the thing Ruihan asked for by name: the lethal hit
     * leaves the body in place under a crossed bandage with its real, possibly
     * negative, health showing, and only then does the corpse launch. The
     * marker is the client's own `Bandage` sprite and it rides the body out
     * (f03 t=33.64, the airborne cow is wearing it).
     */
    it('marks a dead pet with the crossed bandage, in place and in flight', () => {
      const stageSource = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.ts'),
        'utf8',
      );
      expect(stageTemplate).toContain('anim-pet-bandage');
      expect(stageTemplate).toContain('*ngIf="pet.fainted"');
      expect(stageTemplate).toContain('anim-corpse-bandage');
      expect(stageSource).toContain('bandage: `${RIPPED}/fx/bandage.png`');
      // Sized by masking the plaster's tan on both sides with one colour range:
      // 1549 px on f02's worm and 1485 on f10's peacock against our 1955 and
      // 1899, so ours came down 12% on the diagonal to 3.7em.
      const rule = styles.slice(styles.indexOf('.anim-pet-bandage {'));
      expect(rule.slice(0, rule.indexOf('}'))).toMatch(/width:\s*3\.7em/);
      expect(styles).toContain('@keyframes anim-bandage-in');
    });

    /**
     * Round 9, item 3. Round 8 built the trail the right way at half the size,
     * which is why the round 8 critic still read it as thinner than the
     * client's. Measured on f02 t=31.88 at native resolution: the band behind
     * the cow is about 47px thick on a 540 tall play area and is made of lobes
     * about 45px across, so 2.4 to 2.6 of this stage's unit.
     */
    it('sizes the trail lobes off the reference band, not half of it', () => {
      const puff = styles.slice(styles.indexOf('.anim-corpse-puff {'));
      const sizes = [...puff.slice(0, 900).matchAll(/width:\s*([\d.]+)em/g)].map((m) =>
        Number(m[1]),
      );
      expect(sizes.length).toBeGreaterThanOrEqual(5);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2.1);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(2.8);
    });

    /**
     * The slot the body left blooms before the trail reads as a trail: f02
     * t=30.88 and f06 t=30.82 both go bright yellow-white there with a cloud
     * twice a trail link's size in it.
     */
    it('blooms the slot a corpse launched from', () => {
      expect(stageTemplate).toContain('anim-corpse-launch-flash');
      // The rule's own body carries `#{$ripped}`, so it cannot be sliced on the
      // first brace; a fixed window covers it and nothing after it.
      const at = styles.indexOf('.anim-corpse-launch-flash {');
      const body = styles.slice(at, at + 900);
      // `cloud_2x2_hard`'s first cell is the fluffy, lobed cloud the reference
      // leaves in the slot; the soft variant is a smudge at this size.
      expect(body).toContain('fx/cloud-hard.png');
      expect(body).toContain('radial-gradient');
      // `cloud_2x2_soft` is a two by two atlas, so it has to be framed on one
      // cell; centring it drew the seam between four cells as a hard square.
      expect(body).toContain('0 0 / 200% 200%');
    });

    /**
     * The trail belongs to the flight, so a body that stayed in its slot has
     * none: f02 t=30.88 to 31.5 is one cloud in the worm's slot and nothing
     * anywhere else on the field.
     */
    it('draws no trail behind a body that was never thrown', () => {
      const stageSource = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.ts'),
        'utf8',
      );
      const trail = stageSource.slice(stageSource.indexOf('corpseTrail(view: CorpseView)'));
      expect(trail.slice(0, 500)).toContain('if (!view.viaClash)');
      const style = stageSource.slice(stageSource.indexOf('corpseStyle(view: CorpseView)'));
      expect(style.slice(0, 500)).toContain('if (!view.viaClash)');
    });

    it('lays the trail as a chain of clouds rather than one wisp', () => {
      expect(stageTemplate).toContain('anim-corpse-puff');
      expect(stageTemplate).not.toContain('anim-corpse-smoke');
      const puff = styles.slice(styles.indexOf('.anim-corpse-puff {'));
      // Round 7: the same cloud a summon uses, and it is the client's own puff
      // cut out of a reference frame rather than a stack of drawn circles.
      // Round 8: the client's trail is flat, stroke-free grey circles rather
      // than one soft puff texture, measured on the close-up against f11b.
      expect(puff.slice(0, 400)).toContain('border-radius: 50%');
      expect(puff.slice(0, 400)).not.toContain('gradient');
      expect(styles).not.toContain('%3Ccircle ');
      const summonPuff = styles.slice(styles.indexOf('.anim-puff-cloud {'));
      expect(summonPuff.slice(0, 300)).toContain('cloud-soft.png');
    });

    /**
     * The reference corpse keeps the whole card: the plaque is still on it and
     * the health badge already reads -5 on f01 t=32.01. That is checked here
     * because a round-4 note asked for the opposite, and the frame decides.
     */
    it('launches the whole card, negative health and all', () => {
      const corpse = stageTemplate.slice(
        stageTemplate.indexOf('<div class="anim-corpse"'),
        stageTemplate.indexOf('anim-burst'),
      );
      expect(corpse).toContain('anim-pet-level');
      expect(corpse).toContain('anim-pet-stats');
      expect(corpse).toContain('corpse.health');
      expect(corpse).not.toContain('Math.max');
    });

    /**
     * Round 9, item 3. Traced with `harness/path_trace.py`: on f03 the cow runs
     * (52.6%, 61%) to (96%, 26%) of the play area, on f01 the pig runs
     * (43.5%, 66%) to (4%, 26%), so the body covers about 43% of the width
     * against 35% of the height. Rounds 7 and 8 threw it 22 across and 56 up,
     * which is the steep arc the round 8 critic called out.
     */
    it('throws the corpse along the reference arc rather than straight up', () => {
      const stageSource = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.ts'),
        'utf8',
      );
      expect(stageSource).toMatch(/const CORPSE_EXIT_DX = 43;/);
      expect(stageSource).toMatch(/const CORPSE_EXIT_DY = 35;/);
      // Across is linear and up eases off, which is what the trail's own slope
      // does: about 0.9 near the slot and 0.2 near the exit.
      const point = stageSource.slice(stageSource.indexOf('private corpsePoint('));
      expect(point.slice(0, 600)).toContain('Math.pow(1 - Math.min(1, travel), 2)');
    });
  });

  describe('the field, item 3', () => {
    /**
     * The figure at the field's right is the other player's avatar. It is the
     * pack's own `Mascot/TurtleBattle.png`, which matches the reference part
     * for part: cream bucket hat, purple hair, cream shirt, green shorts,
     * turtle shell, green boots.
     */
    it('stands the other player s avatar at the field s right', () => {
      expect(stageTemplate).toContain('class="anim-mascot"');
      expect(stageTemplate).toContain('[src]="mascotSprite"');
      const mascot = styles.slice(styles.indexOf('.anim-mascot {'));
      expect(mascot).toMatch(/left:\s*86%/);
      expect(mascot).toMatch(/bottom:\s*42\.5%/);
      expect(mascot).toMatch(/height:\s*26\.4%/);
    });

    it('names a sprite the pack ships', () => {
      const mascotDir = path.join(
        repoRoot,
        'src/assets/art/Public/Public/Mascot',
      );
      expect(readdirSync(mascotDir)).toContain('TurtleBattle.png');
    });
  });

  describe('the entrance banners, item 12', () => {
    /**
     * One centred row over the near board, not three cards scattered across
     * the forest. On out/f11-jump-african-wild-dog_board.jpg the near plate
     * runs x=186 to 528 of 1280, the VS plate x=598 to 691 and the far plate
     * x=720 to 1187, all on one baseline centred 34.6% down the play area.
     */
    it('lays the two names and the VS plaque out as one adjacent row', () => {
      expect(stageTemplate).toContain('class="anim-intro-row"');
      expect(stageTemplate).toContain('{{ playerBannerName }}');
      expect(stageTemplate).toContain('{{ opponentBannerName }}');
      expect(stageTemplate).not.toContain('>Your team<');
      const row = styles.slice(styles.indexOf('.anim-intro-row {'));
      expect(row).toMatch(/left:\s*50%/);
      expect(row).toMatch(/top:\s*34\.6%/);
      expect(row.slice(0, 400)).toContain('display: flex');
      // Blue near, orange far, black VS, all on white plates with a keyline.
      expect(styles).toMatch(/\.anim-intro-player\s*\{[^}]*color:\s*#23a6e6/);
      expect(styles).toMatch(/\.anim-intro-opponent\s*\{[^}]*color:\s*#f2661f/);
      // Round 7: the VS square is the client's own plate, lettering included,
      // and the two name cards wear the shared nine-slice cut of that same
      // plate rather than each drawing its own white box and keyline.
      const vs = styles.slice(styles.indexOf('.anim-intro-vs {'));
      expect(vs.slice(0, 400)).toContain('plate-vs.png');
      const card = styles.slice(styles.indexOf('.anim-intro-card {'));
      expect(card.slice(0, 400)).toContain('@include game-plate');
      expect(styles.slice(styles.indexOf('@mixin game-plate'), styles.indexOf('@mixin game-plate') + 400)).toContain('plate-name.png');
    });

    it('carries the calculator s own team name through, and falls back', () => {
      expect(shellTemplate).toContain('[playerTeamName]="app.teamName"');
    });
  });

  describe('the control bar, item 13', () => {
    /**
     * Drawn glyphs, not font characters: the reference bar is REWIND as a bar
     * beside a left triangle, PAUSE as two bars, AUTOPLAY as a two-arrow loop,
     * FAST as two right triangles and SKIP as a right triangle beside a bar.
     * The tiles are 39 by 41 of the 540 play area with 20px between them and
     * their top edge 6px below the play area's.
     */
    it('draws every glyph rather than borrowing a font character', () => {
      const bar = stageTemplate.slice(
        stageTemplate.indexOf('<div class="anim-controls"'),
        stageTemplate.indexOf('<!-- entrance'),
      );
      // Round 7: the glyphs are the client's own printing, lifted off its bar,
      // so there is no drawn path and no font character in the row at all.
      expect((bar.match(/class="anim-ctl-glyph/g) ?? []).length).toBe(5);
      expect(bar).not.toContain('<svg');
      expect(bar).not.toMatch(/&#9\d\d\d;/);
      expect(bar).not.toContain('&#65038;');
      expect(styles).not.toContain('font-variant-emoji');
    });

    it('sizes the tiles and the row off the reference bar', () => {
      const tile = styles.slice(styles.indexOf('.anim-ctl {'));
      // Re-measured in round 7 at a 720 play area: 50.0 by 58.7 css with a
      // 4.3 css corner, and no keyline, which the old tile invented.
      expect(tile).toMatch(/width:\s*2\.08em/);
      expect(tile).toMatch(/height:\s*2\.45em/);
      expect(tile).toMatch(/border:\s*none/);
      const bar = styles.slice(styles.indexOf('.anim-controls {'));
      expect(bar).toMatch(/gap:\s*1\.11em/);
      expect(bar).toMatch(/top:\s*1\.1%/);
    });

    it('uses the same tile on the end screen', () => {
      const outro = stageTemplate.slice(stageTemplate.indexOf('anim-outro-actions'));
      expect((outro.match(/class="anim-ctl-glyph/g) ?? []).length).toBe(2);
      expect(outro).toContain('class="anim-ctl anim-outro-action"');
    });
  });

  describe('the end screen veil, items 5 and 17', () => {
    /**
     * Fitted, not picked. Sampled clear of the trophy row so the halos do not
     * lift the reading, the reference end screen's bands come out at sky 23.5,
     * forest 7.7, lane 16.0 and grass 7.3 against a lit 200.3, 94.0, 160.0 and
     * 79.1. A least squares fit through those four pairs gives 0.110 on red,
     * 0.104 on green and 0.099 on blue with no offset, so the veil is plain
     * black at 89.5%: predicted forest 9.9, lane 16.8, grass 8.3, sky 21.0.
     *
     * The old rgb(6 8 11 / 85%) put the forest at 21.2 with more blue in it
     * than red, about 2.7 times too bright and cool with it.
     */
    it('darkens per band to the fitted multiplier, warm-neutral', () => {
      const veil = styles.slice(styles.indexOf('.anim-outro {'));
      expect(veil).toMatch(/background:\s*rgb\(0 0 0 \/ 89\.5%\)/);
      expect(veil).not.toContain('rgb(6 8 11');
      const lit: Record<string, [number, number, number]> = {
        sky: [159.6, 213.5, 227.9],
        forest: [58.8, 135.6, 87.6],
        lane: [234, 192, 54],
        grass: [75.2, 155.1, 7.1],
      };
      const target: Record<string, number> = {
        sky: 23.5,
        forest: 7.7,
        lane: 16.0,
        grass: 7.3,
      };
      const keep = 1 - 0.895;
      for (const band of Object.keys(lit)) {
        const veiled = lit[band].map((channel) => channel * keep);
        const mean = (veiled[0] + veiled[1] + veiled[2]) / 3;
        // Every band lands within three levels of the reference reading.
        expect(Math.abs(mean - target[band])).toBeLessThan(3);
      }
      // And the lane stays warm rather than turning blue, as it does in the
      // reference at (23.0, 20.0, 5.0).
      const lane = lit['lane'].map((channel) => channel * keep);
      expect(lane[0]).toBeGreaterThan(lane[2]);
    });

    /**
     * How long the veil takes, item 5. Sampled on the sky band of
     * clips/outro-victory, which nothing on the end screen covers, the
     * reference leaves 157 at t=53.50 s and settles at 16 by t=54.58 s, and
     * crosses 90% to 10% of that fall between f_01907_0053613 and
     * f_01926_0054246, so 0.633 s. Round 5's linear 0.7 s crossed the same two
     * marks in 0.568 s, a visibly quicker screen. A squared ease-out over 1.0 s
     * crosses them in 0.633 s and takes the same second the reference does end
     * to end.
     */
    it('brings the veil down over a second, quickest at the top of the fall', () => {
      expect(OUTRO_BEATS.dimFadeMs).toBe(1000);
      const timeline = buildBattleTimeline(readGolden('f01-plain-trades'), {
        initialBoard: seedFor('f01-plain-trades'),
      });
      const sampler = new TimelineSampler(timeline);
      const dimAt = (ms: number): number =>
        sampler.frameAt(timeline.battleEndMs + ms).outro?.dim ?? 0;
      expect(dimAt(OUTRO_BEATS.dimMs)).toBe(0);
      expect(dimAt(OUTRO_BEATS.dimMs + OUTRO_BEATS.dimFadeMs)).toBe(1);
      let tenth: number | null = null;
      let ninth: number | null = null;
      for (let ms = 0; ms <= 3000; ms += 1) {
        const dim = dimAt(ms);
        if (tenth === null && dim >= 0.1) {
          tenth = ms;
        }
        if (ninth === null && dim >= 0.9) {
          ninth = ms;
        }
      }
      expect(tenth).not.toBeNull();
      expect(ninth).not.toBeNull();
      const crossing = (ninth as number) - (tenth as number);
      expect(crossing).toBeGreaterThanOrEqual(615);
      expect(crossing).toBeLessThanOrEqual(650);
      // eased, not a straight line: half way through the fade it is already
      // three quarters down, which is what the reference sampling shows.
      expect(dimAt(OUTRO_BEATS.dimMs + OUTRO_BEATS.dimFadeMs / 2)).toBeCloseTo(
        0.75,
        2,
      );
    });

    /** Item 17: the caption's centre is at 0.667 of the play area. */
    it('sets the caption where the reference sets it', () => {
      const face = styles.slice(styles.indexOf('.anim-outro-face {'));
      expect(face).toMatch(/top:\s*66\.7%/);
      const from = styles.indexOf('.anim-outro-caption {');
      const caption = styles.slice(from, styles.indexOf('}', from));
      expect(caption).toMatch(/letter-spacing:\s*0\.05em/);
      // Round 8: measured on the close-up, the client's caption goes straight
      // from white to the veil with no stroke at all.
      expect(caption).toContain('text-shadow: none');
      // The reference caption stands 33px tall and runs 179px wide on a 720
      // play area; at the old 1.45 scale units ours came out 25 by 138.
      expect(caption).toMatch(/font-size:\s*1\.9em/);
    });
  });

  describe('the damage numeral, item 11', () => {
    /**
     * On f01 t=37.39 the two numerals stand 41 and 46px tall on the 540 play
     * area, so 55 to 61 at the 720 the recordings run at, in the game's own
     * face, red with a heavy black outline. The round-4 numeral was 1.9 scale
     * units and outlined in white, which came out at 44.
     *
     * The outline is eight shadows rather than a text stroke: Chrome paints a
     * text stroke centred on the glyph outline, which ate the fill and turned
     * the red muddy brown on the first round-5 recording.
     */
    it('is the game face, red, black-outlined, at the reference size', () => {
      expect(styles).toMatch(/\.anim-stage\s*\{[^}]*font-family:\s*"Lapsus Pro"/);
      const from = styles.indexOf('.anim-popup-damage {');
      const damage = styles.slice(from, styles.indexOf('}', from));
      // Round 9 re-reading, this time by masking pure red on f02's "8" frame by
      // frame instead of by eye: the reference numeral peaks at 3943 px and
      // rests at 765 px, ours rested at 1570, so the resting size comes down
      // 43% on the diagonal and the punch it lands with carries the rest.
      expect(damage).toMatch(/font-size:\s*2\.5em/);
      expect(damage).toMatch(/@include keyline\(0\.05em\)/);
      expect(damage).toContain('#f00');
      expect(damage).not.toContain('#fff');
      expect(styles).not.toContain('-webkit-text-stroke');
      expect(styles).toMatch(/@mixin keyline\(/);
    });
  });

  describe('the outlines, items 9 and 15', () => {
    /**
     * The reference wind-up is a red line hugging the sprite's own silhouette,
     * and a jump attacker hangs over its target inside a green one. Four
     * offset drop shadows off the transparent sprite draw exactly that; an
     * outline on the box drew a circle beside the pet instead.
     */
    it('traces the silhouette rather than ringing the box', () => {
      expect(styles).not.toMatch(/\.anim-pet-(source|hurt|windup) \.anim-pet-art/);
      const ruleAt = (selector: string, last = false): string => {
        const from = last ? styles.lastIndexOf(selector) : styles.indexOf(selector);
        expect(from).toBeGreaterThan(-1);
        return styles.slice(from, styles.indexOf('}', from));
      };
      const windup = ruleAt('.anim-pet-hurt .anim-pet-icon');
      expect((windup.match(/drop-shadow/g) ?? []).length).toBe(4);
      expect(windup).toContain('#ef2222');
      expect(windup).toContain('.anim-pet-windup .anim-pet-icon');
      const source = ruleAt('.anim-pet-source .anim-pet-icon');
      expect((source.match(/drop-shadow/g) ?? []).length).toBe(4);
      expect(source).toContain('#35d34a');
      // A whited out corpse keeps the red line it died wearing.
      const corpse = ruleAt('.anim-corpse .anim-pet-icon {', true);
      expect((corpse.match(/drop-shadow/g) ?? []).length).toBe(4);
      expect(corpse).toContain('brightness(');
    });
  });

  describe('the contact flash, item 9', () => {
    /**
     * The reference contact frame is not a glow floating between two pets that
     * keep their colour: both sprites are painted out in flat white along
     * their own silhouettes, with the red wind-up line still on them
     * (clips/f01-plain-trades/f_00882_0031156.jpg). `brightness(0) invert(1)`
     * over a copy of the sprite is that, and it is the art's own alpha, so the
     * edge is as hard as the art's. A gradient or a blur here would be the
     * soft glow again.
     */
    it('paints the sprite out in white rather than only glowing between them', () => {
      const from = styles.indexOf('.anim-pet-whiteout {');
      expect(from).toBeGreaterThan(-1);
      const rule = styles.slice(from, styles.indexOf('}', from));
      expect(rule).toContain('brightness(0) invert(1)');
      expect(rule).not.toContain('radial-gradient');
      expect(rule).not.toContain('blur(');
      expect(rule).toMatch(/width:\s*4\.7em/);
      expect(stageTemplate).toContain('class="anim-pet-whiteout"');
      expect(stageTemplate).toContain('[style.opacity]="pet.impactFlash"');
      // and the bloom between them still closes the 12% gap contact leaves
      const bloom = styles.slice(
        styles.indexOf('.anim-flash {'),
        styles.indexOf('}', styles.indexOf('.anim-flash {')),
      );
      expect(bloom).toMatch(/width:\s*11em/);
    });
  });

  describe('the ability toast, item 14', () => {
    /**
     * The reference plate runs x=264 to 565 and y=141 to 258 of the 960 by 540
     * play area: 16.7 scale units wide, centred 43.4% across and 31.4% down,
     * with a heavy black keyline and no wrapping name.
     */
    it('is sized and anchored off the reference plate', () => {
      const banner = styles.slice(styles.indexOf('.anim-banner {'));
      expect(banner).toMatch(/width:\s*16\.7em/);
      // Round 7: the same cut plate the entrance names wear, so the two read as
      // one layer, and no drop shadow, which the reference toast does not have.
      expect(banner).toMatch(/@include game-plate/);
      expect(banner).not.toMatch(/box-shadow:\s*0 0\.14em/);
      expect(styles).toMatch(/\.anim-banner-name\s*\{[^}]*white-space:\s*nowrap/);
    });

    it('puts a rock inline for damage rather than a grey blob', () => {
      const stageSource = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.ts'),
        'utf8',
      );
      // Round 7: the inline damage glyph is the pack's own rock sprite, the one
      // the client itself prints in ability text. Nothing in this component is
      // drawn any more, so there is no inline SVG left in it at all.
      expect(stageSource).toContain('fist.png');
      expect(stageSource).not.toContain('<svg');
      expect(stageSource).not.toContain('ROCK_PATH');
    });

    /**
     * Round 9, item 2. Ruihan's note was that the snipe has no throw to it.
     * Three things were wrong and all three are measurements: the object was a
     * fist where the client throws a grey rock (f02 t=29.7 against f10 t=34.4,
     * where the buff is the fist), it was 1.7em where the reference rock is 56
     * to 62px of a 540 tall play area, and the flight was 320ms where the
     * reference is 410.
     */
    /**
     * Round 9, item 4, off the buff close-up. The client sets a white plus and
     * then the stat's own badge with the amount inside it in white, free over
     * the pet (f10 t=34.59). Ours put a black numeral beside a small icon on a
     * white plate, which read as a tooltip.
     */
    it('draws a stat pill as the badge itself, not as a plated tooltip', () => {
      expect(stageTemplate).toContain('anim-popup-chip');
      const rule = styles.slice(styles.indexOf('.anim-popup-stat {'));
      const body = rule.slice(0, rule.indexOf('}'));
      expect(body).not.toContain('game-plate');
      expect(body).toContain('color: #fff');
    });

    it('throws the damage rock, at the size the reference throws it', () => {
      const stageSource = readFileSync(
        path.join(stageDir, 'battle-animation-stage.component.ts'),
        'utf8',
      );
      expect(stageSource).toContain('damage-rock.png');
      expect(stageSource).toMatch(/projectileIcon\(view: ProjectileView\)/);
      expect(stageTemplate).toContain('projectileIcon(projectile)');
      const img = styles.slice(styles.indexOf('.anim-projectile img {'));
      expect(img.slice(0, img.indexOf('}'))).toMatch(/width:\s*3\.3em/);
      // It comes out of the attacker small and grows: 41px at t=29.547 and 56
      // to 62 from 29.639 on.
      expect(stageSource).toMatch(/const scale = 0\.68 \+ 0\.32 \* Math\.min\(1, view\.grow\)/);
    });
  });
});
