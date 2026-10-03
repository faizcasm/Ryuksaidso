# Integrations platform

## TL;DR

Ryuksaidso connects to the tools your team already uses. From **Integrations** in the dashboard you can:

- connect Teams and WhatsApp Business with a stored token and GitHub over OAuth today; Gmail, Outlook, Slack, Google Drive, Notion, Jira, Linear, HubSpot, Shopify and Telegram Bot show as "unconfigured — working on it" cards until their setup lands,
- sync Drive/Notion/GitHub content into the knowledge base automatically,
- embed an AI chat widget on your website with one `<script>` tag,
- send signed outbound webhooks to Zapier, Make, n8n or your own service,
- watch agent tool-call history, connection logs and delivery health in one place.

Platform administrators get a master switch and per-provider kill switches (Admin → Integrations). Nothing third-party can be contacted while the platform switch is off.

## Concepts

| Term | What it means |
|---|---|
| **Provider** | A catalogue entry (16 of them) describing auth type, OAuth endpoints, env keys, agent tools, events and knowledge support. |
| **Connection** | One `(organizationId, provider)` row holding AES-256-GCM encrypted tokens, status, scopes and health timestamps. |
| **Knowledge source** | A Drive folder, Notion database or GitHub repo path that is periodically pulled into `Document`s. |
| **Chat widget** | A per-workspace public key + loader script that turns any website into an agent front end. |
| **Webhook endpoint** | A URL you own that receives signed JSON for the events you subscribe to. |
| **Integration log** | An append-only record of connects, disconnects, syncs and token-refresh failures. |

## Provider matrix

| Provider | Auth | Agent tools | Knowledge sync | Env keys |
|---|---|---|---|---|
| Gmail | OAuth2 | search/read/send email | — | `GOOGLE_CLIENT_ID/SECRET` |
| Google Drive | OAuth2 | read/search files | ✓ | `GOOGLE_CLIENT_ID/SECRET` |
| Outlook | OAuth2 | read/send mail | — | `MICROSOFT_CLIENT_ID/SECRET` |
| Slack | OAuth2 | list channels, send messages | — | `SLACK_CLIENT_ID/SECRET` |
| Microsoft Teams | token (webhook URL, https-only) | send messages | — | — |
| WhatsApp Business | token (access token + phone number id) | send messages | — | — |
| Telegram Bot | token (bot token) | — (coming soon) | — | — |
| Notion | OAuth2 | search/append pages | ✓ | `NOTION_CLIENT_ID/SECRET` |
| GitHub | OAuth2 (env `GITHUB_TOKEN` fallback) | repo, issues, PRs, file tree | ✓ | `GITHUB_CLIENT_ID/SECRET`, `GITHUB_TOKEN` |
| Jira | OAuth2 (Atlassian) | issues search/create/update | — | `ATLASSIAN_CLIENT_ID/SECRET` |
| Linear | OAuth2 | issues search/create/update | — | `LINEAR_CLIENT_ID/SECRET` |
| HubSpot | OAuth2 | contacts/companies/deals | — | `HUBSPOT_CLIENT_ID/SECRET` |
| Shopify | OAuth2 (store-domain templated) | products/orders | — | `SHOPIFY_CLIENT_ID/SECRET` |
| Zapier / Make / n8n | webhook preset | — (creates an endpoint) | — | — |

Providers flagged `comingSoon` in the catalog (Gmail, Outlook, Slack, Google Drive, Notion, Jira, Linear, HubSpot, Shopify and Telegram Bot) render with an "Unconfigured — working on it. Will be configured soon." badge and a disabled **Coming soon** button; their setup hints and callback URLs stay hidden until they are configured.

Every OAuth provider additionally needs its redirect URI registered: `<API origin>/api/integrations/<provider>/callback` (set `API_PUBLIC_URL` to pin the origin). Until it is registered the provider rejects the consent redirect with `400 redirect_uri_mismatch` — each marketplace card prints the exact callback URL with a copy button so you can paste it into the provider console first.

## OAuth connect flow

1. `POST /api/integrations/connections/<provider>/connect` (OWNER/ADMIN) writes a signed state record into Redis (`int:state:<nonce>`, 10-minute TTL) holding the workspace, user, provider and PKCE verifier.
2. The browser follows the provider's authorize URL; after consent the public `GET .../callback` exchanges the code (credentials in the body for Google/Microsoft/Slack/etc., HTTP Basic for Notion), maps the profile, and upserts the connection with encrypted tokens.
3. The API writes an `integration.connected` log, emits the `integration.connected` webhook event and redirects to `/dashboard?connected=<provider>` (or `?connect_error=<reason>`), where the dashboard shows a toast and opens Integrations.

Token refresh runs lazily with a 120-second skew; refresh failures degrade the connection to `ERROR`/`EXPIRED` and land in the activity log. The **worker** also refreshes during knowledge syncs, which is why it needs `JWT_SECRET` and the client id/secret pairs.

Token-type providers skip OAuth: Teams stores an incoming-webhook URL (must be https), WhatsApp stores an access token plus phone-number id. Both are encrypted the same way.

