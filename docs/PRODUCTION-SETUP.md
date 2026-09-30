# RYUKSAIDSO Production Setup — AWS EC2 Runbook

This is the complete, step-by-step runbook for deploying RYUKSAIDSO to a single AWS EC2 instance with nginx (HTTP first, then HTTPS), automated GitHub Actions deploys, health-gated rollbacks, scaling, backups and troubleshooting.

Commands are run **on the EC2 instance** unless marked otherwise. Examples assume Ubuntu (`ubuntu` user); on Amazon Linux 2023 use `ec2-user` instead.

---

## 1. Instance and security group requirements

- **Instance**: any small x86_64/ARM instance with Docker support (t3.small or larger recommended), at least 20 GB gp3 storage (images + Postgres volume), Amazon Linux 2023 or Ubuntu 22.04/24.04.
- **Region/AZ**: any; the deploy workflow reaches the instance over SSH, so a public IP (or reachable endpoint) is required.
- **Security group inbound rules**:

| Port | Source | Purpose |
|---|---|---|
| 22 | Your IP only | SSH (also used by GitHub Actions deploy) |
| 80 | 0.0.0.0/0 | HTTP + ACME certificate issuance |
| 443 | 0.0.0.0/0 | HTTPS |

- **Outbound**: allow all (Docker Hub pulls, apt, ACME, provider APIs).
- Optional: give the instance an Elastic IP so the deploy secret `EC2_HOST` stays stable.

## 2. Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

If the images in Docker Hub are private:

```bash
docker login
```

## 3. Create /opt/ryuksaidso

The deploy workflow syncs `docker-compose.prod.yml`, `docker-compose.tls.yml` and `infra/` into `/opt/ryuksaidso` on every run, but the environment file must exist **before the first deploy**:

```bash
sudo mkdir -p /opt/ryuksaidso
sudo chown $USER:$USER /opt/ryuksaidso
cd /opt/ryuksaidso
```

## 4. Generate .env.production

Locally, copy the template and fill it in:

```bash
cp .env.production.example .env.production
```

Generate the secrets with openssl:

```bash
openssl rand -base64 48        # JWT_SECRET
openssl rand -hex 32           # POSTGRES_PASSWORD (URL-safe: alphanumeric only)
openssl rand -base64 24        # GRAFANA_ADMIN_PASSWORD
```

> `POSTGRES_PASSWORD` is interpolated into `DATABASE_URL` by compose, so keep it alphanumeric (`openssl rand -hex 32`); a raw base64 value can contain `/` or `+` and break the connection string.

Then set at minimum:

```env
DOCKERHUB_USERNAME=<your Docker Hub user/org>   # must match the namespace images were pushed to
IMAGE_TAG=latest                                 # overridden by each deploy (sha-<commit>)

POSTGRES_PASSWORD=<from openssl rand -hex 32>
JWT_SECRET=<from openssl rand -base64 48>
GRAFANA_ADMIN_PASSWORD=<from openssl rand -base64 24>

CORS_ORIGIN=https://app.example.com
FRONTEND_URL=https://app.example.com
DOMAIN=app.example.com
CERT_NAME=app.example.com

SYSTEM_ADMIN_EMAILS=you@example.com              # bootstraps the first system admin
```

Optional: `OMNIROUTE_URL` / `OMNIROUTE_API` / `OMNIROUTE_MODEL` and `OLLAMA_*` (defaults point at the `llm-proxy` forwarder: `:11435 → 127.0.0.1:11434` for Ollama, `:20129 → 127.0.0.1:20128` for OmniRoute), SMTP variables for real email delivery, OAuth client credentials (callback URLs: `https://<domain>/api/auth/oauth/google/callback` and `.../github/callback`).

Upload it to the instance — **compose reads `.env` from the project directory**, so place it as `/opt/ryuksaidso/.env`:

```bash
scp .env.production <user>@<host>:/opt/ryuksaidso/.env
```

Keep `.env.production` as your local source of truth; the name on the server must be `.env` (or you must pass `--env-file` to every compose command, which the workflow does not do).

