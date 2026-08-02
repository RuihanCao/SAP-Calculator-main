/**
 * The battlefield art.
 *
 * The game ships one painted sheet per biome and the fork carries the whole
 * pack, so the stage stands the boards on the real thing rather than on a
 * drawn gradient.
 *
 * The default is the biome the reference replays are actually recorded on.
 * It was identified by measuring the reference frame f01 t=29.36 against the
 * pack: the frame's dirt lane runs from 0.556 to 0.707 of the play area and
 * `FieldBattle.png` is the only sheet whose sky, blue mountains, dark forest
 * band, dirt lane and grass land in that order and in that proportion. A
 * masked whole-frame fit of the sheet against that reference frame returns a
 * best scale of 124.0% of the play area's height anchored at the top, which is
 * the framing the stylesheet uses.
 */
const BACKGROUND_DIR = '/assets/art/Public/Public/Background';

/** The biome the reference replay clips are recorded on. */
export const DEFAULT_BATTLE_BACKGROUND = 'FieldBattle';

/**
 * Every battle sheet in the pack, which is what the random pick draws from.
 * The build sheets are the shop's, not the battle's, so they are not here.
 */
export const BATTLE_BACKGROUNDS: ReadonlyArray<string> = [
  'AboveCloudsBattle',
  'ArcticBattle',
  'AutumnForestBattle',
  'BeachBattle',
  'BridgeBattle',
  'CastleWallBattle',
  'CaveBattle',
  'ChildRoomBattle',
  'ChristmasCabinBattle',
  'ColosseumBattle',
  'CornFieldBattle',
  'CyberSpaceBattle',
  'DesertBattle',
  'DungeonBattle',
  'FarmBattle',
  'FieldBattle',
  'FoodLandBattle',
  'FrontYardBattle',
  'HalloweenStreetBattle',
  'InsideSecretBaseBattle',
  'JungleBattle',
  'LavaCaveBattle',
  'LavaMountainBattle',
  'LunarTempleBattle',
  'MoneyBinBattle',
  'MoonBattle',
  'PagodaBattle',
  'PlaygroundBattle',
  'SavannaBattle',
  'ScaryForestBattle',
  'SchoolHallwayBattle',
  'SewerBattle',
  'SnackBinBattle',
  'SnowBattle',
  'SpaceStationBattle',
  'UnderwaterBattle',
  'UrbanCityBattle',
  'WildWestTownBattle',
  'WinterPineForestBattle',
  'WizardSchoolBattle',
];

/** The url of one sheet, which is what the field's background is set from. */
export const backgroundUrl = (name: string): string =>
  `url('${BACKGROUND_DIR}/${name}.png')`;

/**
 * Which sheet a battle is fought on. The default is the replay's own biome,
 * and the random pick is offered because one calculator run is not one shop
 * run, so there is no biome to inherit and any of them is as true as the next.
 */
export const pickBackground = (
  random: boolean,
  roll: number = Math.random(),
): string => {
  if (!random) {
    return DEFAULT_BATTLE_BACKGROUND;
  }
  const clamped = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 0;
  return BATTLE_BACKGROUNDS[Math.floor(clamped * BATTLE_BACKGROUNDS.length)];
};
