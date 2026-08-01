# STATUS — exp01 fight-animation-parity
Updated: 2026-08-01 (handoff)

## Current
- **Last segment:** W-A restored the calculator's own screen to the original and cut the entrance — inline pane is the legacy renderer unconditionally, `?legacyAnimation=1` and the legacy-view toggle are gone, the fullscreen animation opens on the battle's first frame with the control bar up, and REWIND returns to that frame; evidence in `harness/probe_ui_restore.py` and `harness/probe_ui_baseline_diff.py`.
- **Before that:** rounds 4-6 pixel-standard pass done; event axis 16/16, visual axis aligned (background/facing/letterbox/whiteout/corpse/end screen/controls), ~14 residuals listed — see RESULTS.md; eyeball: delivery artifact https://claude.ai/code/artifact/63558a0d-bc8f-4a29-a8bb-e469b3769cec.
- **Running:** ng serve :4200 on the box (log /root/workspace/worktrees/SAP-Calc-anim01-w2/tmp/w2/ngserve.log); play-web :8765 and sim-server :3001 (unrelated, healthy); harness driver daemon likely parked/dead (restart via harness/README.md if needed); no batch runs, no monitors.
- **Branch/PR:** feature/anim01-w3-ui-restore / PR #4 (draft, depends on #3), on top of feature/anim01-w2-director / PR #3 (draft, depends on #1, #2; merge bottom-up).
- **Next:** 1) task.md Now items. 2) After Ruihan's calls: round 7 residual sweep or close and start the shop-animation line (play-web, SAP-PPO side).
- **Waiting on Ruihan:** end-screen UI timing (ours 0.9s vs reference 2.1s); chrome scope (Replaying pill, hamburger, bottom team strips, yellow face); round-7 residual sweep vs accept; PR merge order go; legacy renderer retirement.

## History
- 2026-08-01: rounds 4-6 pixel pass, delivery v2, game-replication skill written.
- 2026-07-31: W0-W3 done, event axis 16/16 (2-13-16), RESULTS.md created.
- 2026-07-31: plan approved, experiment created.
