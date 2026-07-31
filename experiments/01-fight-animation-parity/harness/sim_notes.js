#!/usr/bin/env node
/**
 * Run a fixture through the fork's headless simulation and print:
 *   - a three-part determinism verdict
 *   - the battle log line by line (the expected event sequence)
 *
 * Determinism verdict
 *   randomDecisions   the runner's own `captureRandomDecisions` hook lists every
 *                     point where the engine consulted the RNG. Zero entries
 *                     means the battle never branched on randomness.
 *   randomEventLogs   logs the engine itself tagged randomEvent / 'true-random'.
 *   stableOver25Runs  25 independent unseeded runs must agree on winner AND on
 *                     the full log text.
 * A fixture is usable as a parity fixture only when all three are clean. This
 * is strictly stronger than the static isBattleDeterministic name rule, which
 * only inspects pet/equipment/toy names and is not exported from the bundle.
 *
 * Usage: node sim_notes.js <fixture.json> [--json]
 * The bundle in simulation/dist is committed, so no install is needed.
 */
const fs = require('fs');
const path = require('path');

const REPO = process.env.SAP_CALC_REPO || path.resolve(__dirname, '../../..');
const sim = require(path.join(REPO, 'simulation/dist/index.js'));
const { buildSimConfig } = require('./sim_config.js');

function runOnce(cfg, capture) {
  const r = sim.runHeadlessSimulation(
    {
      ...cfg,
      simulationCount: 1,
      logsEnabled: true,
      maxLoggedBattles: 1,
      captureRandomDecisions: Boolean(capture),
    },
    { enableLogs: true, includeBattles: true },
  );
  const b = (r.battles || [])[0];
  return {
    winner: b ? b.winner : null,
    logs: b ? b.logs : [],
    randomDecisions: r.randomDecisions || [],
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const fixturePath = args.find((a) => !a.startsWith('--'));
  if (!fixturePath) {
    console.error('usage: sim_notes.js <fixture.json> [--json]');
    process.exit(2);
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const cfg = buildSimConfig(fixture);

  const first = runOnce(cfg, true);
  const lines = first.logs.map((l) => `${l.type}\t${l.message}`);
  const randomEventLogs = first.logs
    .filter((l) => l.randomEvent || l.randomEventReason === 'true-random')
    .map((l) => `${l.randomEventReason || 'randomEvent'}: ${l.message}`);

  // Distinguish real nondeterminism from pure log-ordering ambiguity: if the
  // winner and the SORTED log lines never change, the only thing that varies is
  // the order in which the engine wrote two simultaneous events, which the real
  // game shows as one simultaneous step anyway.
  const sortedKey = [...lines].sort().join('\n');
  let logTextStable = true;
  let logMultisetStable = true;
  let winnerStable = true;
  let firstDiff = null;
  for (let i = 0; i < 24; i++) {
    const r = runOnce(cfg, false);
    const l2 = r.logs.map((x) => `${x.type}\t${x.message}`);
    if (r.winner !== first.winner) winnerStable = false;
    if (l2.join('\n') !== lines.join('\n') && logTextStable) {
      logTextStable = false;
      firstDiff = { run: i + 2, winner: r.winner, lines: l2 };
    }
    if ([...l2].sort().join('\n') !== sortedKey) logMultisetStable = false;
  }
  const stable = logTextStable && winnerStable;

  const out = {
    id: fixture.id,
    title: fixture.title,
    covers: fixture.covers,
    randomDecisionCount: first.randomDecisions.length,
    randomDecisions: first.randomDecisions.map((d) => d.label || d.key),
    randomEventLogs,
    stableOver25Runs: stable,
    winnerStable,
    logMultisetStable,
    firstDiff,
    deterministic:
      first.randomDecisions.length === 0 && randomEventLogs.length === 0 && stable,
    // Usable as a parity fixture: nothing about WHAT happens varies, only the
    // order two simultaneous log lines were written in.
    orderOnlyAmbiguity:
      !stable && winnerStable && logMultisetStable && randomEventLogs.length === 0,
    winner: first.winner,
    events: lines,
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`# ${out.id} - ${out.title}`);
  console.log(`covers: ${(out.covers || []).join(', ')}`);
  console.log(
    `deterministic=${out.deterministic} randomDecisions=${out.randomDecisionCount} ` +
      `randomEventLogs=${out.randomEventLogs.length} stableOver25Runs=${out.stableOver25Runs} ` +
      `orderOnlyAmbiguity=${out.orderOnlyAmbiguity} winner=${out.winner}`,
  );
  if (out.randomDecisions.length) console.log('randomDecisions:', out.randomDecisions.join(' | '));
  if (out.randomEventLogs.length) console.log('randomEventLogs:', out.randomEventLogs.join(' | '));
  console.log('--- expected event sequence (fork sim) ---');
  out.events.forEach((l, i) => console.log(String(i).padStart(3, '0'), l));
}

main();