## Knowledge sync

- Sources are created under Integrations → Knowledge sync with a provider, name, remote path (`owner/repo[:path]`, folder id, database id) and an auto-sync flag.
- A worker sweep runs every 15 minutes and re-syncs sources whose `lastSyncAt` is older than 15 minutes while the platform switch is on.
- Syncs upsert `Document`s keyed by source metadata, so re-syncs are idempotent (`created`/`updated`/`unchanged` counts).
- Manual **Sync now**, pause/resume and delete are available per source; failures set `status = ERROR` with `lastError` visible in the UI.
- Drive/Notion need the matching connection (or `GITHUB_TOKEN` for repositories when no GitHub connection exists).

## Chat widget

- The loader script `GET /api/widget.js` renders a shadow-DOM bubble; paste `<script src="https://<api>/api/widget.js" data-key="wgt_..." async></script>` before `</body>`.
- Config (title, greeting, accent, agent, email capture, allowed origins) is edited in Integrations → Chat widget; regenerating the key breaks old embeds until you update them.
- Messages create a session and a `trigger: 'widget'` agent run; the browser polls the session until `output.answer` materializes as the assistant reply. The quota check (`402`) happens before anything is persisted.
- Origin allow-lists are enforced server-side (empty list = any site); the route is CSRF-exempt and rate-limited to 120 messages/min/IP.
- First visitor message emits `widget.conversation_started`.

## Outbound webhooks

- Endpoints subscribe to events from the public catalog: `ticket.created`, `run.completed`, `run.failed`, `approval.approved`, `approval.rejected`, `document.created`, `integration.connected`, `integration.disconnected`, `member.invited`, `widget.conversation_started`, `webhook.test`.
- Every delivery is signed: `x-ryuksaidso-event`, `x-ryuksaidso-delivery`, `x-ryuksaidso-timestamp` and `x-ryuksaidso-signature: sha256=<hex>` where the digest is `HMAC-SHA256(secret, "<timestamp>.<body>")`.
- The endpoint secret (`whsec_...`) is returned once at creation — store it to verify signatures.
- Deliveries attempt 3 times with backoff (0s/1s/4s), record status and errors, and can be retried manually; the worker sweeps stuck `PENDING` rows.
- Private/internal URLs are rejected to prevent SSRF; Zapier/Make/n8n presets pre-fill sensible defaults.

## Activity and health

- **Tool activity** lists every `Execute <tool>` step from the traces with duration, step status, run status and trigger.
- **Connection activity** shows the integration log (connects, disconnects, syncs, refresh failures).
- Connection cards show live status (`CONNECTED`, `DEGRADED`, `ERROR`, `EXPIRED`, `DISCONNECTED`) with a **Test** action that probes the provider and refreshes health timestamps.
- The admin overview adds platform-wide counts, 24-hour delivery success/failure and a cross-workspace error feed.

## Admin controls (system admins)

- `GET/PUT /api/admin/integrations/settings` — `{ enabled, disabledProviders[] }`.
- `enabled = false` (or a provider listed in `disabledProviders`) blocks connects, agent tools and knowledge syncs for **every** workspace; existing credentials stay encrypted at rest.
- Org-owned webhook endpoints and the chat widget are deliberately not affected by the master switch.
- Overview and logs endpoints resolve the system role from the database on every request (`403` otherwise); settings changes are audit-logged.

## Security notes

- Credentials are encrypted with AES-256-GCM; the key is derived from `JWT_SECRET` via `scrypt` — rotate `JWT_SECRET` only alongside a re-connect of all providers.
- No token ever appears in an API response, log line, audit record or webhook payload; connection summaries expose status and timestamps only.
- OAuth state is single-use, signed, expires in 10 minutes and is deleted on consumption.
- Widget requests are origin-checked, rate-limited and schema-validated; run quotas are enforced like any other trigger.
- Webhook targets must be public http(s) URLs — loopback and private hosts are refused.

## Environment reference

```bash
# OAuth clients (optional — providers without env keys show "not configured")
GOOGLE_CLIENT_ID=            GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=         MICROSOFT_CLIENT_SECRET=
SLACK_CLIENT_ID=             SLACK_CLIENT_SECRET=
NOTION_CLIENT_ID=            NOTION_CLIENT_SECRET=
ATLASSIAN_CLIENT_ID=         ATLASSIAN_CLIENT_SECRET=
LINEAR_CLIENT_ID=            LINEAR_CLIENT_SECRET=
HUBSPOT_CLIENT_ID=           HUBSPOT_CLIENT_SECRET=
SHOPIFY_CLIENT_ID=           SHOPIFY_CLIENT_SECRET=
GITHUB_CLIENT_ID=            GITHUB_CLIENT_SECRET=   GITHUB_TOKEN=

# Redirect origin for integration callbacks (defaults to the request host)
API_PUBLIC_URL=https://ryuksaidso.faizcasm.me
```

No env vars are required for Teams, WhatsApp, Zapier, Make or n8n. The chat widget, webhooks and knowledge sync work out of the box; the platform switch lives in the database (Admin → Integrations), not in the environment.
