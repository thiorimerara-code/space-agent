# Commands And Runtime Params

This doc covers the CLI entry surface and the runtime-parameter system.

## Primary Sources

- `AGENTS.md`
- `commands/AGENTS.md`
- `space.js`
- `commands/serve.js`
- `commands/params.yaml`
- `server/lib/utils/runtime_params.js`

## CLI Entry

The CLI entry file is `space.js`.

Current behavior:

- dynamically lists `commands/*.js`
- normalizes `--help` -> `help`
- normalizes `--version` -> `version`
- imports the chosen command module dynamically
- expects each command module to export `execute(context)`

Important note:

- `space.js` is still legacy CommonJS
- the rest of the repo prefers ES modules
- treat that CommonJS entry as migration debt, not a pattern to copy

## Current Command Families

Operational commands:

- `serve`
- `help`
- `get`
- `set`
- `version`
- `update`

Runtime-state commands:

- `user`
- `group`

The command tree prefers a small number of readable top-level commands with explicit subcommands instead of many tiny files.

## `serve`

`node space serve` starts the local runtime.

Current override forms:

- `PARAM=VALUE`
- `--host <host>`
- `--port <port>`

Launch-time override precedence is:

1. launch arguments
2. stored `.env` values written by `node space set`
3. process environment variables
4. schema defaults from `commands/params.yaml`

## Runtime Params Schema

The schema lives in `commands/params.yaml`.

Current params:

- `HOST`
- `PORT`
- `CUSTOMWARE_PATH`
- `SINGLE_USER_APP`
- `ALLOW_GUEST_USERS`

Important fields per param:

- `description`
- `type`
- `allowed`
- `default`
- `frontend_exposed`

Only params with `frontend_exposed: true` are injected into page-shell meta tags for the frontend.

## Current High-Value Params

- `CUSTOMWARE_PATH`: parent directory that owns writable `L1/` and `L2/` roots
- `SINGLE_USER_APP`: implicit always-authenticated `user` principal with virtual `_admin` access
- `ALLOW_GUEST_USERS`: enables guest creation from the login screen when password login is enabled

## Practical Reading Order

- Need exact CLI shape or help metadata: `commands/AGENTS.md`
- Need server startup implications: `architecture/overview.md`
- Need writable-layer and permission effects: `server/customware-layers-and-paths.md`
