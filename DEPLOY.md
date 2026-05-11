# eCASVote deployment (Debian 13, single host)

This document matches the **nginx** layout in `nginx/ecasvote.conf` and the frontend’s `getGatewayBase()` behavior in `frontend-ecasvote/lib/ecasvoteApi.ts`.

## Accuracy vs the original Nginx prompt

| Prompt item | Verdict |
|-------------|---------|
| **`/ecasvote-gateway/` → gateway with prefix stripped** | **Correct.** Matches browser fallback when `NEXT_PUBLIC_GATEWAY_URL` is unset (`/ecasvote-gateway` + paths like `/login`). Upstream must see `/login`, not `/ecasvote-gateway/login`. |
| **`/api/` → gateway with `/api` stripped** | **Risky / wrong for this codebase.** The gateway exposes **`/api/omr-layout/...`**. Stripping `/api` would turn `/api/omr-layout/x` into `/omr-layout/x` and **break** those routes. The bundled config uses **`proxy_pass .../api/`** so **`/api/` is preserved** on the backend. |
| **CORS headers on Nginx** | **Usually unnecessary.** `gateway-api` already sets `Access-Control-Allow-Origin: *`. Adding the same headers in Nginx can **duplicate** values and confuse browsers. Prefer gateway-only CORS unless you need extra policy. |
| **WebSocket “for Next.js hot reload”** | **Mostly dev.** Production uses `npm start` / `next start` — HMR is not the same as `next dev`. Upgrade headers are still useful for **any** WS the app uses and do not hurt. |
| **`NEXT_PUBLIC_GATEWAY_URL` empty default** | **Correct.** Empty/unset lets the **browser** use relative **`/ecasvote-gateway`**, which Nginx proxies to the gateway after stripping the prefix. |

## TLS material

Place PEM files (or symlink):

- Certificate: `/etc/nginx/ssl/ecasvote.crt`
- Private key: `/etc/nginx/ssl/ecasvote.key`

A bare IP (`192.168.1.6`) will not get a public CA certificate; use an internal CA, DNS hostname + SAN, or institutional PKI.

## Nginx install

From this repo on the server:

```bash
sudo cp nginx/ecasvote.conf /etc/nginx/sites-available/ecasvote.conf
sudo ln -sf /etc/nginx/sites-available/ecasvote.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The `map` directive must live under `http { }`. Debian’s `sites-enabled` includes are under `http`, so this file is valid.

Routing summary:

| Path | Upstream | Notes |
|------|-----------|--------|
| `/` | `127.0.0.1:3000` | Next.js frontend (Docker `network_mode: host`) |
| `/ecasvote-gateway/` | `127.0.0.1:4000/` | Prefix stripped — matches Express routes |
| `/api/` | `127.0.0.1:4000/api/` | Prefix **kept** — needed for `/api/omr-layout/...` |

Port **8090** (OMR worker) should stay **localhost-only**; only **gateway** talks to it via `OMR_WORKER_URL`.

## Smoke Tests

Run after deployment (TLS + routing):

```bash
curl -sk https://192.168.1.6/ecasvote-gateway/health
curl -sk https://192.168.1.6/ | head -c 100
curl http://127.0.0.1:4000/elections | head -c 100
```

## SQLite Backup

The database is at `gateway-api/prisma/dev.db` (mounted as Docker volume).

Backup command:

```bash
cp ~/ecasvote-system/ecasvote/gateway-api/prisma/dev.db ~/backups/dev-$(date +%Y%m%d).db
```

Recommend running before any deployment or network reset.

## Docker Compose (this repo)

Root `docker-compose.yml` sets **`NEXT_PUBLIC_GATEWAY_URL`** build arg default to **empty** so production browsers use **`/ecasvote-gateway`**.

Build with optional overrides:

```bash
cd ecasvote
# Candidate photos use next/image — allow your HTTPS host (see frontend-ecasvote/next.config.ts)
export NEXT_PUBLIC_IMAGE_REMOTE_HOSTS=192.168.1.6
docker compose build frontend
docker compose up -d
```

If **`NEXT_PUBLIC_IMAGE_REMOTE_HOSTS`** is unset at build time, only **`localhost:4000`** / **`127.0.0.1:4000`** patterns apply — fine for local dev, insufficient for **`next/image`** when candidates use absolute URLs on another host.

SSR (`getGatewayBase` on the server) uses **`GATEWAY_INTERNAL_URL`** or **`http://127.0.0.1:4000`** — fine with **host networking**.

## Startup order (after reboot)

1. Fabric / CCaaS (if used)  
2. `docker compose up -d` in **ecasvote** (gateway → omr-worker → frontend)  
3. Nginx  

## Persistence

Gateway SQLite: `./gateway-api/prisma/dev.db` volume in compose — back up before upgrades.

Scan sessions are **in-memory** in the gateway process — restarting the gateway clears active dual-monitor sessions.
