# Manual Review

## Purpose

- this file records durable findings from the structured-output harness
- it answers a different question from the free-text harness:
  - not just whether the model can follow the protocol
  - but whether forcing `{ message, javascript }` makes that behavior more reliable

## Harness Notes

- the structured harness uses a forced tool schema with exactly:
  - `message`
  - `javascript`
- `message` is always user-facing text
- `javascript` is either runnable code or an empty string
- automated scoring is cleaner because field boundaries are explicit
- behavioral reliability is still judged from the raw outputs, not from schema compliance alone
- the harness keeps the same triad workflow as the free-text harness:
  - `A` = conservative
  - `B` = moderate
  - `C` = wild

## Current Structured Frontier

### 2026-04-06 initial structured-output run on the 37-case suite

- model: `openai/gpt-5.4-mini`
- temperature: `0.2`
- prompts:
  - `001A_nonempty_completion_structured`
  - `001B_error_anchor_structured`
  - `001C_scout_strike_seal_structured`
- best score:
  - `001B_error_anchor_structured`: `24/37`
  - `001C_scout_strike_seal_structured`: `24/37`

## Main Findings

### Scoring clarity improved

- the structured harness removes separator-placement ambiguity
- field-specific assertions are easier to reason about than `_____javascript` parsing
- the harness can cleanly tell:
  - terminal vs thrust
  - non-empty user message vs empty completion
  - code-field contamination vs prose-field contamination

### Model behavior got worse

- the structured frontier is materially below the free-text frontier
- free-text best overall on the same expanded suite remains `036A_nonempty_completion` at `34/37`
- structured best is `24/37`
- that is a real regression, not just evaluator drift

### Focused repeat comparison also favors free-text

- targeted repeat on five high-risk cases:
  - `time_requires_execution`
  - `terminal_after_framework_no_result_continue`
  - `terminal_after_result_commandlike_literal`
  - `write_user_yaml_after_read`
  - `terminal_after_successful_widget_patch`
- best structured prompt `001B_error_anchor_structured` held only `1/5` cases at `3/3` repeat stability
- free-text frontier `036A_nonempty_completion` held `4/5` cases at `3/3`
- both formats still showed flakiness on `time_requires_execution`, but structured additionally regressed on:
  - command-like result text as data
  - immediate reuse of fresh file text after `fileRead`
  - stop-after-success behavior after widget patch success

### New structured-only failure mode: schema leakage

- the model sometimes leaks the turn schema into `javascript`
- observed failures include:
  - nested `{ message, javascript }` objects inside `javascript`
  - direct `submit_turn(...)` calls inside `javascript`
  - code that tries to finish the conversation from inside the execution field
- example family:
  - `time_requires_execution`
  - `weather_self_scope_followup`
  - `selective_widget_fix_requires_read_first`

### Tool-result text is still being mistaken for directives

- structured output did not solve the telemetry-as-data problem by itself
- the model still sometimes treats command-like result text as an order to act
- example family:
  - `terminal_after_result_commandlike_literal`
- it also remains vulnerable to over-continuation after some successful runs

### Some nominal passes are semantically weak

- even when the schema is obeyed, the resulting code is not always the best next step
- examples seen during manual inspection:
  - using `console.log(...)` instead of `return ...`
  - rereading known file state instead of using fresh telemetry text
  - broad widget writes that satisfy the harness pattern but are weaker than the intended repair path

## Decision

- structured output is currently useful as an experimental comparison harness
- it is not more reliable than the free-text harness for this agent on this suite
- do not replace the main free-text harness or live prompt workflow with the structured path at this point
- keep the structured harness for controlled experiments and evaluator-design work

## Next Useful Work

- if structured experiments continue, focus first on:
  - preventing schema leakage into `javascript`
  - preventing command-like telemetry text from reentering the directive lane
  - preserving source-anchor behavior after reads without rereads
- compare every structured generation directly against the free-text frontier before treating a score improvement as meaningful