## 5. GitHub repository secrets and variables

Repository → Settings → Secrets and variables → Actions:

**Secrets**

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub user/org that receives `ryuksaidso-api/web/worker` |
| `DOCKERHUB_TOKEN` | Docker Hub access token (write scope) |
| `EC2_HOST` | Instance public IP or DNS name |
| `EC2_USER` | SSH user (`ubuntu`, `ec2-user`, …) |
| `EC2_PORT` | SSH port (`22` unless you changed it) |
| `EC2_SSH_KEY` | Private half of the deploy key (single line, PEM/OpenSSH format) |

Generate the deploy key pair once:

```bash
ssh-keygen -t ed25519 -C github-deploy -N "" -f deploy_key
cat deploy_key          # -> EC2_SSH_KEY secret (entire private key, newlines preserved)
cat deploy_key.pub      # -> append to the instance:
```

On the instance:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat >> ~/.ssh/authorized_keys   # paste deploy_key.pub, Ctrl-D
chmod 600 ~/.ssh/authorized_keys
```

**Variables**

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<domain>/api` | Optional; baked into the **web image at build time** as a Docker build-arg. Set it before the first push to `main`, otherwise the image defaults to `http://localhost:4001/api` and the browser will call the wrong origin. |

## 6. First deploy

Two ways:

**Automatic** — push to `main`. `ci.yml` (lint/typecheck/test/build/compose+nginx validation) and `docker.yml` (build + push images tagged `sha-<full commit>`, branch, semver and `latest`) run; a successful Docker workflow then triggers `deploy.yml`.

**Manual** — Actions → Deploy → Run workflow, with input `tag` (e.g. `latest`, `sha-<full commit>` or a version).

What the workflow does on the server:

1. `mkdir -p /opt/ryuksaidso` and untars `docker-compose.prod.yml`, `docker-compose.tls.yml`, `infra/` into it.
2. Exports `IMAGE_TAG=<sha-<commit> | your tag>`, then `docker compose -f docker-compose.prod.yml pull migrate api worker web`.
3. `docker compose -f docker-compose.prod.yml up -d --remove-orphans`, then `nginx -s reload`.
4. **Health gate**: polls `http://127.0.0.1/healthz` (nginx) **and** `http://127.0.0.1/health` (API) up to 36 × 5 s.
5. On success: writes the tag to `/opt/ryuksaidso/.last-good-tag` and prints `docker compose ps`.
6. On failure: dumps `--tail=200` logs, sets `IMAGE_TAG` back to `.last-good-tag` and runs `up -d` again (**automatic rollback**), then fails the workflow.

Verify manually over SSH:

```bash
cd /opt/ryuksaidso
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/health
curl -fsS http://127.0.0.1/ready | head -c 400
curl -fsS http://127.0.0.1/metrics | head
```

Note: `/ready` returns `503` until at least one LLM provider (Ollama on the host or an OmniRoute URL) is reachable through `llm-proxy`. The deploy gate only needs `/healthz` and `/health`, so a missing model runtime does not block a deploy — runs will simply fail until a provider is configured.

## 7. Subsequent automatic deploys

Nothing to configure. Every push to `main`:

`CI` → `Docker` (push images) → `Deploy` (sync files, pull, restart, health gate, record/rollback).

Concurrency is serialized by the `production-deploy` group (no overlapping deploys). For a specific release, run the Deploy workflow manually with `tag=sha-<commit>`.

## 8. TLS certificate (certbot) with docker-compose.tls.yml

Do this once HTTP works (`http://<domain>` reachable on port 80 and DNS pointing at the instance).

```bash
cd /opt/ryuksaidso
set -a; source .env; set +a

docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --profile tls \
  run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email you@example.com --agree-tos --no-eff-email

docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --profile tls up -d
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml exec nginx nginx -t
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml exec nginx nginx -s reload
curl -fsSI https://$DOMAIN/ | head -1
```

What the overlay does (`docker-compose.tls.yml`):

