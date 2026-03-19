#!/bin/bash
set -euo pipefail

# ============================================================
# x402 AI Agent — VPS Deployment Script
#
# Usage:
#   ./deploy-vps.sh setup          Full first-time setup (system deps, node, caddy, etc.)
#   ./deploy-vps.sh deploy         Pull latest code, build, and restart
#   ./deploy-vps.sh restart        Restart the service (e.g. after .env changes)
#   ./deploy-vps.sh logs           Tail service logs
#   ./deploy-vps.sh status         Show service status
#
# Must run as root (sudo).
# ============================================================

# --- Configuration ---
DOMAIN="${DOMAIN:-x402-agent.duckdns.org}"
APP_USER="x402"
APP_DIR="/home/$APP_USER/x402-ai-agent"
REPO="https://github.com/aijayz/x402-ai-agent.git"
NODE_VERSION="22"

# Fix permission issues when running with sudo
export HOME="${HOME:-/root}"
export npm_config_cache="${npm_config_cache:-/tmp/npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/.config}"

run_as_app_user() {
    sudo -u "$APP_USER" HOME="/home/$APP_USER" bash -c "$1"
}

# ── Helpers ────────────────────────────────────────────────────

install_system_deps() {
    echo "→ Installing system dependencies..."
    apt-get update -qq
    apt-get install -y -qq curl git
}

install_node() {
    echo "→ Installing Node.js $NODE_VERSION + pnpm..."
    if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y -qq nodejs
    fi
    npm install -g pnpm --silent
}

create_app_user() {
    echo "→ Setting up app user..."
    if ! id "$APP_USER" &>/dev/null; then
        useradd -m -s /bin/bash "$APP_USER"
    fi
}

clone_repo() {
    echo "→ Cloning repository..."
    if [ -d "$APP_DIR" ]; then
        echo "  Repo already exists at $APP_DIR, skipping clone"
    else
        run_as_app_user "git clone $REPO $APP_DIR"
    fi
}

pull_latest() {
    echo "→ Pulling latest code..."
    run_as_app_user "git -C $APP_DIR pull --ff-only"
}

build_app() {
    echo "→ Installing dependencies..."
    run_as_app_user "cd $APP_DIR && pnpm install --frozen-lockfile"

    # Fix permissions on .next directory (may have been created by root)
    echo "→ Fixing permissions..."
    if [ -d "$APP_DIR/.next" ]; then
        chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next" 2>/dev/null || true
    fi

    echo "→ Building application (optimized for low memory)..."
    # Use --no-lint and limit Node memory to reduce RAM usage
    # Don't use turbopack for production build (saves memory)
    run_as_app_user "cd $APP_DIR && NODE_OPTIONS='--max-old-space-size=1024' pnpm next build --no-lint"
    echo "→ Copying standalone assets..."
    run_as_app_user "cp -r $APP_DIR/.next/static $APP_DIR/.next/standalone/.next/static"
    if [ -d "$APP_DIR/public" ]; then
        run_as_app_user "cp -r $APP_DIR/public $APP_DIR/.next/standalone/public"
    fi
    # Symlink .env into standalone dir
    ln -sf "$APP_DIR/.env" "$APP_DIR/.next/standalone/.env"
}

setup_env() {
    if [ ! -f "$APP_DIR/.env" ]; then
        echo "→ Creating .env from example — you MUST edit this with your secrets"
        run_as_app_user "cp $APP_DIR/.env.example $APP_DIR/.env"
    else
        echo "→ .env already exists, keeping current config"
    fi
}

setup_systemd() {
    echo "→ Setting up systemd service..."
    cat > /etc/systemd/system/x402.service <<EOF
[Unit]
Description=x402 AI Agent
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/.next/standalone
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable x402
}

setup_caddy() {
    echo "→ Setting up Caddy..."
    if ! command -v caddy &>/dev/null; then
        apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
        apt-get update -qq
        apt-get install -y -qq caddy
    fi

    if [ -n "$DOMAIN" ]; then
        cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
}
EOF
        echo "  HTTPS enabled at https://$DOMAIN"
    else
        cat > /etc/caddy/Caddyfile <<EOF
:80 {
    reverse_proxy localhost:3000
}
EOF
        echo "  No DOMAIN set — Caddy serving HTTP on port 80"
    fi
    systemctl restart caddy
}

# ── Commands ───────────────────────────────────────────────────

cmd_setup() {
    echo "============================================"
    echo "  x402 AI Agent — Full Setup"
    echo "============================================"
    install_system_deps
    install_node
    create_app_user
    clone_repo
    pull_latest
    build_app
    setup_env
    setup_systemd
    setup_caddy
    systemctl restart x402
    echo ""
    echo "============================================"
    echo "  Setup complete!"
    echo ""
    echo "  Next steps:"
    echo "    1. Edit secrets:  sudo -u $APP_USER nano $APP_DIR/.env"
    echo "    2. Restart:       sudo ./deploy-vps.sh restart"
    echo "    3. View logs:     sudo ./deploy-vps.sh logs"
    echo "============================================"
}

cmd_deploy() {
    echo "============================================"
    echo "  x402 AI Agent — Deploy"
    echo "============================================"
    pull_latest
    echo "→ Stopping service to free RAM for build..."
    systemctl stop x402 || true
    build_app
    echo "→ Starting service..."
    systemctl start x402
    echo ""
    echo "  Deploy complete! View logs: sudo ./deploy-vps.sh logs"
}

cmd_restart() {
    echo "→ Restarting x402 service..."
    systemctl restart x402
    systemctl status x402 --no-pager
}

cmd_logs() {
    journalctl -u x402 -f
}

cmd_status() {
    systemctl status x402 --no-pager
}

cmd_help() {
    echo "Usage: sudo ./deploy-vps.sh <command>"
    echo ""
    echo "Commands:"
    echo "  setup     Full first-time setup (system deps, node, caddy, build)"
    echo "  deploy    Pull latest code, build, and restart"
    echo "  restart   Restart the service (e.g. after .env changes)"
    echo "  logs      Tail service logs"
    echo "  status    Show service status"
    echo ""
    echo "Environment:"
    echo "  DOMAIN    Domain for HTTPS (default: x402-agent.duckdns.org)"
}

# ── Main ───────────────────────────────────────────────────────

case "${1:-help}" in
    setup)   cmd_setup   ;;
    deploy)  cmd_deploy  ;;
    restart) cmd_restart ;;
    logs)    cmd_logs    ;;
    status)  cmd_status  ;;
    help)    cmd_help    ;;
    *)
        echo "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
