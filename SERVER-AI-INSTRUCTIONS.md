# Server setup instructions for ISB (InSecure Bank)

You are an AI assistant setting up the ISB lab on a Linux server. The owner will run the scripts you write as root over SSH. Read this whole file before doing anything.

## What this is

ISB is a deliberately insecure banking web app used as a hands-on security training lab. Students attack it over the internet. It runs from `docker-compose.yml` in this directory (Flask app, PostgreSQL, a small cleanup worker). The public hostname is **isb-lab.psychosherlock.xyz**.

## Goals, in priority order

1. **All intentional flaws keep working.** Do not fix, patch, sanitise, or "improve" the application. See the rules below.
2. **The host is protected.** Any remote code execution inside the lab must affect only the container (the "guest"), never the host or other services on it.
3. **Nothing is exposed directly on the host.** The container publishes its port on `127.0.0.1` only. The public entry point is nginx on ports 80 and 443, proxying to that loopback port.

## Hard rules (do not break these, even if something looks insecure)

- Do **not** edit application code: `app.py`, `auth.py`, `database.py`, `merchant_payments.py`, `ai_agent_deepseek.py`, `transaction_graphql.py`, `templates/`, `static/`, `exposed_env_files.py`, `xss_cleanup.py`. The weaknesses in them are the product.
- Do **not** add a WAF, ModSecurity, request filtering, body or header rewriting, CSP or security headers, `proxy_intercept_errors`, or anything else in nginx that changes request or response content. The proxy must be transparent.
- Do **not** add per-IP rate limiting, fail2ban rules on the app, or login throttling. Students brute-force logins and PINs on purpose.
- Do **not** hide or block any path (`/.env`, `/debug/users`, `/graphql`, `/api/docs/`, `/latest/meta-data/...`, `/sup3r_s3cr3t_admin`, `/static/uploads/...`). All of them are exercises.
- Do **not** run the containers `privileged`, with `network_mode: host`, with extra capabilities, or with the Docker socket or any host directory mounted (other than the existing `./static/uploads`). Do not add `ISB_BIND_ADDR` or any `0.0.0.0` port mapping.
- Do **not** change the published port from `127.0.0.1:${ISB_WEB_PORT}`.
- Do not print, log, or commit the contents of `.env`.
- Ask the owner before anything destructive or anything not listed here.

## Security design you must preserve or implement

| Layer | Requirement |
|---|---|
| Compose | Already hardened: loopback-only port, `no-new-privileges`, all capabilities dropped, CPU / memory / PID limits, log rotation, database on an `internal: true` network with no internet access. Keep as is. |
| Docker network | The web container's outbound network is the bridge `br-isb`, subnet `172.29.77.0/24` (set in the compose file). Firewall rules below key off this. If the subnet collides with something on this server, change it in `docker-compose.yml` **and** in your firewall script, and tell the owner. |
| Host firewall | Only 22, 80, 443 are reachable from outside. Docker bypasses `ufw`, so container egress rules go in the `DOCKER-USER` chain (see script 2). |
| Egress from the guest | A compromised container must not reach the host, the LAN, or the cloud metadata service. It may reach the public internet (DNS and HTTPS), because the lab's AI support feature and SSRF exercises use outbound requests. |
| Reverse proxy | nginx on the host, transparent proxy to `127.0.0.1:5000`. |

The app ships its own **fake** metadata endpoints under `/latest/meta-data/...` for the SSRF exercise. Students reach those through the app itself. The firewall rules below block the **real** cloud metadata address `169.254.169.254` so an SSRF cannot steal this server's real cloud credentials.

## Steps

### 0. Inspect first
Report to the owner: OS and version, whether Docker and the Compose plugin are installed (`docker --version`, `docker compose version`), whether nginx is installed, what already listens on ports 80 and 443 (`ss -tlnp`), whether `ufw` or `nftables` is active, and whether `172.29.77.0/24` is in use (`ip route`). Do not change anything yet. If Docker is missing, install it from Docker's official apt or dnf repository and tell the owner what you did.

### 1. Prepare the app
```bash
cd /path/to/isb            # the directory containing docker-compose.yml
cp .env.example .env
chmod 600 .env
```
Ask the owner for these, then edit `.env` (never echo values back into logs):
- `DEEPSEEK_API_KEY`: the AI support feature works only with a real key. The default is a placeholder.
- `DB_PASSWORD`: generate a long random value (`openssl rand -hex 24`). The database is not reachable from outside, so this is safe to change.

Leave `ISB_WEB_PORT=5000` unless it is taken, in which case pick a free port and use the same port in the nginx script.

Start it:
```bash
docker compose up -d --build
docker compose ps          # wait until web and db show "healthy"
curl -sI http://127.0.0.1:5000/login | head -1     # expect HTTP 200
```
Confirm `docker compose ps` shows the web port as `127.0.0.1:5000->5000/tcp` and nothing on `0.0.0.0`. The seeded data (admin and merchant accounts) is created automatically on first start.

### 2. Write `harden-isb-network.sh` (the owner will run it as root)
Requirements:
- `#!/usr/bin/env bash`, `set -euo pipefail`, aborts with a clear message if not root, idempotent (safe to run twice, no duplicate rules).
- Uses the `DOCKER-USER` chain (iptables) or the equivalent nftables approach, whichever the server uses. Match the guest by source subnet `172.29.77.0/24` or by interface `br-isb`.
- Rules, in this order, for traffic **from** the guest:
  1. Allow established and related connections back to the guest.
  2. Allow DNS (UDP/TCP 53) to any destination, so name resolution works.
  3. **Drop** to the cloud metadata address `169.254.169.254` and all of `169.254.0.0/16`.
  4. **Drop** to RFC1918 and other private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, plus the host's own public IPs. (This also blocks the other Docker networks on the server and the docker0 gateway.)
  5. Allow the rest (public internet, TCP 443 and 80 at minimum).
