# AGENTS

## Purpose

`packaging/` contains native app hosts and the packaging surface around them.

## Current State

`packaging/desktop/` holds the current Electron desktop host.

`packaging/package.json` holds packaging-only dependencies so the root install can stay lean.

`packaging/scripts/` holds packaging entrypoints and shared build helpers.

`packaging/resources/` holds shared packaging resources.

`packaging/platforms/` holds OS-specific packaging assets and metadata.

Native hosts should remain thin:

- start the local server runtime
- open the browser app inside the host surface
- preserve platform-neutral behavior here when possible

## Guidance

- avoid moving app logic into native hosts
- keep packaging automation in `packaging/scripts/`
- keep platform-specific packaging details in `packaging/platforms/`
- add future mobile-specific hosts alongside `packaging/desktop/`
