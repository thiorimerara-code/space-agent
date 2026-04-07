# AGENTS

## Purpose

`tests/agent_llm_performance_structured/` owns a structured-output variant of the onscreen-agent prompt harness

It exists to test whether schema-constrained `message` plus `javascript` output is more reliable than the free-text separator format

## Ownership

This scope owns:

- `config.yaml`: provider model and path config for the structured harness
- `test.mjs`: CLI runner for schema-based prompt evaluation
- `prompts/*.md`: structured-output system-prompt variants under test
- `histories/*.json`: prepared chat histories sent to the model after the system prompt
- `cases/*.json`: deterministic expectations mapped to a prepared history
- `results/history/*/`: archived structured-harness generation snapshots
- `results/leaderboard.yaml`: sorted structured-harness ranking summary
- `results/latest-run.json`: latest raw structured-harness run artifact
- `results/progress.md`: short human-readable structured-harness status page
- `results/summary.md`: short top-level structured-harness ranking page
- `results/manual-review.md`: human review notes for structured-output runs
- `case-coverage.md`: mirrored problem-family map for the structured suite

## Local Contracts

- this harness must call the model with a structured-output schema containing exactly two fields:
  - `message`
  - `javascript`
- `message` is always the user-visible text for the turn
- `javascript` is the runnable execution body when the loop should continue, otherwise an empty string
- if `javascript` is non-empty, the response is a thrust turn and the harness must validate the javascript
- if `javascript` is empty, the response is a terminal turn and the loop ends
- the harness must parse the model response as structured data first, not as free text with an execution separator
- prompt files here should explicitly teach the model the structured `message` plus `javascript` contract instead of the old `_____javascript` separator format
- case files here should express expectations against `message`, `javascript`, or `combined` text, not against raw separator placement
- `combined` expectations are allowed when a behavior matters across both fields, but prefer field-specific expectations when possible
- prompts under test should usually be created as triads:
  - `NNNA_*` = conservative changes
  - `NNNB_*` = middle changes
  - `NNNC_*` = wild changes
- triad spread remains strict:
  - `A` = surgical structured adaptation of the current best logic
  - `B` = meaningful conceptual experiment within the structured format
  - `C` = genuinely fresh structured-control redesign
- the harness must load `OPENROUTER_API_KEY` from process env or the repo root `.env`
- the harness must call OpenRouter with `openai/gpt-5.4-mini` by default from `config.yaml`
- matrix runs must execute prompt triads in parallel and cases in parallel unless concurrency is intentionally capped
- results must stay resumable with updated `latest-run`, `leaderboard`, `progress`, and `summary` files after full matrix runs
- automated pass is not final validation; manual review is required before claiming the structured format is more reliable
- when scoring rules change, rerun the active generation and update this doc in the same session

## Development Guidance

- keep this harness comparable to the free-text harness: reuse the same histories and problem families unless the structured format itself requires a different fixture
- do not silently change the underlying behavioral target while changing the output format
- when a case becomes easier or harder because of the structured schema, inspect the raw `message` and `javascript` manually before treating the score as meaningful
- prefer field-specific assertions for high-risk cases like empty terminal outputs, accidental re-execution, and separator-format confusion
- use this harness to judge whether structured output reduces evaluator ambiguity, not just whether it changes scores
- compare structured generations against the free-text frontier on the same active case set before calling the structured path an improvement
- treat schema leakage as a first-class failure mode:
  - nested `{ message, javascript }` objects inside `javascript`
  - references to `submit_turn` inside `javascript`
  - code that tries to finish the turn from inside `javascript`
- no-result success telemetry is a key structured-risk family because the model may confuse telemetry text with continuation orders even when the schema is obeyed
- manual review must answer two separate questions:
  - did the schema make scoring cleaner
  - did the schema make the model behavior more reliable
- do not assume those answers are the same