- Also add an `INPUT` rule dropping traffic arriving on `br-isb` that is destined for the host itself, **except** established and related, so the guest cannot reach SSH, nginx, databases, or any other host service on the bridge gateway address (`172.29.77.1`).
- Make the rules persist across reboots (a small systemd unit that runs the script after `docker.service`, or `iptables-persistent`). Do not rely on rules that vanish when Docker restarts: Docker recreates its chains, so the systemd unit must re-apply after Docker starts.
- Finishes by printing the active rules and running a **self-test** with the container: from inside `isb-web-1` verify that (a) `https://example.com` works, (b) `http://169.254.169.254/` times out or is refused, (c) the host's LAN or private address and `172.29.77.1` are unreachable. Use short timeouts (3 seconds).

### 3. Write `setup-nginx.sh` (the owner will run it as root)
Requirements:
- `#!/usr/bin/env bash`, `set -euo pipefail`, root check, idempotent.
- Installs nginx and certbot with `python3-certbot-nginx` if missing, using the system package manager.
- Creates `/etc/nginx/sites-available/isb-lab.psychosherlock.xyz` (or `/etc/nginx/conf.d/isb-lab.conf` on distributions without `sites-available`) and enables it. Do **not** delete or overwrite other sites. Keep nginx's default site untouched unless it conflicts, and if it does, ask.
- The server block:
  - `server_name isb-lab.psychosherlock.xyz;`
  - `location /` → `proxy_pass http://127.0.0.1:5000;` (use the `ISB_WEB_PORT` value from `.env`)
  - `proxy_http_version 1.1;`
  - Pass `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.
  - `client_max_body_size 10m;` (the upload feature intentionally has no limit in the app, but the proxy caps disk-filling abuse).
  - `proxy_read_timeout 60s;` and `proxy_connect_timeout 5s`.
  - `access_log` and `error_log` to their own files for this site, with logrotate.
  - `server_tokens off;` at the http level is fine. Do not add any other response header or rewrite.
- Runs `nginx -t` before `systemctl reload nginx`, and stops with a clear message on failure.
- Obtains a Let's Encrypt certificate: `certbot --nginx -d isb-lab.psychosherlock.xyz --redirect --non-interactive --agree-tos -m "$CERTBOT_EMAIL"`. Read `CERTBOT_EMAIL` from an environment variable and exit with a clear message if it is unset. Before running certbot, check that the domain resolves to this server's public IP (`dig +short isb-lab.psychosherlock.xyz`) and warn if it does not.
- Opens only ports 80 and 443 (and keeps 22) in `ufw` if `ufw` is active. Never open 5000 or 5432.

### 4. Hand the scripts to the owner
Do not run the scripts yourself unless the owner tells you to. Tell the owner the exact order:
```bash
sudo bash harden-isb-network.sh
sudo CERTBOT_EMAIL=you@example.com bash setup-nginx.sh
```
Summarise what each one changes on the host in plain language, so the owner can review them before running as root.

### 5. Verify after the owner has run them
Run every check and report pass or fail, with the evidence:
1. `curl -sI https://isb-lab.psychosherlock.xyz/login` returns 200 with a valid certificate.
2. From **outside** the server (or `curl --interface` a public IP), `http://<server-ip>:5000` and `:5432` are refused or time out.
3. `ss -tlnp` shows `127.0.0.1:5000` for docker-proxy, and nothing for 5432.
4. `docker inspect isb-web-1 --format '{{.HostConfig.Privileged}} {{.HostConfig.CapDrop}} {{.HostConfig.NetworkMode}}'` shows `false`, `[ALL]`, and an isb network, not `host`.
5. From inside the container: public HTTPS works, `169.254.169.254` is blocked, the bridge gateway `172.29.77.1` and a private address are blocked.
6. The lab still behaves as intended. Test with `curl` that these still work (they are exercises, so they must succeed):
   - `POST /login` with `admin` / `admin123` returns a token.
   - `GET /.env` returns the exposed env sample, and `GET /debug/users` returns data.
   - `GET /graphql` serves the GraphQL endpoint.
   - `GET /latest/meta-data/` returns the app's fake metadata listing.
   - `GET /sup3r_s3cr3t_admin` loads for an admin token.
   - A login with a SQL injection payload in the username (`' OR '1'='1' --`) is accepted by the app.

If any exercise path returns 403 or 404 through nginx, you added something that filters traffic. Remove it.

## Operating notes for the owner

- Update: replace the files, then `docker compose up -d --build`.
- Reset all student data: `docker compose down -v && docker compose up -d --build`. This deletes the database volume. Uploaded files in `static/uploads/` are separate: clear them with `find static/uploads -type f ! -name 'admin.png' ! -name 'user.png' ! -name 'banking-app.png' -delete`.
- Logs: `docker compose logs -f web`, plus the nginx logs for this site.
- Run the lab on a dedicated VM if possible. The container boundary is the main protection, so keep Docker and the kernel patched.

## Report back

When finished, give the owner: what you installed, every file you created or changed, the verification results, and anything you could not do or had to ask about.
