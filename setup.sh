#!/usr/bin/env bash
# TULA — one-shot server setup for Ubuntu (Azure VM).
# Run this FROM INSIDE the tula-platform folder on the server, e.g.:
#   cd ~/tula-platform && chmod +x setup.sh && ./setup.sh
#
# What it does:
#   1. Installs Node.js 20.x, Nginx, and PM2 (skips anything already installed)
#   2. Installs backend dependencies
#   3. Creates server/.env from the example if it doesn't exist yet
#   4. Starts the app with PM2 and sets it to survive reboots
#   5. Points Nginx at the app on port 80
#
# Safe to re-run — it won't duplicate installs or overwrite an existing .env.

set -e

echo "=============================================="
echo " TULA platform — server setup"
echo "=============================================="

if [ ! -f "server/server.js" ]; then
  echo "ERROR: run this script from inside the tula-platform folder (the one containing server/ and public/)."
  exit 1
fi

# ---------- 1. Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  echo "--> Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "--> Node.js already installed: $(node -v)"
fi

# ---------- 2. build tools (better-sqlite3 needs to compile) ----------
echo "--> Ensuring build tools are present..."
sudo apt-get install -y build-essential python3

# ---------- 3. Nginx ----------
if ! command -v nginx >/dev/null 2>&1; then
  echo "--> Installing Nginx..."
  sudo apt-get update
  sudo apt-get install -y nginx
else
  echo "--> Nginx already installed."
fi

# ---------- 4. PM2 ----------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "--> Installing PM2 globally..."
  sudo npm install -g pm2
else
  echo "--> PM2 already installed."
fi

# ---------- 5. backend deps + env ----------
echo "--> Installing backend dependencies..."
cd server
npm install --omit=dev

if [ ! -f ".env" ]; then
  echo "--> Creating server/.env from template (edit JWT_SECRET before going live!)"
  cp .env.example .env
  RAND_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  # portable sed for both GNU and BSD sed
  sed -i.bak "s/replace_this_with_a_long_random_secret/${RAND_SECRET}/" .env && rm -f .env.bak
else
  echo "--> server/.env already exists, leaving it alone."
fi
cd ..

# ---------- 6. start with PM2 ----------
echo "--> Starting TULA with PM2..."
cd server
pm2 start ecosystem.config.js
pm2 save
cd ..

STARTUP_CMD=$(pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1)
echo "--> To make PM2 survive reboots, run this once (copy-paste it, it needs sudo):"
echo "    $STARTUP_CMD"

# ---------- 7. Nginx site ----------
echo "--> Configuring Nginx..."
SERVER_IP=$(curl -s -4 ifconfig.me || echo "YOUR_SERVER_IP")
sudo cp nginx.conf.example /etc/nginx/sites-available/tula
sudo sed -i "s/YOUR_SERVER_IP_OR_DOMAIN/${SERVER_IP}/" /etc/nginx/sites-available/tula
sudo ln -sf /etc/nginx/sites-available/tula /etc/nginx/sites-enabled/tula
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "=============================================="
echo " Done."
echo " Visit: http://${SERVER_IP}"
echo " Demo logins (password: demo1234):"
echo "   owner@demo.tula / lmo@demo.tula / gatc@demo.tula / admin@demo.tula"
echo ""
echo " Don't forget: open port 80 (and 443 if you add HTTPS) in your Azure"
echo " Network Security Group / Portal — see DEPLOY.md."
echo "=============================================="
