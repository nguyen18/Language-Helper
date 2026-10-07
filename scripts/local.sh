#!/usr/bin/env bash
# Runs Mai locally: Docker, the local Supabase (database, storage, edge functions), the dictionary data, and
# the web app, which opens in the browser.
#
#   scripts/local.sh          start everything (Ctrl-C stops the web app; Supabase keeps running)
#   scripts/local.sh --stop   stop the local Supabase containers
#
# Safe to run again: whatever is already running is reused.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE=(npx -y supabase@2.119.0)
PROJECT_ID=mai-tutor

say() { printf '\033[1;35m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$ROOT"

if [[ "${1:-}" == "--stop" ]]; then
  say "Stopping the local Supabase"
  "${SUPABASE[@]}" stop
  exit 0
elif [[ -n "${1:-}" ]]; then
  die "Unknown option: $1 (use --stop, or nothing to start)"
fi

# 1. Docker
if ! docker info >/dev/null 2>&1; then
  say "Starting Docker"
  open -a Docker
  for _ in $(seq 1 90); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || die "Docker didn't start within 3 minutes. Open Docker Desktop and try again."
fi

# 2. Another Supabase stack on the same ports (e.g. this project under its old name, Language-Helper) would
#    make `supabase start` fail. Offer to stop it; its data is kept in its Docker volumes.
for other in $(docker ps --format '{{.Names}}' | sed -n 's/^supabase_kong_//p'); do
  [[ "$other" == "$PROJECT_ID" ]] && continue
  say "Another local Supabase ($other) is running on the same ports."
  read -r -p "  Stop it and start $PROJECT_ID's? [Y/n] " answer
  [[ "$answer" =~ ^[Nn] ]] && die "Left $other running; stop it first (npx supabase@2.119.0 stop --project-id $other)."
  "${SUPABASE[@]}" stop --project-id "$other"
done

# 3. Supabase
if "${SUPABASE[@]}" status >/dev/null 2>&1; then
  say "The local Supabase is already running"
else
  say "Starting the local Supabase (the first run downloads its images, a few minutes)"
  "${SUPABASE[@]}" start
fi

# Its URL and keys, as API_URL=… lines.
sb_status="$("${SUPABASE[@]}" status -o env 2>/dev/null | grep -E '^[A-Z_]+=')"
value() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" <<<"$sb_status"; }
API_URL="$(value API_URL)"
PUBLISHABLE_KEY="$(value PUBLISHABLE_KEY)"
[[ -n "$API_URL" && -n "$PUBLISHABLE_KEY" ]] || die "Couldn't read the local Supabase's URL and key from \`supabase status\`."

# 4. The web app's packages
cd "$ROOT/web"
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules ]]; then
  say "Installing the web app's packages"
  npm install
fi

# 5. which-dialect's data in local Storage (skipped once it's all there)
say "Checking the dictionary data"
npm run --silent mirror-data -- --if-missing

# 6. The web app, pointed at the local Supabase (these override web/.env.local)
say "Starting the web app (Ctrl-C to stop it; Supabase keeps running, scripts/local.sh --stop stops it)"
say "Supabase Studio: http://127.0.0.1:54323"
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
exec npm run dev -- --open