- mounts `infra/nginx/conf.d/tls-redirect.conf` as the port-80 vhost: ACME webroot + `301` everything else to HTTPS;
- mounts `infra/nginx/conf.d/tls.conf.template`, which nginx renders with `${DOMAIN}` / `${CERT_NAME}` into the port-443 vhost (TLS 1.2/1.3, HSTS, same proxy rules, `/metrics` restricted to loopback/RFC1918);
- adds the `certbot` service (profile `tls`) whose entrypoint renews via `certbot renew --webroot` every 12 hours using the shared `certbot-certs` volume.

From then on run all stack commands with **both** `-f` files (and `--profile tls` when you need certbot):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml ps
```

**Automated deploys are TLS-aware.** Before touching the stack, `deploy.yml` inspects the running `nginx` container: when it is mounted with `infra/nginx/conf.d/tls.conf.template` (the overlay is active), every compose command in the workflow runs with **both** `-f` files, it exports `COMPOSE_PROFILES=tls` so the `certbot` container is kept instead of being removed as an orphan, and the health gate probes `https://127.0.0.1/healthz` and `https://127.0.0.1/health` (with `curl -k`). Otherwise it uses the base file and gates over HTTP. Certificates live in the `certbot-certs` volume, so they are never touched by a deploy.

Manual commands still need both files:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml --profile tls up -d --remove-orphans
```

## 9. Scaling with API_REPLICAS

`/opt/ryuksaidso/.env`:

```env
API_REPLICAS=3
WORKER_REPLICAS=1
WORKER_CONCURRENCY=4
```

Apply:

```bash
cd /opt/ryuksaidso
set -a; source .env; set +a
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate api
docker compose -f docker-compose.prod.yml ps
```

nginx load-balances with round-robin: the `api_backend` upstream resolves the `api` service name through Docker's DNS, which returns one A record per replica, with `proxy_next_upstream error timeout http_502 http_503 http_504`. Worker scaling uses `WORKER_REPLICAS` (all replicas consume the same `agent-runs` BullMQ queue). Every deploy re-applies the replica counts automatically.

## 10. Logs and metrics access

```bash
cd /opt/ryuksaidso

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=200 api
docker compose -f docker-compose.prod.yml logs -f --tail=200 worker web nginx
docker compose -f docker-compose.prod.yml logs migrate          # Prisma migrate output
```

Metrics:

- `curl http://127.0.0.1/metrics` — Prometheus text format; nginx allows only `127.0.0.1` and `172.16.0.0/12`, so scrape it from the instance (or an internal network), never from the public internet.
- Key series: `ryuksaidso_http_requests_total`, `ryuksaidso_http_request_duration_seconds`, `ryuksaidso_agent_runs_total`, `ryuksaidso_agent_duration_seconds`, plus Node default metrics under the `ryuksaidso_` prefix (queue/job behaviour is derived from run counters and BullMQ state in Redis).
- Structured JSON application logs go to stdout (collected by Docker), and with the observability profile Promtail ships container logs to Loki.
- Alert candidates if you add an external pipeline: sustained 5xx on `/api`, `/ready` returning 503 for more than a minute, `ryuksaidso_agent_runs_total{status="failed"}` growing, p95 `ryuksaidso_http_request_duration_seconds` above ~2 s, and BullMQ job failures/retries in Redis.

Optional observability stack (Prometheus, Grafana, Loki, Promtail):

```bash
cd /opt/ryuksaidso
set -a; source .env; set +a
docker compose -f docker-compose.prod.yml --profile observability up -d
```

Grafana listens on `127.0.0.1:3001` only; reach it through an SSH tunnel:

```bash
ssh -N -L 3001:localhost:3001 <user>@<host>
# then open http://localhost:3001 (user from GRAFANA_ADMIN_USER, password GRAFANA_ADMIN_PASSWORD)
```

Prometheus and Loki publish no host ports; query them with `docker compose exec`, e.g.:

```bash
docker compose -f docker-compose.prod.yml exec prometheus wget -qO- http://localhost:9090/-/healthy
```

## 11. Health endpoints

