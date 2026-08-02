import { Player } from 'app/domain/entities/player.class';
import { Battle } from 'app/domain/interfaces/battle.interface';
import { LogService } from 'app/integrations/log.service';
import { GameService } from 'app/runtime/state/game.service';
import { AbilityService } from 'app/integrations/ability/ability.service';
import { AbilityEngine } from './ability-engine';

export interface EventProcessorContext {
  player: Player;
  opponent: Player;
  logService: LogService;
  gameService: GameService;
  abilityService: AbilityService;
  abilityEngine: AbilityEngine;
  maxTurns: number;
  getBattle: () => Battle | null;
  setBattle: (battle: Battle | null) => void;
  getBattleStarted: () => boolean;
  setBattleStarted: (value: boolean) => void;
  getTurns: () => number;
  setTurns: (value: number) => void;
  incrementPlayerWinner: () => void;
  incrementOpponentWinner: () => void;
  incrementDraw: () => void;
}

export class EventProcessor {
  constructor(private ctx: EventProcessorContext) {}

  executeBattleLoop() {
    while (this.ctx.getBattleStarted()) {
      this.nextTurn();
    }
  }

  startBattle() {
    this.reset();
    this.ctx.setBattleStarted(true);
    this.ctx.setTurns(0);
  }

  reset() {
    this.ctx.player.resetPets();
    this.ctx.opponent.resetPets();
  }

  nextTurn() {
    let finished = false;
    let winner: Player | null = null;
    this.ctx.setTurns(this.ctx.getTurns() + 1);

    let playerAlive = this.ctx.player.alive();
    let opponentAlive = this.ctx.opponent.alive();

    if (playerAlive && !opponentAlive) {
      const revived = this.tryAllEnemiesFaintedToyTrigger(
        this.ctx.player,
        this.ctx.opponent,
      );
      opponentAlive = this.ctx.opponent.alive();
      if (!revived) {
        winner = this.ctx.player;
        const battle = this.ctx.getBattle();
        if (battle) {
          battle.winner = 'player';
        }
        this.ctx.incrementPlayerWinner();
        finished = true;
      }
    }
    if (!playerAlive && opponentAlive) {
      const revived = this.tryAllEnemiesFaintedToyTrigger(
        this.ctx.opponent,
        this.ctx.player,
      );
      playerAlive = this.ctx.player.alive();
      if (!revived) {
        winner = this.ctx.opponent;
        const battle = this.ctx.getBattle();
        if (battle) {
          battle.winner = 'opponent';
        }
        this.ctx.incrementOpponentWinner();
        finished = true;
      }
    }
    if (!playerAlive && !opponentAlive) {
      this.ctx.incrementDraw();
      finished = true;
    }
    if (finished) {
      this.ctx.logService.printState(this.ctx.player, this.ctx.opponent);
      this.endLog(winner);
      this.ctx.setBattleStarted(false);
      return;
    }

    if (this.ctx.getTurns() >= this.ctx.maxTurns) {
      this.ctx.incrementDraw();
      finished = true;
    }

    if (finished) {
      this.ctx.logService.printState(this.ctx.player, this.ctx.opponent);
      this.endLog(winner);
      this.ctx.setBattleStarted(false);
      return;
    }

    this.ctx.logService.animation.recordPhase('turn', this.ctx.getTurns());
    this.pushPetsForwards();
    this.ctx.logService.printState(this.ctx.player, this.ctx.opponent);

    while (true) {
      let originalPlayerAttackingPet = this.ctx.player.pet0;
      let originalOpponentAttackingPet = this.ctx.opponent.pet0;

      if (this.ctx.player.pet0) {
        this.ctx.abilityService.triggerBeforeAttackEvent(this.ctx.player.pet0);
      }
      if (this.ctx.opponent.pet0) {
        this.ctx.abilityService.triggerBeforeAttackEvent(
          this.ctx.opponent.pet0,
        );
      }
      this.ctx.abilityService.executeBeforeAttackEvents();

      this.ctx.abilityEngine.checkPetsAlive();
      do {
        this.ctx.abilityEngine.abilityCycle();
      } while (this.ctx.abilityService.hasAbilityCycleEvents);

      if (!this.ctx.player.alive() || !this.ctx.opponent.alive()) {
        return;
      }

      this.pushPetsForwards();

      if (
        originalPlayerAttackingPet &&
        originalPlayerAttackingPet.transformed
      ) {
        originalPlayerAttackingPet =
          originalPlayerAttackingPet.transformedInto ??
          originalPlayerAttackingPet;
      }
      if (
        originalOpponentAttackingPet &&
        originalOpponentAttackingPet.transformed
      ) {
        originalOpponentAttackingPet =
          originalOpponentAttackingPet.transformedInto ??
          originalOpponentAttackingPet;
      }

      if (
        this.ctx.player.pet0 == originalPlayerAttackingPet &&
        this.ctx.opponent.pet0 == originalOpponentAttackingPet
      ) {
        break;
      }
    }

    this.ctx.player.resetJumpedFlags();
    this.ctx.opponent.resetJumpedFlags();

    this.fight();
    this.ctx.abilityEngine.checkPetsAlive();

    do {
      this.ctx.abilityEngine.abilityCycle();
    } while (this.ctx.abilityService.hasAbilityCycleEvents);
  }

  fight() {
    const playerPet = this.ctx.player.pet0;
    const opponentPet = this.ctx.opponent.pet0;
    if (!playerPet || !opponentPet) {
      return;
    }

    // Both front pets trade in one beat, so the two hits are one clash event
    // rather than two sequential frames (checklist 1).
    this.ctx.logService.animation.beginClash();
    try {
      playerPet.attackPet(opponentPet);
      opponentPet.attackPet(playerPet);
    } finally {
      this.ctx.logService.animation.endClash();
    }

    playerPet.useAttackDefenseEquipment();
    opponentPet.useAttackDefenseEquipment();

    this.ctx.gameService.gameApi.FirstNonJumpAttackHappened = true;
    this.ctx.abilityService.executeAfterAttackEvents();
    this.ctx.abilityEngine.checkPetsAlive();
  }

  pushPetsForwards() {
    this.ctx.player.pushPetsForward();
    this.ctx.opponent.pushPetsForward();
  }

  endLog(winner?: Player | null) {
    let message;
    let outcome: 'player' | 'opponent' | 'draw';
    if (winner == null) {
      message = 'Draw';
      outcome = 'draw';
    } else if (winner == this.ctx.player) {
      message = 'Player is the winner';
      outcome = 'player';
    } else {
      message = 'Opponent is the winner';
      outcome = 'opponent';
    }
    this.ctx.logService.animation.recordOutcome(outcome);
    this.ctx.logService.createLog({
      message: message,
      type: 'board',
    });
    this.ctx.logService.endAnimationCapture();
  }

  private tryAllEnemiesFaintedToyTrigger(
    winner: Player,
    loser: Player,
  ): boolean {
    const activeToys = [winner.toy, winner.hardToy].filter(
      (toy) => toy?.allEnemiesFainted != null,
    );
    if (activeToys.length === 0) {
      return false;
    }
    for (const toy of activeToys) {
      if (!toy) {
        continue;
      }
      // This is the one toy trigger the toy event queues never see, so its
      // banner is opened here rather than in the queue wrapper.
      this.ctx.logService.animation.beginToyAbility({
        toy,
        board: winner,
        trigger: 'AllEnemiesFainted',
      });
      try {
        toy.allEnemiesFainted?.(this.ctx.gameService.gameApi);
      } finally {
        this.ctx.logService.animation.endAbility();
      }
    }
    return loser.alive();
  }
}





