#!/usr/bin/env bash
#
# install.sh — provision the `pi` agent config into ~/.pi
#
# Installs: extensions (npm packages), MCP servers, custom skills, and
# the model/provider/system-prompt configuration captured in ./config.
#
# Usage:
#   ./install.sh                 # install into ~/.pi
#   PI_HOME=/path ./install.sh   # install into a custom location
#
# Secrets (context7 / exa API keys) are read from the environment or a
# local .env file and injected into the generated config. They are never
# stored in the repo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/config"
PI_DIR="${PI_HOME:-$HOME/.pi}"
AGENT_DIR="$PI_DIR/agent"
STAMP="$(date +%Y%m%d-%H%M%S)"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[ok]\033[0m %s\n' "$1"; }

# --- 0. preflight -----------------------------------------------------------
command -v npm  >/dev/null 2>&1 || { warn "npm not found in PATH — required for extensions."; exit 1; }
command -v curl >/dev/null 2>&1 || { warn "curl not found in PATH — required to install Hypa."; exit 1; }

# Load .env if present (does not override already-exported vars).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  info "Loading secrets from .env"
  set -a; # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"; set +a
fi

CONTEXT7_API_KEY="${CONTEXT7_API_KEY:-}"
EXA_API_KEY="${EXA_API_KEY:-}"

# --- 1. directories ---------------------------------------------------------
info "Installing pi config into $PI_DIR"
mkdir -p "$AGENT_DIR/skills" "$AGENT_DIR/npm" "$AGENT_DIR/extensions"

# back up a file before overwriting it
backup() {
  local f="$1"
  if [[ -e "$f" ]]; then
    cp -p "$f" "$f.$STAMP.bak"
    warn "backed up existing $(basename "$f") -> $(basename "$f").$STAMP.bak"
  fi
}

# copy a file from config/ verbatim
copy() {
  local rel="$1"
  backup "$AGENT_DIR/$rel"
  cp "$SRC/$rel" "$AGENT_DIR/$rel"
  ok "$rel"
}

# write a templated file, substituting __KEY__ placeholders
render() {
  local rel="$1" key_name="$2" key_val="$3" placeholder="$4"
  local dest="$AGENT_DIR/$rel"
  backup "$dest"
  if [[ -z "$key_val" ]]; then
    warn "$key_name is empty — writing $rel with placeholder left in place. Set it in .env and re-run."
    cp "$SRC/$rel" "$dest"
  else
    sed "s|$placeholder|$key_val|g" "$SRC/$rel" > "$dest"
    ok "$rel (secret injected)"
  fi
}

# --- 2. plain config --------------------------------------------------------
copy settings.json
copy models.json
copy APPEND_SYSTEM.md
copy pi-vcc-config.json           # pi-vcc: algorithmic compaction (used by ctx-autocompact)
copy ctx-autocompact-config.json  # ctx-autocompact: threshold/commit-boundary compaction + resume prompt

# --- 3. secret-bearing config ----------------------------------------------
render mcp.json        CONTEXT7_API_KEY "$CONTEXT7_API_KEY" __CONTEXT7_API_KEY__
render web-search.json EXA_API_KEY      "$EXA_API_KEY"      __EXA_API_KEY__
# web-search.json lives at the pi root, not under agent/
backup "$PI_DIR/web-search.json"
mv "$AGENT_DIR/web-search.json" "$PI_DIR/web-search.json"
ok "web-search.json -> $PI_DIR/"

# --- 4. trust (generated for this machine) ----------------------------------
backup "$AGENT_DIR/trust.json"
printf '{\n  "%s": true\n}\n' "$HOME" > "$AGENT_DIR/trust.json"
ok "trust.json ($HOME)"

# --- 5. skills --------------------------------------------------------------
info "Installing skills"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude='.DS_Store' "$SRC/skills/" "$AGENT_DIR/skills/"
else
  cp -R "$SRC/skills/." "$AGENT_DIR/skills/"
fi
for s in "$SRC"/skills/*/; do ok "skill: $(basename "$s")"; done

# --- 6. extensions (npm packages) ------------------------------------------
info "Installing extensions"
cp "$SRC/npm/package.json" "$AGENT_DIR/npm/package.json"
( cd "$AGENT_DIR/npm" && npm install --silent --no-audit --no-fund )
ok "extensions installed"

# --- 6b. local extensions (TypeScript, auto-loaded from agent/extensions) ---
info "Installing local extensions"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='.DS_Store' "$SRC/extensions/" "$AGENT_DIR/extensions/"
else
  cp -R "$SRC/extensions/." "$AGENT_DIR/extensions/"
fi
for e in "$SRC"/extensions/*.ts; do ok "local extension: $(basename "$e")"; done

# --- 7. external tools ------------------------------------------------------
# Hypa: command-compression runtime that pi uses as a PreToolUse hook.
# (Separate binary from the @hypabolic/pi-hypa npm extension above.)
info "Installing external tools"
if [[ "${SKIP_HYPA:-}" == "1" ]]; then
  warn "SKIP_HYPA=1 — skipping Hypa install"
elif command -v hypa >/dev/null 2>&1; then
  ok "hypa already installed ($(command -v hypa))"
else
  curl -fsSL https://hypabolic.github.io/Hypa/install.sh | sh
  command -v hypa >/dev/null 2>&1 && ok "hypa installed" || warn "hypa install ran but 'hypa' not on PATH — open a new shell or check installer output."
fi

# --- done -------------------------------------------------------------------
echo
info "Done. Configured in $PI_DIR:"
echo "  • provider/model : $(node -e 'const s=require(process.argv[1]);console.log(s.defaultProvider+" / "+s.defaultModel)' "$SRC/settings.json")"
echo "  • extensions     : $(node -e 'const p=require(process.argv[1]);console.log(Object.keys(p.dependencies||{}).join(", "))' "$SRC/npm/package.json")"
echo "  • local ext      : $(ls "$SRC/extensions" | grep '\.ts$' | tr '\n' ' ')"
echo "  • mcp servers    : context7"
echo "  • skills         : $(ls "$SRC/skills" | tr '\n' ' ')"
echo "  • external tools : hypa$([[ "${SKIP_HYPA:-}" == "1" ]] && echo " (skipped)")"
[[ -z "$CONTEXT7_API_KEY" || -z "$EXA_API_KEY" ]] && \
  warn "One or more API keys were empty — fill .env and re-run to inject them."
warn "The 'omlx' provider expects a local model server at http://127.0.0.1:7999/v1 — start it separately (not installed by this script)."
echo
echo "Launch with: pi"
