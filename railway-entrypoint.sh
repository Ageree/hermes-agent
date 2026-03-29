#!/bin/bash
# Railway entrypoint: bootstrap config, then start the gateway (non-interactive).
set -e

HERMES_HOME="/opt/data"
INSTALL_DIR="/opt/hermes"

# Create essential directory structure
mkdir -p "$HERMES_HOME"/{cron,sessions,logs,hooks,memories,skills}

# .env — copy template on first run
if [ ! -f "$HERMES_HOME/.env" ]; then
    cp "$INSTALL_DIR/.env.example" "$HERMES_HOME/.env"
fi

# Patch .env with Railway env vars (Railway sets them in the container env,
# but Hermes reads from .env file — so we sync them on every boot)
patch_env() {
    local key="$1" val="$2" file="$HERMES_HOME/.env"
    if [ -n "$val" ]; then
        if grep -q "^${key}=" "$file" 2>/dev/null; then
            sed -i "s|^${key}=.*|${key}=${val}|" "$file"
        else
            echo "${key}=${val}" >> "$file"
        fi
    fi
}

patch_env "OPENROUTER_API_KEY" "$OPENROUTER_API_KEY"
patch_env "LLM_MODEL" "$LLM_MODEL"
patch_env "TELEGRAM_BOT_TOKEN" "$TELEGRAM_BOT_TOKEN"
patch_env "TELEGRAM_ALLOWED_USERS" "$TELEGRAM_ALLOWED_USERS"
patch_env "TERMINAL_ENV" "$TERMINAL_ENV"
patch_env "TERMINAL_TIMEOUT" "$TERMINAL_TIMEOUT"
patch_env "EXA_API_KEY" "$EXA_API_KEY"
patch_env "FAL_KEY" "$FAL_KEY"

# config.yaml
if [ ! -f "$HERMES_HOME/config.yaml" ]; then
    cp "$INSTALL_DIR/cli-config.yaml.example" "$HERMES_HOME/config.yaml"
fi

# SOUL.md
if [ ! -f "$HERMES_HOME/SOUL.md" ]; then
    cp "$INSTALL_DIR/docker/SOUL.md" "$HERMES_HOME/SOUL.md"
fi

# Sync bundled skills
if [ -d "$INSTALL_DIR/skills" ]; then
    python3 "$INSTALL_DIR/tools/skills_sync.py"
fi

# Force Python to not buffer stdout/stderr so Railway sees logs in real-time
export PYTHONUNBUFFERED=1

# Start gateway in foreground (non-interactive, perfect for Railway)
exec hermes gateway run --verbose
