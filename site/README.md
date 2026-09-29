# Chesscoop

A minimal cooperative chess app. Sign in, create a group, share its invite link, and play the white pieces together against Stockfish.

## Run locally

Requires Node 22.13 or later.

```sh
npm ci
npm run dev
```

Open the address printed by the server. Local sign-in uses the starter's development identity; production sign-in uses ChatGPT. The local database has already been initialized in this checkout.

For a fresh checkout, initialize storage before the first run:

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sharp_forgotten_one.sql
npm run dev
```

## Behavior

- Any group member can move the white pieces; the host starts and finishes games.
- Stockfish 19 Lite runs in a browser worker with UCI strength limiting, from 1320 to 2400 Elo. This is the engine's target strength, not a guaranteed human rating.
- Rooms, memberships and game PGNs are stored in D1. Clients synchronize every 1.8 seconds.
- Server-side legal-move checks and conditional version updates prevent simultaneous moves from overwriting each other.
- A room invite is a bearer invitation. Signed-in users who possess it can join.
- Promotions currently default to queen.
- Stockfish runs while at least one group member has the board open. A pending bot turn resumes when the board is reopened.
- The hosted Site starts owner-private. Sharing access must be enabled in Sites before friends can use hosted invite links.

## Checks

```sh
npx tsc --noEmit
npm run build
node tests/integration.mjs
```

The integration test expects the local dev server on port 5173. It creates a test-only room in the local database and covers authentication, Elo limits, legal moves, simultaneous writes, turn enforcement, persistence, and ending a game.

Browser visual QA and WebMCP runtime validation were unavailable in the authoring environment. A read-only WebMCP tool is feature-detected when supported.

## Stockfish license

The unmodified Stockfish.js 19 Lite engine is distributed under GPL-3.0; see `public/engine/COPYING.txt`. Corresponding source and build instructions: https://github.com/nmrugg/stockfish.js/tree/v19.0.0 . Engine binaries originate from the locked `stockfish` npm dependency.