| Endpoint | Served by | Purpose |
|---|---|---|
| `GET /healthz` | nginx (static `200 ok`) | Proxy liveness; first half of the deploy health gate |
| `GET /health` | API | Liveness, no dependencies touched; second half of the gate, also the API container healthcheck |
| `GET /ready` | API | Postgres + Redis + LLM provider readiness (bounded 2 s probes); `503` if nothing is reachable |
| `GET /metrics` | API via nginx | Prometheus scrape target (private ranges only) |

The API container healthcheck hits `:4001/health`; nginx only starts after the API is healthy and the `migrate` job has completed successfully.

## 12. Backup and restore of the PostgreSQL volume

The compose project name is `ryuksaidso`, so the database volume is `ryuksaidso_postgres_data`.

Logical dump (safe while running):

```bash
cd /opt/ryuksaidso
mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U ryuksaidso -d ryuksaidso --clean --if-exists --no-owner \
  | gzip > backups/ryuksaidso_$(date +%Y%m%d_%H%M%S).sql.gz
```

Restore:

```bash
gunzip -c backups/ryuksaidso_20260930_120000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U ryuksaidso -d ryuksaidso
```

Cold volume copy (consistent; stops writers first):

```bash
cd /opt/ryuksaidso
docker compose -f docker-compose.prod.yml stop api worker
docker run --rm -v ryuksaidso_postgres_data:/data -v "$PWD/backups":/backup \
  alpine tar czf /backup/pg_volume_$(date +%F).tgz -C /data .
docker compose -f docker-compose.prod.yml start api worker
```

Restore a cold copy by extracting into the volume with the stack stopped:

```bash
docker compose -f docker-compose.prod.yml stop api worker migrate
docker run --rm -v ryuksaidso_postgres_data:/data -v "$PWD/backups":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/pg_volume_2026-09-30.tgz -C /data"
docker compose -f docker-compose.prod.yml up -d
```

Schedule dumps with cron and copy them off the instance (S3 or similar) — the volume lives on the root disk and dies with the instance otherwise.

## 13. Rollback behaviour

- Each healthy deploy writes the running tag to `/opt/ryuksaidso/.last-good-tag`.
- If a deploy fails its health gate, the workflow automatically re-runs `up -d` with the previous good tag and fails the run, so the instance keeps serving the last working release.
- Manual rollback to any previously pushed tag:

```bash
cd /opt/ryuksaidso
export IMAGE_TAG=sha-<previous commit>
docker compose -f docker-compose.prod.yml pull migrate api worker web
docker compose -f docker-compose.prod.yml up -d --remove-orphans
curl -fsS http://127.0.0.1/health && curl -fsS http://127.0.0.1/healthz
echo "$IMAGE_TAG" > .last-good-tag
```

- Or trigger the Deploy workflow manually with `tag=sha-<previous commit>`.
- Database migrations are forward-only (`prisma migrate deploy`); rollbacks that need a schema downgrade require restoring a dump (section 12).

## 14. Troubleshooting

**`Error: ... Set POSTGRES_PASSWORD` (or `JWT_SECRET` / `CORS_ORIGIN` / `DOCKERHUB_USERNAME`)**
Compose interpolation failed: `/opt/ryuksaidso/.env` is missing or incomplete. Recreate it from section 4 and re-run.

**Deploy workflow fails at "Configure SSH" / `Permission denied (publickey)`**
`EC2_SSH_KEY`, `EC2_USER` or `EC2_PORT` is wrong, or `deploy_key.pub` is not in the instance's `~/.ssh/authorized_keys` for that user. Test locally: `ssh -i deploy_key -p 22 <user>@<host> true`.

**Deploy fails at "Sync release files"**
Wrong `EC2_HOST` or security group blocking port 22 from GitHub's runners.

**Health gate fails, workflow red**
The workflow already rolled back. Inspect on the instance:

```bash
cd /opt/ryuksaidso
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=200 migrate api web nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -t
```

Common causes: `migrate` failing (bad `DATABASE_URL`/`POSTGRES_PASSWORD`), `api` crash-looping (invalid `JWT_SECRET`/`CORS_ORIGIN`), image pull errors (wrong `DOCKERHUB_USERNAME` or missing `docker login` for private repos).

