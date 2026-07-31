import {
  AnimationEvent,
  AnimationPetRef,
  AnimationSide,
} from 'app/domain/interfaces/animation-event.interface';

/**
 * The board as the animation draws it, rebuilt from the event stream alone.
 *
 * Stats are carried forward by applying each event's own delta rather than by
 * trusting the snapshot inside a pet ref: refs are taken at emit time, so the
 * two halves of one clash disagree about the health of the pet that is being
 * hit twice in that same beat. Deltas are what the popups show, so deltas are
 * what the board has to agree with.
 */
export interface AnimationBoardPet {
  id: number;
  name: string;
  side: AnimationSide;
  /** Slot 0..4, front to back. */
  index: number;
  level: number;
  attack: number;
  health: number;
  mana: number | null;
  exp: number | null;
  equipment: string | null;
  equipmentIsAilment: boolean;
  /** Dead in place: crossed out sprite, still in its slot (checklist 3). */
  fainted: boolean;
}

export interface AnimationBoardState {
  player: AnimationBoardPet[];
  opponent: AnimationBoardPet[];
  trumpets: Record<AnimationSide, number>;
  /** Level plaques grow a progress bar once any xp is in play (checklist 14). */
  xpInPlay: boolean;
}

export const emptyBoard = (): AnimationBoardState => ({
  player: [],
  opponent: [],
  trumpets: { player: 0, opponent: 0 },
  xpInPlay: false,
});

export const cloneBoard = (board: AnimationBoardState): AnimationBoardState => ({
  player: board.player.map((pet) => ({ ...pet })),
  opponent: board.opponent.map((pet) => ({ ...pet })),
  trumpets: { ...board.trumpets },
  xpInPlay: board.xpInPlay,
});

export const boardSide = (
  board: AnimationBoardState,
  side: AnimationSide,
): AnimationBoardPet[] => (side === 'player' ? board.player : board.opponent);

export const findPet = (
  board: AnimationBoardState,
  id: number,
): AnimationBoardPet | null =>
  board.player.find((pet) => pet.id === id) ??
  board.opponent.find((pet) => pet.id === id) ??
  null;

export const allPets = (board: AnimationBoardState): AnimationBoardPet[] => [
  ...board.player,
  ...board.opponent,
];

const sortByIndex = (pets: AnimationBoardPet[]): void => {
  pets.sort((a, b) => a.index - b.index);
};

const petFromRef = (ref: AnimationPetRef): AnimationBoardPet => ({
  id: ref.id,
  name: ref.name,
  side: ref.side,
  index: ref.index,
  level: ref.level,
  attack: ref.attack,
  health: ref.health,
  mana: null,
  exp: null,
  equipment: null,
  equipmentIsAilment: false,
  fainted: false,
});

/** Keeps the identity fields a ref is always right about. */
const refreshIdentity = (pet: AnimationBoardPet, ref: AnimationPetRef): void => {
  pet.name = ref.name;
  pet.level = ref.level;
};

const insertAt = (
  pets: AnimationBoardPet[],
  pet: AnimationBoardPet,
  index: number,
): void => {
  const clamped = Math.min(Math.max(0, index), 4);
  for (const other of pets) {
    if (other.index >= clamped) {
      other.index += 1;
    }
  }
  pet.index = clamped;
  pets.push(pet);
  sortByIndex(pets);
};

const removePet = (board: AnimationBoardState, id: number): void => {
  for (const side of ['player', 'opponent'] as const) {
    const pets = boardSide(board, side);
    const at = pets.findIndex((pet) => pet.id === id);
    if (at !== -1) {
      pets.splice(at, 1);
    }
  }
};

const damage = (
  board: AnimationBoardState,
  ref: AnimationPetRef,
  amount: number,
): void => {
  const pet = findPet(board, ref.id);
  if (!pet) {
    return;
  }
  pet.health -= amount;
};

/**
 * Applies one event to the board.
 *
 * Mutates in place; the director snapshots around the call, so a step keeps the
 * board as it stood before and after its own commit.
 */
