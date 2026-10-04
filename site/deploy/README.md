# Checkmates on the shared VM

Public URL: https://checkmates.mteschke.com
VM: root@165.227.2.163
App directory: /opt/apps/checkmates

The app runs as a Node.js Docker container on the shared web network. Caddy handles HTTPS. No application port is published directly. Caddy overwrites X-Real-IP so auth rate limits use the actual visitor IP.

## Deploy
From site/, run:
    ./deploy/update-vm.sh

Builds locally to avoid consuming the small VM's memory, transfers standalone output without local environment files, installs the matching Linux SQLite native module, and waits for the new container to become healthy. Startup applies pending schema migrations transactionally. Existing deployments are backed up before migrations, and a failed rollout restores the previous image. Breaking migrations require a reviewed database rollback; image rollback alone cannot reverse schema changes.

Required /opt/apps/checkmates/deploy/.env values (mode 600):
- BETTER_AUTH_SECRET: long random secret
- BETTER_AUTH_URL: https://checkmates.mteschke.com
- RESEND_API_KEY: shared transactional-email key
- EMAIL_FROM: Checkmates <checkmates@mteschke.com>

SQLite lives in the checkmates_data Docker volume at /data/checkmates.sqlite.
Pre-deploy database backups are in /opt/apps/checkmates/backups.
Images and releases are retained for rollback; remove old releases only after reviewing disk space and confirming the current image.

## DNS and proxy
Cloudflare DNS-only A record: checkmates -> 165.227.2.163.
The Caddy route is tracked by ../mteschke-vm-infra/proxy/Caddyfile (sibling repository).
Validate and reload the existing proxy; do not replace its other app routes.

## Operations
    cd /opt/apps/checkmates/deploy
    docker compose ps
    docker compose logs --tail 100
    docker compose restart

Health endpoint: /api/health
Authentication is required for /api/rooms; /login is public.

The old chesscoop.tomba07.chatgpt.site deployment remains available as a fallback. It is independent and does not share the VM database. Its database had no accounts or games at migration time.
