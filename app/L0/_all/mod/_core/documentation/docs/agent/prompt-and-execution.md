# Prompt And Execution

This doc focuses on how the onscreen agent builds model input and how execution results are fed back into history.

## Primary Sources

- `app/L0/_all/mod/_core/onscreen_agent/AGENTS.md`
- `app/L0/_all/mod/_core/onscreen_agent/prompts/AGENTS.md`
- `app/L0/_all/mod/_core/onscreen_agent/llm.js`
- `app/L0/_all/mod/_core/onscreen_agent/execution.js`
- `app/L0/_all/mod/_core/onscreen_agent/api.js`

## Prepared Prompt Order

The prepared prompt order is:

```txt
system -> examples -> compacted history summary (when present) -> live history -> transient
```

Important details:

- example messages are ordinary alternating user/assistant messages inserted before live history
- example messages count toward token totals but are never replaced by compaction
- transient runtime context is emitted as its own trailing prepared message when present

## Message Markers

Prepared user-role messages use explicit wrappers:

- `_____user`: real human submission
- `_____framework`: framework-generated follow-up such as execution output
- `_____transient`: trailing mutable runtime context

These markers matter for prompt inspection, execution flows, and staged widget workflows.

## Skill Injection

Prompt construction includes two skill-related sections:

- the top-level skill catalog built from readable `mod/*/*/ext/skills/*/SKILL.md` files
- the `auto loaded` block for readable skills anywhere under `ext/skills/**/SKILL.md` whose frontmatter sets `metadata.always_loaded: true`

Top-level skill catalog rows use the compact shape:

```txt
skill-id|name|description
```

## Execution Protocol

The agent runs browser-side JavaScript through the execution loop.

Important execution rules:

- execution blocks should be preceded by one short narration line
- `_____javascript` must appear on its own line
- execution output is fed back as `_____framework`
- if an execution block returns no result and prints no logs, the transcript says `execution returned no result and no console logs were printed`
- multiline results are labeled with `result↓`
- structured results should prefer YAML over JSON when the shared serializer can express them cleanly

## Failure And Retry Behavior

- if a model turn returns no assistant content, the runtime retries the same request once automatically
- only after that retry does it emit a generic protocol-correction user message
- no-result execution output is informational only and should not trigger a synthetic correction message by itself

## Prompt Extension Seams

Feature modules should extend the agent through owner-module seams, not by patching the base prompt blindly.

Important extension families:

- system prompt sections
- example message builders
- history message builders
- transient section builders
- final prompt-input assembly
- execution-plan validation hooks

Module-specific workflow policy belongs in owner-module skills or owner-module `_core/onscreen_agent/...` JS hooks.
