# Documentation System

This repo has two documentation layers on purpose.

## The Two Layers

`AGENTS.md` files:

- are the binding contract layer
- define ownership, stable seams, update obligations, and implementation boundaries
- are hierarchical, with deeper `AGENTS.md` files overriding broader ones inside their subtree

The documentation module at `app/L0/_all/mod/_core/documentation/`:

- is the narrative orientation layer for the onscreen agent
- summarizes architecture, workflows, and helper surfaces in browsable markdown files
- is entered through the `documentation` skill and then read on demand through `/mod/_core/documentation/documentation.js`

## Source Of Truth Order

When working:

1. treat the user request as the immediate task contract
2. treat the closest relevant `AGENTS.md` files as the stable repo contract
3. use these docs to orient quickly and find the right area
4. inspect code for exact implementation details

If this module and an `AGENTS.md` file disagree, the `AGENTS.md` file wins and this module must be updated.

## Helper Surface

The documentation helper lives at `/mod/_core/documentation/documentation.js`.

Stable exports:

- `read("relative/path.md")` reads a nested doc such as `server/api/files.md`
- `url("relative/path.md")` builds the resolved `/mod/...` URL for a doc file

The top-level onscreen skill is `documentation`, and that skill carries the compact docs index directly in its body.

## Update Rules

When a stable contract or workflow changes:

- update the owning `AGENTS.md` file
- update parent `AGENTS.md` files when the broader boundary changed
- update the relevant docs in this module
- update `ext/skills/documentation/SKILL.md` if you add, remove, rename, or repurpose docs

What does not belong here:

- transient scratch notes
- user-specific task plans
- hidden prompt text
- policy that is not already grounded in source docs or code

## Practical Reading Pattern

- start with the `documentation` skill's built-in index
- read one focused doc
- jump to the owning `AGENTS.md`
- then inspect code

This keeps context small while still preserving accuracy.
