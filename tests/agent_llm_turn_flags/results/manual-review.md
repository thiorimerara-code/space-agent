# Manual Review

## 2026-04-06

- model: `openai/gpt-5.4-mini`
- contract shift:
  - terminal replies now end with the exact `_____terminate` suffix
  - the harness now rejects missing or mixed output markers
- latest saved full matrix:
  - `009_single_block_turn_end`: `15/18`
  - `014_state_guardrails`: `15/18`
  - `011_use_transient_target_directly`: `14/18`
  - `012_open_goal_momentum`: `14/18`
- experimental prompt notes:
  - `017_marker_state_hardline` and `018_literal_marker_examples` improved targeted marker and working-state failures in focused runs
  - neither stayed ahead of the stronger adapted baseline prompts in the final full matrix
- remaining common misses:
  - some prompts still re-call `space.api.userSelfInfo()` after username telemetry is already present
  - some prompts still re-read `~/user.yaml` after fresh file text is already in telemetry
  - some prompts still choose the wrong widget helper after transient state is already sufficient

Manual pass review is still pending before any prompt wording should be treated as promotion-ready.
