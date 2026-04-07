# File APIs

This doc covers the authenticated app-file endpoint family and the matching frontend helpers.

## Primary Sources

- `server/api/AGENTS.md`
- `server/lib/customware/AGENTS.md`
- `server/lib/customware/file_access.js`
- `app/L0/_all/mod/_core/framework/js/api-client.js`

## File Endpoint Family

Current file endpoints:

- `file_list`
- `file_paths`
- `file_read`
- `file_write`
- `file_delete`
- `file_copy`
- `file_move`
- `file_info`
- `folder_download`

These endpoints should stay thin and delegate to `server/lib/customware/file_access.js`.

## Path Forms

The file APIs accept logical app paths, not raw disk paths.

Common forms:

- `L2/alice/note.txt`
- `/app/L2/alice/note.txt`
- `~/note.txt`
- `~/folder/`

Important rules:

- directories are usually identified with a trailing `/`
- `~` and `~/...` expand to the authenticated user's `L2/<username>/...`
- logical paths do not change when `CUSTOMWARE_PATH` relocates writable storage

## Frontend Helper Surface

`space.api` exposes matching helpers:

- `fileRead(...)`
- `fileWrite(...)`
- `fileDelete(...)`
- `fileInfo(...)`
- `fileCopy(...)`
- `fileMove(...)`
- `fileList(path, recursive?)`
- `folderDownloadUrl(pathOrOptions)`

These helpers accept single-path forms and composed batch forms where appropriate.

## Batch Semantics

Important shared rules:

- batch operations validate all targets before mutation begins
- single-path operations must keep working even when batch-only request fields are omitted
- permission, overlap, path-normalization, and duplication logic belong in `file_access.js`, not endpoint-local code

## `file_paths`

`file_paths` is the pattern-discovery endpoint used by systems such as skill discovery.

Behavior summary:

- accepts path patterns rather than exact file paths
- patterns are normalized before matching
- returns matched logical project paths grouped by the original pattern

It is the right tool for catalog discovery, not for raw filesystem walking.

## Folder Downloads

`folder_download` is special:

- supports `HEAD` for permission-only validation
- supports `GET` and `POST` for the actual ZIP download
- resolves readable folders through the shared permission model
- creates the archive in `server/tmp/`
- streams the attachment instead of buffering the ZIP into browser memory

Frontend code that wants an attachment-style download should prefer:

```js
space.api.folderDownloadUrl(path)
```

instead of manually fetching the blob into browser memory.
