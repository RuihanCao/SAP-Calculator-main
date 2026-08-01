import { AnimationSide } from 'app/domain/interfaces/animation-event.interface';

/**
 * Which way a pet looks.
 *
 * Two measurements decide this, and both are taken off the ground truth rather
 * than off a guess about how the art was drawn.
 *
 * 1. The pack draws every pet looking left.
 *    In `assets/art/Public/Public/Pets/Duck.png` the yellow beak's centroid is
 *    at x=62 while the body's centroid is at x=122, and in `Swan.png` the beak
 *    is at x=40 against a body at x=111, so the head is on the left in the
 *    source art.
 * 2. The real game turns the near board around so the two teams look at
 *    each other.
 *    In the reference frame f01 t=29.36
 *    (`clips/f01-plain-trades/f_00829_0029361.jpg`) the player board's duck has
 *    its beak at x=49 against a body at x=38, and the swan's beak is at x=62
 *    against a body at x=47, so both heads are on the right. On the opponent
 *    board of the same frame the cow and the otter correlate better against the
 *    art as drawn than against its mirror, so that side is left untouched.
 *
 * The rule is the board, never the species, so it holds for a pet standing
 * still, lunging, jumping, flying off as a corpse and arriving as a summon.
 */
export const SPRITE_SHEET_FACING: 'left' | 'right' = 'left';

/** The direction the near board faces in the reference frames. */
export const PLAYER_BOARD_FACING: 'left' | 'right' = 'right';

/** The direction the far board faces in the reference frames. */
export const OPPONENT_BOARD_FACING: 'left' | 'right' = 'left';

export const boardFacing = (side: AnimationSide): 'left' | 'right' =>
  side === 'player' ? PLAYER_BOARD_FACING : OPPONENT_BOARD_FACING;

/** True when the art has to be flipped for this board to face the enemy. */
export const mirrorsSprite = (side: AnimationSide): boolean =>
  boardFacing(side) !== SPRITE_SHEET_FACING;

/**
 * The transform a pet's art wears, which is the only place the flip is
 * applied, so every drawing of a pet inherits the same rule.
 */
export const facingTransform = (side: AnimationSide): string =>
  mirrorsSprite(side) ? 'scaleX(-1)' : 'none';
