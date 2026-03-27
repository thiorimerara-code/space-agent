# AGENTS

## Purpose

`packaging/scripts/` contains native packaging scripts and shared build helpers.

## Current State

- `desktop-builder.js`: shared Electron packaging runner
- `package-host.js`: package for the current desktop host platform
- `package-macos.js`: package the desktop app for macOS
- `package-linux.js`: package the desktop app for Linux
- `package-windows.js`: package the desktop app for Windows

## Guidance

- keep wrappers thin and push shared logic into `desktop-builder.js`
- prefer Node-based automation over shell-specific packaging scripts
- load Electron and electron-builder from `packaging/package.json`
- keep this directory ready for future mobile packaging entrypoints
