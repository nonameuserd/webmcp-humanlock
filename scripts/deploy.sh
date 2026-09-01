#!/usr/bin/env bash
set -euo pipefail

# Deploy HUMANLOCK (Vite static) to Cloudflare Pages via Wrangler.
# Mirrors `apps/web` deploy style but standalone (not in pnpm workspace).
#
# Usage:
#   ./scripts/deploy.sh                          # production deploy, project webmcp-humanlock
#   ./scripts/deploy.sh --project my-name        # custom Pages project
#   ./scripts/deploy.sh --preview                # preview branch deploy
#   ./scripts/deploy.sh --dry-run                # build only, no upload
#   ./scripts/deploy.sh --skip-tests             # skip lint and test gates
#   PROJECT_NAME=custom pnpm run deploy          # via npm script
#
# Prerequisites:
#   - Node >=24, pnpm 9.15.4, wrangler logged in (`wrangler login` or CLOUDFLARE_API_TOKEN)
#   - `pnpm build` bakes Vite env at compile time: set VITE_VAULT_SEED if you want deterministic code
#
# Env baked at build time (Vite `import.meta.env`):
#   VITE_VAULT_SEED=12345 ./scripts/deploy.sh    # deterministic vault code for demos
#
# Notes:
#   - First run creates Pages project if missing: `wrangler pages deploy` will prompt
#     or auto-create when --project-name is given (wrangler >=3.60).
#   - Static site: no Worker, no KV, no secrets at runtime. All vault state is client-side.
#   - Verify after deploy: curl -s https://<xxx>.pages.dev | head

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="${PROJECT_NAME:-webmcp-humanlock}"
DRY_RUN=0
PREVIEW=0
SKIP_TESTS=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --project) echo "!! --project requires value: --project <name>" >&2; exit 2 ;;
    --project=*) PROJECT="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
    --preview) PREVIEW=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

# Handle --project <name> (space separated)
ARGS=()
PREV=""
for arg in "$@"; do
  if [ "$PREV" = "--project" ]; then
    PROJECT="$arg"
    PREV=""
    continue
  fi
  if [ "$arg" = "--project" ]; then PREV="--project"; continue; fi
  ARGS+=("$arg")
done
if [ "$PREV" = "--project" ]; then echo "!! --project requires value" >&2; exit 2; fi

echo "==> HUMANLOCK deploy"
echo "    project : $PROJECT"
echo "    root    : $ROOT"
echo "    dry-run : $DRY_RUN  preview : $PREVIEW  skip-tests : $SKIP_TESTS"
if [ -n "${VITE_VAULT_SEED:-}" ]; then
  echo "    seed    : $VITE_VAULT_SEED (baked at build)"
else
  echo "    seed    : random (set VITE_VAULT_SEED for deterministic demo)"
fi

# --- checks ---------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then echo "!! node not found (need >=24)" >&2; exit 1; fi
if ! command -v pnpm >/dev/null 2>&1; then echo "!! pnpm not found (need 9.15.4)" >&2; exit 1; fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then echo "!! node >=24 required, found $(node --version)" >&2; exit 1; fi

# wrangler: prefer local install, fallback to npx
WRANGLER_BIN=""
if [ -x "$ROOT/node_modules/.bin/wrangler" ]; then
  WRANGLER_BIN="$ROOT/node_modules/.bin/wrangler"
elif command -v wrangler >/dev/null 2>&1; then
  WRANGLER_BIN="wrangler"
elif command -v pnpm >/dev/null 2>&1 && pnpm exec wrangler --version >/dev/null 2>&1; then
  WRANGLER_BIN="pnpm exec wrangler"
else
  echo "!! wrangler not found." >&2
  echo "   Install (scoped): pnpm --ignore-workspace add -D wrangler@^4.119.0" >&2
  echo "   Or global: npm i -g wrangler" >&2
  echo "   Then: wrangler login  (or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)" >&2
  exit 1
fi

# auth check (non-fatal, wrangler will error with helpful message if missing)
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${WRANGLER_API_TOKEN:-}" ]; then
  if ! $WRANGLER_BIN whoami >/dev/null 2>&1; then
    echo "!! wrangler not authenticated. Run: wrangler login" >&2
    echo "   Or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID" >&2
    if [ "$DRY_RUN" = "0" ]; then exit 1; fi
    echo "   (--dry-run: continuing without auth)"
  fi
fi

echo "    wrangler: $($WRANGLER_BIN --version 2>&1 | head -n1) @ $WRANGLER_BIN"

