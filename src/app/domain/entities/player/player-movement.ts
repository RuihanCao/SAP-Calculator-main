import { clone } from 'lodash-es';
import { Pet } from '../pet.class';
import type { Player } from '../player.class';
import { LogService } from 'app/integrations/log.service';
import { AbilityService } from 'app/integrations/ability/ability.service';
import { Onion } from 'app/domain/entities/catalog/equipment/golden/onion.class';
import type { PlayerLike } from './player-like.types';
import { AnimationMove } from 'app/domain/interfaces/animation-event.interface';

const MAX_PET_SLOT = 4;

const setSlotDirect = (
  player: PlayerLike,
  index: number,
  value?: Pet,
): void => {
  switch (index) {
    case 0:
      player.pet0 = value;
      break;
    case 1:
      player.pet1 = value;
      break;
    case 2:
      player.pet2 = value;
      break;
    case 3:
      player.pet3 = value;
      break;
    case 4:
      player.pet4 = value;
      break;
  }
};

const trySetPet = (player: PlayerLike, index: number, value?: Pet): void => {
  try {
    player.setPet(index, value);
  } catch {
    setSlotDirect(player, index, undefined);
  }
};

const findClosestEmptyAhead = (
  player: PlayerLike,
  slot: number,
): number | null => {
  for (let index = slot - 1; index >= 0; index--) {
    if (player.getPet(index) == null) {
      return index;
    }
  }
  return null;
};

const findClosestEmptyBehind = (
  player: PlayerLike,
  slot: number,
): number | null => {
  for (let index = slot + 1; index <= MAX_PET_SLOT; index++) {
    if (player.getPet(index) == null) {
      return index;
    }
  }
  return null;
};


/** Slot of every pet currently on the board, for animation diffing only. */
const capturePositions = (player: PlayerLike): Map<Pet, number> => {
  const positions = new Map<Pet, number>();
  for (let index = 0; index <= MAX_PET_SLOT; index++) {
    const pet = player.getPet(index);
    if (pet) {
      positions.set(pet, index);
    }
  }
  return positions;
};

const diffPositions = (
  player: PlayerLike,
  before: Map<Pet, number>,
  exclude?: Pet,
): AnimationMove[] => {
  const moves: AnimationMove[] = [];
  for (let index = 0; index <= MAX_PET_SLOT; index++) {
    const pet = player.getPet(index);
    if (!pet || pet === exclude) {
      continue;
    }
    const from = before.get(pet);
    if (from != null && from !== index) {
      const ref = player.animation.petRef(pet);
      if (ref) {
        moves.push({ pet: ref, from, to: index });
      }
    }
  }
  return moves;
};

export const pushPetsForward = (player: PlayerLike): void => {
  const array = clone(player.petArray);
  const before = capturePositions(player);
  for (let index = 0; index <= MAX_PET_SLOT; index++) {
    trySetPet(player, index, array[index]);
  }
  player.animation.recordPushForward(
    player.isOpponent ? 'opponent' : 'player',
    diffPositions(player, before),
  );
};

export const onionCheck = (player: PlayerLike): void => {
  if (player.pet0?.equipment == null) {
    return;
  }
  if (player.pet0.equipment instanceof Onion) {
    player.pet0.equipment.callback(player.pet0);
    pushPetsForward(player);
  }
};

export const pushForwardFromSlot = (player: PlayerLike, slot: number): boolean => {
  const slotWithSpace = findClosestEmptyAhead(player, slot);
  if (slotWithSpace == null) {
    return false;
  }

  for (let i = slotWithSpace; i < slot; i++) {
    setSlotDirect(player, i, player.getPet(i + 1));
  }
  return true;
};

export const pushBackwardFromSlot = (player: PlayerLike, slot: number): boolean => {
  const slotWithSpace = findClosestEmptyBehind(player, slot);
  if (slotWithSpace == null) {
    return false;
  }

  for (let i = slotWithSpace; i > slot; i--) {
    setSlotDirect(player, i, player.getPet(i - 1));
  }
  return true;
};

export const makeRoomForSlot = (player: PlayerLike, slot: number): void => {
  if (player.petArray.length === 5) {
    console.warn('No room to Make Room');
    return;
  }
  if (pushForwardFromSlot(player, slot)) {
    return;
  }
  pushBackwardFromSlot(player, slot);
};

export const pushPet = (
  player: PlayerLike,
  pet: Pet,
  spaces: number = 1,
  jump: boolean | undefined,
  logService: LogService,
  abilityService: AbilityService,
): void => {
  if (pet?.equipment?.name === 'Brussels Sprout') {
    logService.createLog({
      message: `${pet.name} blocked being pushed. (Brussels Sprout)`,
      type: 'equipment',
      player: pet.parent,
    });
    pet.removePerk();
    return;
  }

  const position = pet.position;
  const before = capturePositions(player);
  setSlotDirect(pet.parent, position, undefined);
  let destination;
  if (spaces > 0) {
    destination = Math.max(position - spaces, 0);
    if (player.getPet(destination) != null) {
      if (!pushForwardFromSlot(player, destination)) {
        pushBackwardFromSlot(player, destination);
      }
    }
    player.setPet(destination, pet);
  }
  if (spaces < 0) {
    destination = Math.min(position - spaces, MAX_PET_SLOT);
    if (player.getPet(destination) != null) {
      if (!pushBackwardFromSlot(player, destination)) {
        pushForwardFromSlot(player, destination);
      }
    }
    player.setPet(destination, pet);
  }

  player.animation.recordMove({
    pet,
    from: position,
    to: pet.position,
    displaced: diffPositions(player, before, pet),
  });

  if (jump) {
    pet.jumped = true;
    abilityService.triggerJumpEvents(pet);
  } else {
    abilityService.triggerPushedEvents(pet);
  }

  if (player.pet0 == null) {
    abilityService.triggerEmptyFrontSpaceEvents(player as Player);
    abilityService.executeEmptyFrontSpaceEvents();
    abilityService.triggerEmptyFrontSpaceToyEvents(player as Player);
    abilityService.executeEmptyFrontSpaceToyEvents();
  } else {
    for (const teammate of player.petArray) {
      teammate.clearFrontTriggered = false;
    }
  }
};

export const pushPetToFront = (
  player: PlayerLike,
  pet: Pet,
  jump: boolean | undefined,
  logService: LogService,
  abilityService: AbilityService,
): void => {
  pushPet(player, pet, 4, jump, logService, abilityService);
};

export const pushPetToBack = (
  player: PlayerLike,
  pet: Pet,
  logService: LogService,
  abilityService: AbilityService,
): void => {
  pushPet(player, pet, -4, false, logService, abilityService);
};