**`502 Bad Gateway` from nginx**
No healthy API replica. `docker compose -f docker-compose.prod.yml ps` shows the API healthcheck state; check logs. Reload nginx config after manual edits: `docker compose -f docker-compose.prod.yml exec nginx nginx -t && ... exec nginx nginx -s reload`.

**`/ready` returns 503**
No LLM provider reachable. Verify the forwarder and the host runtime:

```bash
curl -fsS http://127.0.0.1:11435/v1/models     # Ollama through llm-proxy
curl -fsS http://127.0.0.1:20129/v1/models     # OmniRoute through llm-proxy
docker compose -f docker-compose.prod.yml logs llm-proxy
```

Then configure/verify the workspace provider in **Settings → Model provider**.

**HTTPS nginx fails to start right after enabling the TLS overlay**
The certificate does not exist yet or `${DOMAIN}`/`${CERT_NAME}` are unset. Check `docker compose ... logs nginx` and re-run the certbot command in section 8; `nginx -t` prints the missing file path.

**HTTPS stopped working right after a push**
The workflow keeps the TLS overlay in sync, so this should not happen. It means nginx was recreated with the plain HTTP config outside the workflow (e.g. a manual `docker compose -f docker-compose.prod.yml up -d`). Re-apply the overlay with the `up -d` command from section 8, then confirm `curl -fsSI https://$DOMAIN/`; the next deploy detects the overlay from the running container again.

**Certificate renewal**
The `certbot` service renews every 12 h through the shared volume; after a renewal nginx needs a reload (`docker compose ... exec nginx nginx -s reload`). If `DOMAIN` changes, obtain a new certificate and update `CERT_NAME`.

**Port 80/443 already in use**
Stop the conflicting service (`sudo ss -ltnp | grep -E ':80|:443'`), typically a pre-installed Apache/nginx.

**Email not sent (invites, verification, password reset)**
SMTP variables are empty. In production the API logs the failure instead of writing the URL to stdout for resets; set `SMTP_*` and `EMAIL_FROM` in `.env` and restart the API.

**Rate limited (429 `RateLimitExceeded`)**
Application limits are `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` (default 600/min) plus stricter credential buckets; nginx additionally enforces 5 r/s on `/api/auth/` and 30 r/s on `/api/`. Raise `RATE_LIMIT_MAX` in `.env` if the instance sits behind a shared NAT.

**CSRF validation failures (403) from the browser**
Cookie-authenticated mutations need `x-csrf-token` matching the `ryuksaidso_csrf` cookie. Check that `CORS_ORIGIN` matches the origin the browser actually uses, that `FRONTEND_URL`/`CORS_ORIGIN` are `https://` on the TLS overlay, and that `COOKIE_SAME_SITE` is compatible (`none` requires an `https://` `FRONTEND_URL` — the API config refuses to boot otherwise; `lax` is the default and works for same-site deployments).

**Database/Redis connection failures on boot**
Verify `POSTGRES_PASSWORD`/`JWT_SECRET` in `.env` (compose aborts with a `Set ...` error when missing), `docker compose ... logs migrate`, and that `DATABASE_URL` uses the alphanumeric password from section 4.

---

# Appendix A — LLM routing

RYUKSAIDSO supports two OpenAI-compatible providers. The workspace default is selected under **Settings → Model provider**, and every `AgentRun` stores the provider used so historical traces stay reproducible.

```env
OMNIROUTE_URL=http://localhost:20128/v1
OMNIROUTE_API=<your Omniroute API key>
OMNIROUTE_MODEL=<model id>

OLLAMA_URL=http://localhost:11434/v1
OLLAMA_API=ollama
OLLAMA_MODEL=qwen2.5-coder:3b-instruct-q4_K_M
DOCKER_RUNTIME=true
```

Docker containers automatically translate a localhost provider URL to `host.docker.internal` for the API and worker. The browser does not call the model provider directly.

