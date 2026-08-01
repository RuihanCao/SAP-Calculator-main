# exp01: fight animation parity with the real game (frozen 2026-07-31)

## Goal

Make the fight animation play the same event sequence as the real game replay for the same battle.
Ground truth is the real client animating an injected battle (two boards + Seed via /api/battle/get interception).
Target is event and action parity, not pixel or art parity.

## Why (recon findings)

The current animation re-parses English log prose with ~2000 lines of regex because simulation.worker.ts strips sourcePet/targetPet/player from logs.
move events are never emitted, summon/transform are keyword-sniffed, merged logs collapse N hits into 1 frame, and simultaneous attacks render as two sequential frames.
Timing is a hard-coded setTimeout table with a x2 fudge, with no projectiles, no jump arcs, no trigger badges.

## Constraint

The real client re-simulates from Seed with its own RNG, so random battles can diverge from our sim.
All parity fixtures are deterministic battles (verify with isBattleDeterministic), Turtle-pack pets only (pack fallback hazard).
If the real game and our sim disagree on WHAT happens in a deterministic fixture, that is an engine divergence: flag to Ruihan, do not silently patch the engine.

## Waves

W0 ground truth harness (this branch).
Playwright on the VPS: page.route fulfill on /api/battle/get/* (fallback: port of the extension page_hook), drive the real game to the watch flow, record each fixture via CDP screencast to clips + filmstrips.
8-10 deterministic fixtures covering: plain trades, snipe/ranged, faint trigger chain, summon, transform, jump attack, push-forward after faints, equipment, toy.
Deliverables: harness committed here, reference clips, a behavior parity checklist drafted from the clips, filmstrip artifact page.
Exit: Ruihan approves clips + checklist + W1/W2 fine specs (checkpoint).

W1 structured event stream.
Emit typed AnimationEvents centrally from log.service createLog metadata (do not touch 598 ability sites), stop stripping in the worker, dump events from the headless CLI.
Exit: golden event-stream tests for fixtures, full vitest green, codex contract review.

W2 animation director rebuild.
Consume events: single clash frame for simultaneous attacks, per-hit granularity, FLIP push-forward keyed by pet identity, phase staging, summon/transform from events, snipe projectiles source to target, jump arcs, trigger badges, animation-driven timing (kill the dual tables and the x2).
Exit: checklist behaviors visible in calculator recordings, vitest green.

W3 critic parity loop.
Side-by-side filmstrips real vs calculator per fixture, independent Opus critic judges event parity per checklist, diffs feed fixes, max 3 rounds.
Exit: all fixtures event-sequence parity PASS, final gallery artifact (final checkpoint).

## Out of scope

RNG parity for random battles.
Pixel-identical art or easing of the real game.
Engine simulation correctness fixes.
Sounds (stretch only).

## Conventions

Draft PRs against master, one per wave, no stacking bases.
Node deps on the box via corepack yarn1 + /dev/shm staging (npm hangs).
ng serve on box :4200, tunneled to the VPS for calculator-side recording.

## Amendment 2026-07-31 (Ruihan review of W0)

Coverage axis is the event-class vocabulary of the current implementation (the applyLogMutation switch), not per-pet mechanisms.
W0b closes footage gaps per event class (jump attack, trumpets, mana change, xp change), records the speed-up mode grammar as its own section, records the battle intro and victory/defeat screens, and documents the replay controls: stop, skip, rewind, speed.
Replay navigation for the harness: bottom goto to pick a turn, then the double-swords button enters the battle animation.
Tutorial popups from guest onboarding are excluded from parity.
W2 additionally implements the full control set (play, stop, skip, rewind, speed with its own grammar) and wraps the battle with the intro and end screens behind the animation button.
Prose-parsing replacement rationale (checked on a question from Ruihan): the text parsing exists because the worker boundary strips class instances, not because of gh-pages deployment; plain-data events cross the same boundary fine.
The old text-parsing path stays behind a fallback flag until W3 parity passes, then gets deleted.
Scope split confirmed: this repo does battle animation only; shop animation is a separate play-web (SAP-PPO) line.

## Amendment 2026-07-31 (Ruihan review of the live app, round 4)

The animation opens fullscreen from one press and plays itself, it stands on the pack's own background art with a random field option, both boards face each other as the reference frames have them, and the end screen drops the trophy and heart rows for REWIND and EXIT, all recorded in CHECKLIST.md under App integration overrides.
