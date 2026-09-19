# Deploying TULA to your Azure Ubuntu VM

I can't reach your VM from here (no outbound network access in this sandbox), so
these are the exact commands to run yourself. Should take about 10 minutes.

## 0. What you need
- The IP address of your Azure VM (Azure Portal → your VM → Overview → "Public IP address")
- SSH access — either a `.pem` key you downloaded when the VM was created, or a username/password
- This whole `tula-platform` folder, zipped as `tula-platform.zip`

## 1. Get the files onto the VM

From **your own computer** (not the VM), in the folder where you downloaded `tula-platform.zip`:

```bash
scp tula-platform.zip <your-username>@<VM_PUBLIC_IP>:~
```

If you're using a `.pem` key:
```bash
scp -i /path/to/your-key.pem tula-platform.zip azureuser@<VM_PUBLIC_IP>:~
```

(No `scp` on Windows? Use [WinSCP](https://winscp.net) or drag-and-drop in VS Code's Remote-SSH extension instead — same result.)

## 2. SSH in and unzip

```bash
ssh <your-username>@<VM_PUBLIC_IP>
# or: ssh -i /path/to/your-key.pem azureuser@<VM_PUBLIC_IP>

unzip tula-platform.zip
cd tula-platform
```

## 3. Run the setup script

```bash
chmod +x setup.sh
./setup.sh
```

This installs Node.js, Nginx, PM2, backend dependencies, generates a random
JWT secret, starts the app, and points Nginx at it. It's safe to re-run if
something fails partway — it skips whatever's already installed.

Near the end it will print a `pm2 startup systemd ...` command — copy-paste
and run that one line (it needs `sudo`) so the app restarts automatically if
the VM reboots.

## 4. Open the port in Azure

The VM's own firewall (Nginx) is listening, but Azure blocks inbound traffic
by default at the network level. In the **Azure Portal**:

1. Go to your VM → **Networking** (left sidebar)
2. Under "Inbound port rules", click **Add inbound port rule**
3. Destination port ranges: `80` (and `443` too, if you plan to add HTTPS)
4. Protocol: TCP → **Add**

## 5. Visit your site

```
http://<VM_PUBLIC_IP>
```

Demo accounts (password `demo1234` for all):
- `owner@demo.tula` — Instrument Owner
- `lmo@demo.tula` — Legal Metrology Officer
- `gatc@demo.tula` — Government Approved Test Centre
- `admin@demo.tula` — Department Administrator

Or register a fresh account from the homepage.

---

## Optional: put it on a real domain with HTTPS

If you point a domain's A record at your VM's IP:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot edits the Nginx config for you and sets up auto-renewal.

## Updating the app later

After you change code and re-zip:

```bash
scp tula-platform.zip <user>@<VM_IP>:~
ssh <user>@<VM_IP>
cd ~ && unzip -o tula-platform.zip -d tula-platform-new
# copy your existing .env and database across so you don't lose data:
cp tula-platform/server/.env tula-platform-new/server/
cp tula-platform/server/tula.db tula-platform-new/server/ 2>/dev/null || true
rm -rf tula-platform-old && mv tula-platform tula-platform-old && mv tula-platform-new tula-platform
cd tula-platform/server && npm install --omit=dev
pm2 restart tula-server
```

## Useful commands on the VM

```bash
pm2 status              # is it running?
pm2 logs tula-server     # tail the logs
pm2 restart tula-server  # restart after a change
sudo nginx -t             # check nginx config syntax
sudo systemctl status nginx
```

## Troubleshooting

- **Site doesn't load at all** → check the Azure NSG inbound rule for port 80 (step 4) — this is the #1 cause.
- **`pm2 logs tula-server` shows a crash on `better-sqlite3`** → it needs to compile on first install; make sure `build-essential` and `python3` installed correctly (the setup script does this, but re-run `sudo apt-get install -y build-essential python3` and `cd server && npm install` again if needed).
- **502 Bad Gateway from Nginx** → the Node app isn't running; check `pm2 status` and `pm2 logs`.
- **Changes to `public/` files (HTML/CSS/JS) don't show up** → these are served directly by Express as static files, no build step needed — just refresh (hard refresh / clear cache if your browser cached the old JS).
- **Lost your data after a redeploy** → the database lives at `server/tula.db`. Always copy it forward when updating (see "Updating the app later" above). Consider backing it up periodically: `scp <user>@<VM_IP>:~/tula-platform/server/tula.db ./tula-backup.db`.