Because Ollama only binds `127.0.0.1:11434`, containers cannot dial it directly —
loopback is unreachable from the bridge network. The stack ships a tiny forwarder
(`llm-proxy`, `infra/llm-proxy.js`, host networking) that exposes it to containers:

| Provider | Host (npm run dev) | From containers (compose) |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | `http://host.docker.internal:11435/v1` → 127.0.0.1:11434 |
| OmniRoute | `http://localhost:20128/v1` | `http://host.docker.internal:20129/v1` → 127.0.0.1:20128 |

These are set by `OLLAMA_URL_DOCKER` / `OMNIROUTE_URL_DOCKER` in `.env` (production compose defaults `OLLAMA_URL` / `OMNIROUTE_URL` directly to the forwarder). The
per-organization model (`Organization.ollamaModel`, editable via `PATCH /api/llm`)
is what runs actually execute with; the env value is only the fallback.

# Appendix B — Password recovery

Set SMTP variables before enabling public password recovery:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp user>
SMTP_PASSWORD=<smtp password>
EMAIL_FROM=RYUKSAIDSO <no-reply@example.com>
```

Reset tokens are single-use, hashed at rest, expire after 30 minutes, and revoke existing sessions after a successful reset. The forgot-password endpoint returns the same response for known and unknown emails to reduce account enumeration.

In development, when SMTP is not configured, the API logs the generated reset URL so the complete flow can still be tested locally.

# Appendix C — Google / GitHub OAuth

```env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=https://<domain>/api/auth/oauth/google/callback

GITHUB_CLIENT_ID=<client id>
GITHUB_CLIENT_SECRET=<client secret>
GITHUB_REDIRECT_URI=https://<domain>/api/auth/oauth/github/callback
```

Register the exact callback URLs on the provider apps (locally: `http://localhost:4001/api/auth/oauth/{google,github}/callback`). OAuth flows use PKCE with a Redis-stored 10-minute state and redirect back to `/auth/callback` (success) or `/auth/error?reason=...` (failure).

# Appendix D — Admin surface

Two independent RBAC layers exist:

- **System RBAC** — `User.userRole` (`ADMIN` | `USER`). Only system admins get the
  **Admin** navigation item; they also unlock the platform routes gated by
  `requireAdmin` (`GET /api/admin/users`, `PATCH /api/admin/users/:userId/role`), which API keys cannot use.
- **Workspace RBAC** — `Membership.role` (`OWNER`/`ADMIN`/`AGENT`/`VIEWER`).
  `OWNER` and `ADMIN` members manage invites and member roles from **Settings**,
  matching `requireRole(['OWNER','ADMIN'])` on the API. The remaining `/api/admin/*`
  routes accept workspace owners/admins or a system admin.

The first system admin is bootstrapped with the `SYSTEM_ADMIN_EMAILS` allowlist
(comma-separated emails in `.env`): listed accounts are promoted to `ADMIN` at
sign-in, refresh and on every `/me` call. The allowlist only promotes — explicit
grants/revocations through `PATCH /api/admin/users/:userId/role` stay authoritative.
Leave it empty to disable auto-promotion entirely.

The admin dashboard (`GET /api/admin/overview`) includes:

- 14-day run volume
- completed vs failed reliability mix
- token usage and average latency
- pending approvals and document counts
- top agents
- recent executions with trace navigation
- member role management and removal
- model-routing visibility
- live Postgres/Redis/LLM health probes
- recent audit events

`GET /api/admin/runs` and `GET /api/admin/audit` back operational tooling.

# Appendix E — Security controls

The application includes HTTP-only session cookies, rotating refresh sessions, CSRF double-submit protection, workspace-scoped bearer API keys, two-layer RBAC, rate limits (application + nginx), password reset token hashing, tenant-scoped queries, policy-gated tool execution, human approval gates, audit logs, health/readiness endpoints, Prometheus metrics, and an nginx edge with request limits and private-range-only `/metrics`.

This runbook covers TLS, backups and health gating; a public deployment should still add a secret manager, managed PostgreSQL/Redis, off-instance backups and an external alerting pipeline (see README → Production deployment overview).
