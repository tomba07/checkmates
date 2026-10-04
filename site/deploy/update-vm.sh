#!/usr/bin/env bash
set -euo pipefail
VM_HOST="${VM_HOST:-root@165.227.2.163}"
APP_DIR="${APP_DIR:-/opt/apps/checkmates}"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$APP_DIR" =~ ^/[A-Za-z0-9/_-]+$ ]] || { echo "Invalid app directory"; exit 1; }
cd "$APP_ROOT"
if [[ "${SKIP_BUILD:-0}" != 1 ]]; then npm run build; fi
test -f .next/standalone/server.js
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$(head -c 12 .next/BUILD_ID)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/app/.next" "$STAGE/app/deploy"
rsync -a --exclude='.env*' --exclude='.dev.vars*' .next/standalone/ "$STAGE/app/"
rsync -a .next/static/ "$STAGE/app/.next/static/"
rsync -a public/ "$STAGE/app/public/"
rsync -a drizzle/ "$STAGE/app/drizzle/"
cp deploy/migrate.mjs "$STAGE/app/deploy/"
cp deploy/Dockerfile "$STAGE/"
ssh -o BatchMode=yes "$VM_HOST" "mkdir -p '$APP_DIR/releases/$RELEASE' '$APP_DIR/deploy'"
rsync -az "$STAGE/" "$VM_HOST:$APP_DIR/releases/$RELEASE/"
rsync -az deploy/compose.yml "$VM_HOST:$APP_DIR/deploy/compose.yml"
ssh -o BatchMode=yes "$VM_HOST" bash -s -- "$APP_DIR" "$RELEASE" <<'REMOTE'
set -euo pipefail
app_dir="$1"
release="$2"
cd "$app_dir/deploy"
test -s .env || { echo "Configure $app_dir/deploy/.env first"; exit 1; }
exec 9>"$app_dir/deploy.lock"
flock -n 9 || { echo "Another deployment is running"; exit 1; }
old_image="$(docker inspect checkmates --format '{{.Config.Image}}' 2>/dev/null || true)"
docker build -t "checkmates:$release" "$app_dir/releases/$release"
# Back up the persistent database before any startup migration.
if [[ -n "$old_image" ]]; then
 mkdir -p "$app_dir/backups"
 docker exec checkmates node -e "require('better-sqlite3')('/data/checkmates.sqlite').backup('/data/pre-deploy.sqlite').catch(()=>process.exit(1))"
 docker cp checkmates:/data/pre-deploy.sqlite "$app_dir/backups/$release.sqlite"
 chmod 600 "$app_dir/backups/$release.sqlite"
fi
if ! CHECKMATES_IMAGE="checkmates:$release" docker compose up -d --wait --wait-timeout 120; then
 if [[ -n "$old_image" ]]; then CHECKMATES_IMAGE="$old_image" docker compose up -d --wait --wait-timeout 120; fi
 exit 1
fi
printf '%s\n' "CHECKMATES_IMAGE=checkmates:$release" > .image.env
# Keep the selected image for subsequent plain docker compose commands.
sed -i '/^CHECKMATES_IMAGE=/d' .env
cat .image.env >> .env
ln -sfn "$app_dir/releases/$release" "$app_dir/current"
docker compose ps
REMOTE
echo "Deployed Checkmates: https://checkmates.mteschke.com"