# --- install --------------------------------------------------------------
# Scoped to humanlock: use --ignore-workspace so pnpm does not walk up to
# /Users/dami/Documents/Chitmark/pnpm-workspace.yaml and pollute the monorepo
# root lockfile. Humanlock has its own pnpm-lock.yaml and is intentionally
# outside the Chitmark workspace (not in apps/*, packages/*).
if [ ! -d "$ROOT/node_modules" ]; then
  echo "==> Installing deps (pnpm --ignore-workspace install)"
  pnpm --ignore-workspace install
fi

# --- gates (mirrors apps/web: lint == tsc --noEmit) ----------------------
if [ "$SKIP_TESTS" = "0" ]; then
  echo "==> Lint (tsc --noEmit)"
  pnpm lint

  # tests are cheap and validate deterministic scoring + symbiosis contracts
  if grep -q '"test":' "$ROOT/package.json"; then
    echo "==> Test (vitest run)"
    # allow no-tests on minimal installs; don't fail deploy on test infra missing
    pnpm test || {
      echo "!! tests failed" >&2
      exit 1
    }
  fi
else
  echo "==> Skipping lint and tests (--skip-tests)"
fi

# --- build ----------------------------------------------------------------
if [ "$SKIP_BUILD" = "0" ]; then
  echo "==> Build (Vite -> dist/)"
  # VITE_* is baked at build; export for Vite to pick up
  pnpm build
else
  echo "==> Skipping build (--skip-build)"
fi

if [ ! -d "$ROOT/dist" ] || [ -z "$(ls -A "$ROOT/dist" 2>/dev/null)" ]; then
  echo "!! dist/ missing or empty after build" >&2
  exit 1
fi
echo "    dist: $(du -sh dist | cut -f1)  files: $(find dist -type f | wc -l | tr -d ' ')"

if [ "$DRY_RUN" = "1" ]; then
  echo "==> Dry run: built dist/, skipping upload. Preview:"
  ls -lh dist | head -n 20
  echo "    Run without --dry-run to deploy to Pages project $PROJECT"
  exit 0
fi

# --- deploy ---------------------------------------------------------------
DEPLOY_ARGS=(pages deploy dist --project-name="$PROJECT")

# branch / preview handling: Pages preview deploys on non-main branches.
# For CI you can pass --branch and --commit-hash explicitly.
if [ "$PREVIEW" = "1" ]; then
  BRANCH="${CF_PAGES_BRANCH:-preview-$(date +%Y%m%d-%H%M)}"
  DEPLOY_ARGS+=(--branch="$BRANCH")
  echo "==> Preview deploy branch=$BRANCH"
else
  # production deploy defaults to main; override with CF_PAGES_BRANCH if set
  if [ -n "${CF_PAGES_BRANCH:-}" ]; then
    DEPLOY_ARGS+=(--branch="$CF_PAGES_BRANCH")
  fi
fi

if [ -n "${CF_PAGES_COMMIT:-}" ]; then
  DEPLOY_ARGS+=(--commit-hash="$CF_PAGES_COMMIT" --commit-message="${CF_PAGES_COMMIT_MSG:-deploy humanlock}")
elif git rev-parse --short HEAD >/dev/null 2>&1; then
  HASH="$(git rev-parse --short HEAD)"
  MSG="$(git log -1 --pretty=%s 2>/dev/null || echo "deploy humanlock")"
  DEPLOY_ARGS+=(--commit-hash="$HASH" --commit-message="$MSG")
fi

echo "==> Deploying to Cloudflare Pages"
echo "    $WRANGLER_BIN ${DEPLOY_ARGS[*]}"

# wrangler pages deploy is interactive on first create; ensure non-interactive CI sets --commit-* above
$WRANGLER_BIN "${DEPLOY_ARGS[@]}"

echo "==> Deploy complete"
echo "    project : $PROJECT"

# Try to print deployed URL from wrangler output is noisy; also try wrangler pages project list
if $WRANGLER_BIN pages project list 2>/dev/null | grep -q "$PROJECT"; then
  echo "    Verify: wrangler pages deployment list --project-name=$PROJECT | head"
  $WRANGLER_BIN pages deployment list --project-name="$PROJECT" 2>&1 | head -n 20 || true
fi

# Best-effort health check: Pages gives https://<project>.pages.dev
# Custom domain if configured will be separate.
PAGES_URL="https://${PROJECT}.pages.dev"
echo "    Check: curl -s -o /dev/null -w \"%{http_code}\" $PAGES_URL  (may 404 until DNS propagates)"
if command -v curl >/dev/null 2>&1; then
  CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PAGES_URL" || echo "ERR")"
  echo "    $CODE  $PAGES_URL"
  if [ "$CODE" = "404" ] || [ "$CODE" = "ERR" ]; then
    echo "    (new projects can take ~30s to propagate; preview URLs are stable immediately)"
  fi
fi

echo "    Done. Share: $PAGES_URL  (add ?code=XXXXX&sig=hl_... after vault solved)"
