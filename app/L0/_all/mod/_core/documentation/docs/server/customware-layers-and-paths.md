# Customware Layers And Paths

This doc covers the layered filesystem model behind `/mod/...` and the app-file APIs.

## Primary Sources

- `server/lib/customware/AGENTS.md`
- `server/lib/customware/layout.js`
- `server/lib/customware/file_access.js`
- `server/lib/customware/module_inheritance.js`
- `server/lib/customware/extension_overrides.js`
- `server/lib/customware/layer_limit.js`

## Logical Versus Disk Paths

The system works with logical app paths first.

Important logical forms:

- `/app/L0/...`
- `/app/L1/...`
- `/app/L2/...`
- `/mod/<author>/<repo>/...`
- `~/...`

Resolution rules:

- `/app/L0/...` always maps into repo `app/L0/...`
- `/app/L1/...` and `/app/L2/...` map into `CUSTOMWARE_PATH/L1/...` and `CUSTOMWARE_PATH/L2/...` when `CUSTOMWARE_PATH` is configured
- otherwise writable paths map into repo `app/L1/...` and `app/L2/...`
- `~/...` expands to the authenticated user's `L2/<username>/...`

## Permission Model

Core rules:

- nobody writes `L0`
- users can read their own `L2`
- users can read group roots they belong to
- users can write their own `L2`
- users can write `L1/<group>` only when they manage that group
- `_admin` members may write any `L1` or `L2` path

`file_access.js` is the canonical owner of these checks.

## Group Graph

`group.yaml` is the canonical input for group membership and management.

Current fields:

- `included_users`
- `included_groups`
- `managing_users`
- `managing_groups`

`group_index.js` derives the readable and manageable graph from those files.

## Override Order

High-level override order:

1. `L0/_all`
2. accessible `L0/<group>/...`
3. `L1/_all`
4. accessible `L1/<group>/...`
5. `L2/<username>`

Resolution rules:

- exact same override keys replace lower-ranked entries
- different extension filenames under one extension point compose together
- `module_inheritance.js` owns `/mod/...` resolution
- `extension_overrides.js` owns extension lookup resolution

## `maxLayer`

`maxLayer` limits module and extension lookup, not normal app-file APIs.

Examples:

- default app pages allow `L0 -> L1 -> L2`
- `/admin` effectively clamps lookup to `L0`

`layer_limit.js` owns the normalization and request-level resolution logic.

## Why This Matters To The Agent

This model explains why:

- a stable `/mod/...` import may resolve to different backing files for different users
- docs and skills can be delivered by normal modules
- direct app-file reads and writes use logical layer paths even when writable storage is moved outside the repo
