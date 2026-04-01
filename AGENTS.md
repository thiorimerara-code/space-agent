# AGENTS

## Goal

Build an AI agent that runs almost entirely in the web browser.

The browser app is the primary runtime. The Node.js server exists only as thin infrastructure for:

- outbound fetch proxying to avoid CORS limitations
- ownership of the SQLite persistence file and related integrity-safe operations

## Current Top-Level Structure

- `A1.js`: root CLI router
- `commands/`: CLI command modules such as `serve`, `help`, `version`, `update`
- `server/`: thin local server plus shared server-side infrastructure libraries used by browser-only, packaged native, and CLI-side infra flows
- `app/`: layered browser runtime layout
- `packaging/`: native app hosts, packaging scripts, shared packaging resources, and per-platform packaging metadata

## Layered Browser Model

The browser app is being organized into layers:

- `app/L0/`: firmware layer
  This is the currently active browser runtime. It contains the shell, pages, runtime bootstrap, fetch proxy client code, chat UI, and test suite.
- `app/L1/`: system layer
  Reserved for admin-managed shared files and data. Not active yet.
- `app/L2/`: user layer
  Reserved for user-specific files and data. Not active yet.

Default rule: browser first, server last.

## Server Responsibilities

Keep the server narrow. It should handle:

### 1. Fetch Proxy

- accept browser requests that would otherwise fail because of CORS
- forward requests upstream with minimal transformation
- return upstream status, relevant headers, and body
- remain infrastructure, not application orchestration

### 2. Persistence Layer

- own direct access to the SQLite database file
- expose small explicit APIs for reads, writes, migrations, and integrity-safe operations
- prevent direct browser access to the database file

### 3. API Module Host

- load simple endpoint modules from `server/api/`
- allow modules to return plain JS values for easy JSON APIs
- also allow modules to return explicit HTTP-style response objects for advanced responses such as streams

## Browser Responsibilities

The browser should own:

- agent orchestration and runtime logic
- prompt construction
- tool flow
- state management
- user interaction and optimistic UX
- synchronization with server persistence APIs

## CLI

The supported CLI surface is:

- `node A1.js serve`
- `node A1.js update`
- `node A1.js help`
- `node A1.js --help`
- `node A1.js version`
- `node A1.js --version`

Command modules live in `commands/` and export:

- `execute(context)`
- `help`

## Current Non-Goals

- heavy server-side business logic
- server-side agent execution by default
- distributed infrastructure
- microservices
- broad generic API surfaces without a clear browser need

## Guidance

- keep as much agent logic in the browser as possible
- treat the server as infrastructure
- prefer explicit, small contracts between browser and server
- prefer maintainable filesystem structure over clever routing shortcuts
- when changing architecture, update the relevant `AGENTS.md` files alongside the code
