#!/bin/bash
# Railway entrypoint: bootstrap config, then start the gateway (non-interactive).
set -e

HERMES_HOME="/opt/data"
INSTALL_DIR="/opt/hermes"

# Create essential directory structure
mkdir -p "$HERMES_HOME"/{cron,sessions,logs,hooks,memories,skills}

# .env — copy template if first run, but env vars from Railway take precedence
if [ ! -f "$HERMES_HOME/.env" ]; then
    cp "$INSTALL_DIR/.env.example" "$HERMES_HOME/.env"
fi

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

# Start gateway in foreground (non-interactive, perfect for Railway)
exec hermes gateway run
