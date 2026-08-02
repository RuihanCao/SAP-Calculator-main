import { Log } from 'app/domain/interfaces/log.interface';
import { AnimationSide } from 'app/domain/interfaces/animation-event.interface';
import { isAilmentEquipmentName } from 'app/integrations/equipment/equipment-categories';
import {
  AnimationBoardPet,
  AnimationBoardState,
  emptyBoard,
} from './board-state';

/**
 * The board the event stream starts from.
 *
 * The stream never states it, so it is read off the battle's first board log,
 * which is the engine's own snapshot of both starting boards. Ids follow the
 * recorder's seeding, 1..5 for the player and 11..15 for the opponent by slot,
 * so every ref in the stream lands on the pet seeded here.
 */

const SIDE_TOKEN =
  /___ \(-\/-\)|(?:[PO]\d+\s+)?(?:<img\b[^>]*>\s*)*\(\d+\/\d+(?:\/\d+(?:\s*xp)?)?(?:\/\d+(?:\s*mana)?)?\)/gi;
const IMAGE_TAG = /<img\b[^>]*>/gi;

const readAttr = (tag: string, attr: string): string | null => {
  const doubleQuoted = new RegExp(`${attr}="([^"]*)"`, 'i').exec(tag);
  if (doubleQuoted) {
    return doubleQuoted[1];
  }
  const singleQuoted = new RegExp(`${attr}='([^']*)'`, 'i').exec(tag);
  return singleQuoted ? singleQuoted[1] : null;
};

const levelFromExp = (exp: number | null): number => {
  if (exp == null) {
    return 1;
  }
  if (exp >= 5) {
    return 3;
  }
  return exp >= 2 ? 2 : 1;
};

interface SeedToken {
  slot: number;
  name: string;
  attack: number;
  health: number;
  exp: number | null;
  mana: number | null;
  equipment: string | null;
}

const parseToken = (token: string): SeedToken | null => {
  const trimmed = token.trim();
  if (trimmed === '___ (-/-)') {
    return null;
  }
  const labelMatch = /\b([PO])([1-5])\b/.exec(trimmed);
  const statsMatch =
    /\((\d+)\/(\d+)(?:\/(\d+)(?:\s*xp)?)?(?:\/(\d+)(?:\s*mana)?)?\)/i.exec(trimmed);
  if (!labelMatch || !statsMatch) {
    return null;
  }

  let name: string | null = null;
  let equipment: string | null = null;
  for (const tag of trimmed.match(IMAGE_TAG) ?? []) {
    const alt = readAttr(tag, 'alt');
    const classes = (readAttr(tag, 'class') ?? '').split(/\s+/g);
    if (classes.includes('log-pet-icon') || (!name && !classes.includes('log-inline-icon'))) {
      name = alt ?? name;
      continue;
    }
    equipment = alt ?? equipment;
  }
  if (!name) {
    return null;
  }

  return {
    slot: Number(labelMatch[2]) - 1,
    name,
    attack: Number(statsMatch[1]),
    health: Number(statsMatch[2]),
    exp: statsMatch[3] != null ? Number(statsMatch[3]) : null,
    mana: statsMatch[4] != null ? Number(statsMatch[4]) : null,
    equipment,
  };
};

const parseSide = (
  raw: string,
  side: AnimationSide,
  idBase: number,
): AnimationBoardPet[] => {
  const pets: AnimationBoardPet[] = [];
  for (const token of raw.match(SIDE_TOKEN) ?? []) {
    const parsed = parseToken(token);
    if (!parsed) {
      continue;
    }
    pets.push({
      id: idBase + parsed.slot,
      name: parsed.name,
      side,
      index: parsed.slot,
      level: levelFromExp(parsed.exp),
      attack: parsed.attack,
      health: parsed.health,
      mana: parsed.mana,
      exp: parsed.exp,
      equipment: parsed.equipment,
      // An ailment and a food perk live in different art directories, and the
      // board log only carries the name, so the kind is decided here from the
      // catalogue. Hardcoding `false` sent every ailment a pet was already
      // wearing at the first bell to `Food/<name>.png`, which is the broken
      // Tasty icon.
      equipmentIsAilment: isAilmentEquipmentName(parsed.equipment),
      fainted: false,
    });
  }
  pets.sort((a, b) => a.index - b.index);
  return pets;
};

export const parseSeedBoardMessage = (
  message: string,
): AnimationBoardState | null => {
  if (!message || !message.includes('|')) {
    return null;
  }
  const [playerRaw, opponentRaw] = message.split('|');
  if (playerRaw == null || opponentRaw == null) {
    return null;
  }
  const board = emptyBoard();
  board.player = parseSide(playerRaw, 'player', 1);
  board.opponent = parseSide(opponentRaw, 'opponent', 11);
  if (board.player.length === 0 && board.opponent.length === 0) {
    return null;
  }
  return board;
};

export const buildSeedBoardFromLogs = (
  logs: ReadonlyArray<Log | { type?: string; message?: string | null }>,
): AnimationBoardState | null => {
  for (const log of logs ?? []) {
    if (!log || log.type !== 'board') {
      continue;
    }
    const board = parseSeedBoardMessage(log.message ?? '');
    if (board) {
      return board;
    }
  }
  return null;
};
