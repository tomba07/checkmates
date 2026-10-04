# Checkmates

Minimal cooperative chess: create a group, invite friends, and play together against Maia 3. Pick 500–2400 Elo before each game. Each player can join one active game; leaving transfers hosting or finishes the game when the last player leaves.

## Development
Requires Node.js 24+.

    npm ci
    cp .env.example .env.local
    npm run dev

Fill in the server-side auth and email settings first. Local app: http://127.0.0.1:5180.
SQLite defaults to .data/checkmates.sqlite. Startup applies pending migrations.

## Authentication
Email/password sign-up, email verification, and password reset use Better Auth. Password reset revokes existing sessions. Resend delivers transactional emails; all secrets are server-side and ignored by Git.

## Checks
    npm run build
    npm start
    node tests/auth.mjs
    node tests/integration.mjs
    node tests/single-game.mjs
    node tests/maia-engine.mjs

Auth tests send only to Resend test recipients. Gameplay tests seed isolated local users and authenticate through real login endpoints.

## Hosting
See [VM deployment](deploy/README.md). The app uses Next.js standalone output, Docker, SQLite, and the existing VM's Caddy proxy. The original Sites configuration is retained as migration history; VM deployment is now the normal publishing path.

## Maia
The bundled Maia 3 ONNX model runs in the browser with ONNX Runtime Web. Model chunks are integrity-checked and cached. Rating conditions the human-move model and is not a guaranteed tournament strength. GPL license and attribution files are retained alongside the engine assets.
