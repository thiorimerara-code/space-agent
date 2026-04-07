# Spaces And Widgets

This doc covers the spaces runtime because it is one of the most important agent-facing feature areas.

## Primary Sources

- `app/L0/_all/mod/_core/spaces/AGENTS.md`
- `app/L0/_all/mod/_core/spaces/ext/skills/spaces/SKILL.md`
- `app/L0/_all/mod/_core/spaces/storage.js`
- `app/L0/_all/mod/_core/spaces/store.js`

## Storage Layout

Spaces persist under the authenticated user's `~/spaces/<spaceId>/` root.

Important files:

- `space.yaml`: manifest, metadata, layout, minimized widgets, and timestamps
- `widgets/<widgetId>.yaml`: widget metadata plus the renderer source string
- `data/`: widget-owned structured files
- `assets/`: widget-owned assets fetched through `/~/...`

Important rules:

- new spaces start empty
- widget ids come from widget filenames
- the manifest should not invent fake untitled titles
- widget source is now YAML-first; old `widgets/*.js` files are migration input only

## Runtime Namespaces

`_core/spaces` publishes:

- `space.current`: helpers for the currently open space
- `space.spaces`: helpers for cross-space CRUD and lower-level operations

Frequently used `space.current` helpers:

- `listWidgets()`
- `readWidget(widgetIdOrName)`
- `seeWidget(widgetIdOrName, full?)`
- `patchWidget(widgetId, { ... })`
- `renderWidget({ id, name, cols, rows, renderer })`
- `reloadWidget(widgetId)`
- `removeWidget(...)`, `removeWidgets(...)`, `removeAllWidgets()`
- `rearrange()`, `repairLayout()`, `toggleWidgets(...)`

Frequently used `space.spaces` helpers:

- `listSpaces()`
- `createSpace(...)`
- `openSpace(spaceId, options?)`
- `duplicateSpace(...)`
- `removeSpace(...)`
- `upsertWidget(...)`
- `patchWidget(...)`
- `renderWidget(...)`

## Layout Packing

Rearrange and default new-widget placement share one first-fit packer.

Rules:

- scan cells left to right, then top to bottom
- skip occupied cells immediately
- at each free cell, place the largest remaining widget that physically fits within the viewport-width threshold
- do not skip an obvious free slot just to chase a more compact aspect ratio later
- center the packed result back onto the canvas after placement

## Widget Renderer Contract

Preferred renderer shape:

```js
async (parent, currentSpace) => {
  // render into parent
}
```

Rules:

- render directly into `parent`
- do not add outer wrapper padding just to inset content; the widget shell already provides that space
- the default widget card surface is `#101b2d` (`rgba(16, 27, 45, 0.92)`); avoid another generic full-card background unless the content needs a dedicated stage
- prefer light text and UI elements by default because widget content sits on a dark surface
- use `space.utils.markdown.render(text, parent)` for markdown-heavy content
- return a cleanup function when listeners, timers, or similar long-lived effects are attached
- widget size is capped at `24x24`
- choose only the footprint the widget needs

The framework owns the outer card and the responsive grid. Widgets own only their content.

## Agent Workflow

The spaces runtime is designed around staged turns.

Normal flow:

1. `listWidgets()` if the live catalog is unknown
2. `readWidget(...)` to load the latest numbered renderer readback
3. on the next turn, `patchWidget(...)` for bounded edits or `renderWidget(...)` for a rewrite
4. `reloadWidget(...)` or another read on a later turn if needed

Important protocol rules:

- `readWidget(...)` and `listWidgets()` are discovery steps
- the next dependent mutation should usually happen on the next turn, not in the same execution block
- `readWidget(...)` returns numbered renderer lines for patch targeting
- those numeric prefixes are display-only targets, not source text
- prompt-side readbacks land in `_____framework` or `_____transient`

## When To Read More

- For the overlay execution protocol itself: `agent/prompt-and-execution.md`
- For file path and permission rules: `server/customware-layers-and-paths.md`
