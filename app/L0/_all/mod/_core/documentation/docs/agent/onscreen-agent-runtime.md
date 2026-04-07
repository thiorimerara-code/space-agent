# Onscreen Agent Runtime

This doc covers the floating routed overlay agent as a frontend runtime surface.

## Primary Sources

- `app/L0/_all/mod/_core/onscreen_agent/AGENTS.md`
- `app/L0/_all/mod/_core/onscreen_agent/prompts/AGENTS.md`
- `app/L0/_all/mod/_core/onscreen_agent/store.js`
- `app/L0/_all/mod/_core/onscreen_agent/llm.js`
- `app/L0/_all/mod/_core/onscreen_agent/execution.js`
- `app/L0/_all/mod/_core/onscreen_agent/skills.js`

## What The Module Owns

`_core/onscreen_agent/` owns:

- the routed overlay adapter in the router overlay seam
- the floating shell UI and compact bubble UI
- chat history and overlay config persistence
- prompt assembly and prompt history previews
- attachment handling
- the execution loop and streamed execution cards
- onscreen skill discovery and `space.skills.load(...)`

## Persistence

Current persisted files:

- config: `~/conf/onscreen-agent.yaml`
- history: `~/hist/onscreen-agent.json`

Important config fields:

- provider endpoint and model params
- `max_tokens`
- optional `custom_system_prompt`
- `agent_x`, `agent_y`
- optional `history_height`
- `display_mode`

Current defaults:

- endpoint: `https://openrouter.ai/api/v1/chat/completions`
- model: `openai/gpt-5.4-mini`
- params: `temperature: 0.2`
- max tokens: `64000`
- display mode: `compact`

## Runtime Surface

The overlay publishes `space.onscreenAgent`.

That namespace is the stable external entry point for:

- showing or hiding the overlay
- triggering prompt submission from outside the module

The active chat surface also publishes the current prompt/history snapshot on `space.chat`.

## UI Ownership

Key files:

- `panel.html`: overlay DOM shell
- `onscreen-agent.css`: shell, floating window, compact bubble, and overlay-local styling
- `response-markdown.css`: markdown presentation for assistant responses
- `view.js`: thread rendering wiring
- `store.js`: display mode, drag, resize, send loop, queued follow-ups, and scroll behavior

The routed overlay anchors in `_core/router` are the supported place for floating routed UI. The overlay should not be hardwired directly into the router shell.

The settings and prompt-history dialogs reuse the shared `_core/visual/forms/dialog.css` shell layout. Their header and footer rows stay fixed while only the settings body or prompt-history frame scrolls, so the footer actions remain reachable even when the content is long.

## Prompt Files

Prompt file ownership is split:

- `prompts/system-prompt.md`: firmware prompt for normal turns
- `prompts/compact-prompt.md`: user-triggered history compaction
- `prompts/compact-prompt-auto.md`: automatic history compaction

The current live firmware prompt was promoted from `tests/agent_llm_performance/prompts/069A_handoff_no_copy.md` on `2026-04-07` after the `070` through `075` sweep confirmed it was still the best overall prompt on the 57-case suite.

Read `agent/prompt-and-execution.md` next for the actual prompt assembly and execution protocol.
