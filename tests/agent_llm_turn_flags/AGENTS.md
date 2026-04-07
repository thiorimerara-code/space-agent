# AGENTS

## Purpose

`tests/agent_llm_turn_flags/` owns prompt-performance evaluation for the onscreen agent LLM under an explicit turn-end marker protocol

It exists to compare firmware prompt variants against prepared multi-turn histories and score whether the model executes, continues, terminates cleanly, and avoids burdening the human user

## Ownership

This scope owns:

- `config.yaml`: provider model and path config for the harness
- `test.mjs`: CLI runner for single-call and matrix evaluation
- `prompts/*.md`: system-prompt variants under test
- `histories/*.json`: prepared chat histories sent to the model after the system prompt
- `cases/*.json`: deterministic expectations mapped to a prepared history
- `results/leaderboard.yaml`: sorted prompt ranking summary
- `results/latest-run.json`: latest raw run artifact
- `results/manual-review.md`: human review notes for nominal passes and promotion decisions

## Local Contracts

- prompt files are standalone system prompts and are ranked by filename id plus saved results, not by hidden script state
- history files are prepared chat message arrays and exclude the system prompt
- case files point at one history and define deterministic response-shape assertions
- `test.mjs` must support direct one-off calls with `--system <file> --history <file>`, one-prompt runs with `--prompt-id <id>`, focused prompt-case runs with `--prompt-id <id> --case-id <id>`, and config-driven matrix runs with no arguments
- the harness must load `OPENROUTER_API_KEY` from process env or the repo root `.env`
- the harness must call OpenRouter with `openai/gpt-5.4-mini` by default from `config.yaml`
- the harness temperature must stay explicit in `config.yaml`; current evaluations run at `0.2`
- the harness retry policy must stay explicit in `config.yaml`; current parallel runs use request retries with backoff instead of aborting the whole matrix on the first transport miss
- the harness must not execute assistant `_____javascript`; it only evaluates assistant outputs against case criteria
- every evaluated assistant reply must include exactly one turn marker: `_____javascript` for execution turns or `_____terminate` for terminal turns
- marker tokens must be matched exactly as written, including all five leading underscores
- terminal-style replies must end with the exact `_____terminate` suffix
- thrust-style cases should require syntactically valid javascript after `_____javascript` when the agent is expected to execute
- matrix runs must execute cases in parallel for each prompt unless concurrency is intentionally capped by config or CLI
- results must stay resumable: the latest raw run and the sorted leaderboard should be written to disk after matrix runs
- matrix runs should capture per-case request errors as failed case results so the run artifact remains inspectable
- automated pass is not final validation; nominal passes must still be manually reviewed before promoting a prompt into the live firmware prompt
- when prompt wording, case assertions, or scoring rules change, update this doc and regenerate results in the same session

## Development Guidance

- prefer adding new failures as prepared histories and assertions before changing scoring code
- keep case assertions aimed at behavior class, continuation logic, target reuse, and stop conditions rather than exact domain phrasing
- avoid overfitting the suite to one domain; keep a mix of live facts, widget edits, file edits, and recovery cases
- keep assertions simple enough to audit without another model
- use exact literals only when the literal itself is the contract-critical value from the history, not as a shortcut for judging the whole behavior
- add new prompt variants as new markdown files instead of overwriting previous variants
- rerun promising variants after harness changes or important prompt edits because one lucky matrix run is not enough
- inspect raw outputs for nominal passes; a prompt can satisfy a shallow case while still pursuing the wrong subgoal
- when a prompt variant wins, sync the proven changes back into the live onscreen firmware prompt deliberately rather than implicitly, and only after manual review agrees with the automated score