export const applyEventToBoard = (
  board: AnimationBoardState,
  event: AnimationEvent,
): void => {
  switch (event.type) {
    case 'clash': {
      for (const hit of event.hits) {
        damage(board, hit.target, hit.blocked ? 0 : hit.damage);
      }
      break;
    }
    case 'hit': {
      damage(board, event.target, event.blocked ? 0 : event.damage);
      break;
    }
    case 'statChange': {
      if (event.kind === 'trumpet-gain' || event.kind === 'trumpet-spend') {
        const total = event.total;
        board.trumpets[event.side] =
          total != null
            ? total
            : Math.max(0, board.trumpets[event.side] + event.amount);
        break;
      }
      const target = event.target ? findPet(board, event.target.id) : null;
      if (!target) {
        break;
      }
      if (event.kind === 'attack') {
        target.attack += event.amount;
      } else if (event.kind === 'health') {
        target.health += event.amount;
      } else if (event.kind === 'mana') {
        target.mana = (target.mana ?? 0) + event.amount;
      } else if (event.kind === 'exp') {
        board.xpInPlay = true;
        target.exp = (target.exp ?? 0) + event.amount;
        // A level-up is one gold burst rather than two stat pills, so the
        // stats it carried arrive on this event and nowhere else: without them
        // the pet's pills stay on its old numbers while its damage numeral is
        // already using the new attack (checklist 14).
        target.attack += event.levelAttack ?? 0;
        target.health += event.levelHealth ?? 0;
        if (event.levelTo != null) {
          target.level = event.levelTo;
        }
      }
      break;
    }
    case 'statCopy': {
      const target = findPet(board, event.target.id);
      if (target) {
        target.attack = event.attack;
        target.health = event.health;
      }
      break;
    }
    case 'faint': {
      const pet = findPet(board, event.pet.id);
      if (pet) {
        pet.fainted = true;
      }
      break;
    }
    case 'corpseLaunchGroup': {
      for (const ref of event.pets) {
        removePet(board, ref.id);
      }
      break;
    }
    case 'pushForward': {
      for (const move of event.moves) {
        const pet = findPet(board, move.pet.id);
        if (pet) {
          pet.index = move.to;
        }
      }
      sortByIndex(boardSide(board, event.side));
      break;
    }
    case 'move': {
      const pet = findPet(board, event.pet.id);
      if (pet) {
        pet.index = event.to;
      }
      for (const displaced of event.displaced) {
        const other = findPet(board, displaced.pet.id);
        if (other) {
          other.index = displaced.to;
        }
      }
      sortByIndex(boardSide(board, event.side));
      break;
    }
    case 'summon': {
      const existing = findPet(board, event.pet.id);
      if (existing) {
        refreshIdentity(existing, event.pet);
        break;
      }
      insertAt(boardSide(board, event.side), petFromRef(event.pet), event.index);
      break;
    }
    case 'transform': {
      const pets = boardSide(board, event.side);
      const at = pets.findIndex((pet) => pet.id === event.from.id);
      const replacement = petFromRef(event.to);
      if (at === -1) {
        insertAt(pets, replacement, event.index);
        break;
      }
      replacement.index = pets[at].index;
      replacement.mana = pets[at].mana;
      replacement.exp = pets[at].exp;
      replacement.equipment = pets[at].equipment;
      replacement.equipmentIsAilment = pets[at].equipmentIsAilment;
      pets[at] = replacement;
      break;
    }
    case 'equipmentGain': {
      const pet = findPet(board, event.pet.id);
      if (pet) {
        pet.equipment = event.equipment;
        pet.equipmentIsAilment = event.ailment;
      }
      break;
    }
    case 'equipmentBreak': {
      const pet = findPet(board, event.pet.id);
      if (pet && pet.equipment === event.equipment) {
        pet.equipment = null;
        pet.equipmentIsAilment = false;
      }
      break;
    }
    default:
      break;
  }
};

/**
 * Seeds the board the stream starts from.
 *
 * Ids match the recorder's own seeding, which numbers the starting boards
 * 1..5 for the player and 11..15 for the opponent by slot, so a seed built here
 * lines up with every ref the stream carries.
 */
export interface AnimationSeedPet {
  name: string;
  attack: number;
  health: number;
  level?: number;
  exp?: number | null;
  mana?: number | null;
  equipment?: string | null;
  equipmentIsAilment?: boolean;
}

export const buildSeedBoard = (
  playerPets: ReadonlyArray<AnimationSeedPet | null>,
  opponentPets: ReadonlyArray<AnimationSeedPet | null>,
): AnimationBoardState => {
  const board = emptyBoard();
  const seedSide = (
    pets: ReadonlyArray<AnimationSeedPet | null>,
    side: AnimationSide,
    base: number,
  ): void => {
    pets.forEach((seed, slot) => {
      if (!seed) {
        return;
      }
      boardSide(board, side).push({
        id: base + slot,
        name: seed.name,
        side,
        index: slot,
        level: seed.level ?? 1,
        attack: seed.attack,
        health: seed.health,
        mana: seed.mana ?? null,
        exp: seed.exp ?? null,
        equipment: seed.equipment ?? null,
        equipmentIsAilment: seed.equipmentIsAilment ?? false,
        fainted: false,
      });
    });
    sortByIndex(boardSide(board, side));
  };
  seedSide(playerPets, 'player', 1);
  seedSide(opponentPets, 'opponent', 11);
  return board;
};
