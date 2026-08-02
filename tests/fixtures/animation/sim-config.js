/**
 * Fixture spec -> fork SimulationConfig.
 *
 * Fixture pet arrays are written FRONT-TO-BACK (index 0 is the pet that
 * attacks first). The calculator's own PetConfig arrays use the same
 * convention, so no reordering is needed here. build_payload.py is the side
 * that has to translate into the game's Poi coordinates.
 */
function toPetConfig(p) {
  if (!p) return null;
  const cfg = { name: p.pet, attack: p.attack, health: p.health };
  if (p.level && p.level > 1) cfg.exp = p.level === 3 ? 5 : 2;
  if (p.perk) cfg.equipment = { name: p.perk };
  return cfg;
}

function pad5(list) {
  const out = (list || []).map(toPetConfig);
  while (out.length < 5) out.push(null);
  return out.slice(0, 5);
}

function buildSimConfig(fixture) {
  return {
    playerPack: fixture.playerPack || 'Turtle',
    opponentPack: fixture.opponentPack || 'Turtle',
    turn: fixture.turn || 11,
    playerToy: fixture.playerToy || null,
    playerToyLevel: fixture.playerToyLevel || 1,
    opponentToy: fixture.opponentToy || null,
    opponentToyLevel: fixture.opponentToyLevel || 1,
    playerPets: pad5(fixture.player),
    opponentPets: pad5(fixture.opponent),
    allPets: true,
    simulationCount: 1,
    logsEnabled: true,
    maxLoggedBattles: 1,
  };
}

module.exports = { buildSimConfig, toPetConfig, pad5 };
