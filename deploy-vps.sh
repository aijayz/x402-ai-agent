#!/bin/bash
set -euo pipefail

# ============================================================
# x402 AI Agent — VPS Deployment Script
#
# Usage:
#   1. Copy this script to your VPS
#   2. Set your domain:  export DOMAIN=yourdomain.com
#   3. Run:              chmod +x deploy-vps.sh && sudo ./deploy-vps.sh
#   4. After install:    edit /home/x402/x402-ai-agent/.env with your secrets
#   5. Start the app:    sudo systemctl start x402
# ============================================================

# --- Configuration ---
DOMAIN="${DOMAIN:-}"
APP_USER="x402"
APP_DIR="/home/$APP_USER/x402-ai-agent"
REPO="https://github.com/aijayz/x402-ai-agent.git"
NODE_VERSION="22"

# Fix permission denied on /root when running with sudo
# When sudo -u switches user, ensure HOME points to that user's home
export HOME="${HOME:-/root}"
export npm_config_cache="${npm_config_cache:-/tmp/npm-cache}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp/.config}"

# Helper to run commands as app user with correct HOME
run_as_app_user() {
    local cmd="$1"
    sudo -u "$APP_USER" HOME="/home/$APP_USER" bash -c "$cmd"
}

echo "================================================"
echo "  x402 AI Agent — VPS Deployment"
echo "================================================"

# --- 1. System dependencies ---
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git

# --- 2. Node.js + pnpm ---
echo "[2/7] Installing Node.js $NODE_VERSION + pnpm..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
npm install -g pnpm pm2 --silent

# --- 3. Create app user ---
echo "[3/7] Setting up app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
fi

# --- 4. Clone / pull repo ---
echo "[4/7] Fetching code..."
if [ -d "$APP_DIR" ]; then
  run_as_app_user "git -C $APP_DIR pull --ff-only"
else
  run_as_app_user "git clone $REPO $APP_DIR"
fi

# --- 5. Build ---
echo "[5/7] Building application..."
cd "$APP_DIR"
run_as_app_user "cd $APP_DIR && pnpm install --frozen-lockfile"
run_as_app_user "cd $APP_DIR && SKIP_ENV_VALIDATION=1 pnpm build"

# Copy standalone assets
run_as_app_user "cp -r $APP_DIR/.next/static $APP_DIR/.next/standalone/.next/static"
if [ -d "$APP_DIR/public" ]; then
  run_as_app_user "cp -r $APP_DIR/public $APP_DIR/.next/standalone/public"
fi

# --- 6. Create .env if missing ---
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[!] Creating .env from example — you MUST edit this with your secrets"
  run_as_app_user "cp $APP_DIR/.env.example $APP_DIR/.env"
fi
# Symlink .env into standalone dir
ln -sf "$APP_DIR/.env" "$APP_DIR/.next/standalone/.env"

# --- 7. Systemd service ---
echo "[6/7] Setting up systemd service..."
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

# --- 8. Caddy reverse proxy ---
echo "[7/7] Setting up Caddy..."
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
  systemctl restart caddy
  echo ""
  echo "  HTTPS enabled at https://$DOMAIN"
  echo "  Remember to update .env: URL=https://$DOMAIN"
else
  cat > /etc/caddy/Caddyfile <<EOF
:80 {
    reverse_proxy localhost:3000
}
EOF
  systemctl restart caddy
  echo ""
  echo "  [!] No DOMAIN set — Caddy serving HTTP on port 80"
  echo "  To enable HTTPS, re-run with: DOMAIN=yourdomain.com sudo ./deploy-vps.sh"
fi

echo ""
echo "================================================"
echo "  Deployment complete!"
echo ""
echo "  Next steps:"
echo "    1. Edit secrets:   sudo -u $APP_USER nano $APP_DIR/.env"
echo "    2. Start the app:  sudo systemctl start x402"
echo "    3. Check status:   sudo systemctl status x402"
echo "    4. View logs:      sudo journalctl -u x402 -f"
echo ""
echo "  To redeploy after code changes:"
echo "    cd $APP_DIR && git pull"
echo "    sudo -u $APP_USER bash -c 'cd $APP_DIR && pnpm install --frozen-lockfile && SKIP_ENV_VALIDATION=1 pnpm build'"
echo "    cp -r .next/static .next/standalone/.next/static"
echo "    cp -r public .next/standalone/public"
echo "    sudo systemctl restart x402"
echo "================================================"
