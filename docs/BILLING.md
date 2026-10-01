# Billing and subscriptions

RYUKSAIDSO ships a complete subscription system backed by **Cashfree** (UPI, Google Pay, PhonePe, Paytm, cards and net banking) with recurring monthly/yearly mandates, webhook-driven state, plan-based entitlements and a system-admin billing dashboard.

## TL;DR

```bash
BILLING_PROVIDER=cashfree
CASHFREE_CLIENT_ID=xxx            # Cashfree dashboard → credentials
CASHFREE_CLIENT_SECRET=xxx
CASHFREE_WEBHOOK_SECRET=xxx       # optional — falls back to the client secret
CASHFREE_ENVIRONMENT=sandbox      # sandbox | production
BILLING_CURRENCY=INR
BILLING_RETURN_URL=               # optional — defaults to FRONTEND_URL + /settings?billing=checkout
```

Nothing is required to run the product: with no credentials configured (or with the global toggle off, the default) billing is **bypassed** and every workspace keeps full access.

## Concepts

| Piece | What it is |
| --- | --- |
| `BillingPlan` | A plan row (`free`, `starter`, `pro`, `business`) with prices in **paise** and limits (`0` = unlimited), `apiAccess`, `analyticsAccess`, `features[]`. |
| `BillingSubscription` | One org's subscription: local id + `providerSubscriptionId`, status, period, `currentPeriodEnd`, `cancelAtPeriodEnd`, settle bookkeeping (`canceledAt`/`endedAt`). |
| `BillingCustomer` | Local per-org billing contact (name/email/phone used for the mandate). `providerCustomerId` is derived as `ws_<organizationId>`. |
| `BillingPayment` | Provider payment rows keyed by `providerPaymentId`, amounts in paise, status (`CREATED/AUTHORIZED/CAPTURED/FAILED/REFUNDED`), method, failure reason, invoice number. |
| `BillingWebhookEvent` | Idempotency ledger — unique `eventId`, payload, status (`RECEIVED/PROCESSED/IGNORED/FAILED`), error. |
| `BillingUsage` | Per-org monthly usage counters (`apiRequests`, …) keyed by `organizationId_periodKey`. |
| `BillingSetting` | Singleton row `id='global'` with `billingEnabled` (default **false** = bypass). |

Default plans (seeded on first use by `ensureBillingPlans()`):

| Plan | Monthly | Yearly | Agents | Members | Tickets/mo | Runs/mo | API keys | API | Analytics |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Free | ₹0 | ₹0 | 2 | 3 | 50 | 100 | 1 | ✗ | ✗ |
| Starter | ₹499 | ₹4,990 | 10 | 10 | 500 | 1,000 | 5 | ✓ | ✓ |
| Pro | ₹1,999 | ₹19,990 | 50 | 25 | 5,000 | 20,000 | 25 | ✓ | ✓ |
| Business | ₹4,999 | ₹49,990 | ∞ | ∞ | ∞ | ∞ | ∞ | ✓ | ∞ |

## Checkout flow

1. `POST /api/billing/checkout { planCode, period: MONTHLY|YEARLY, phone }` creates (or reuses a recent `CREATED`) local subscription `sub_<uuid>`, ensures the Cashfree plan exists (`POST /pg/plans`, deterministic id `ryu_<code>_<m|y><amountPaise>`, so price edits get a new plan id) and creates the remote subscription with `customer_details` + `plan_details`.
2. The API answers `{ mode: 'checkout', subsSessionId, subscriptionId, ... }`. The settings **Billing** section stores the `subscriptionId` in `sessionStorage`, loads `https://sdk.cashfree.com/js/v3/cashfree.js` and calls `cashfree.subscriptionsCheckout({ subsSessionId, redirectTarget: '_self' })`.
3. Cashfree redirects back to `BILLING_RETURN_URL` (default `FRONTEND_URL + /settings?billing=checkout` → the dashboard opens the Settings tab).
4. On return the client `POST /api/billing/checkout/verify { subscriptionId }`, which fetches the subscription + payments from Cashfree, settles previous subscriptions and reports the status. **Webhooks remain the source of truth** — verification only speeds up the UX.
5. Cashfree then auto-charges the PERIODIC plan each cycle (`plan_max_cycles` = 120 months / 10 years) and calls the webhook on every transition.

A paid checkout requires a **10-digit Indian mobile number** (collected in the checkout step) because the mandate needs it; switching to the Free plan needs none.

## Webhooks

- Endpoint: `POST /api/billing/webhook` — CSRF-exempt, raw body captured by `express.json({ verify })`.
- Signature: `Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, clientSecret))`, compared with `timingSafeEqual`. Bad signature → `401`.
- Idempotency: `x-idempotency-header` (hashed) or the SHA-256 of the raw body is the `eventId`; duplicates → `200` without reprocessing, `FAILED` rows are reprocessed (gateway retries).
- Handled events: `SUBSCRIPTION_STATUS_CHANGED`, `SUBSCRIPTION_AUTH_STATUS`, `SUBSCRIPTION_PAYMENT_{NOTIFICATION_INITIATED,SUCCESS,FAILED,CANCELLED}`, `SUBSCRIPTION_REFUND_STATUS`. Everything else is acknowledged with `200 ignored`.
- Status mapping: `initialized→CREATED`, `bank_approval_pending→PENDING`, `active→ACTIVE`, `on_hold→HALTED`, `paused/customer_paused→PAUSED`, `completed→COMPLETED`, `cancelled/customer_cancelled→CANCELLED`, `expired/link_expired/card_expired→EXPIRED`. Payments: `success→CAPTURED`, `authorized→AUTHORIZED`, `failed/flagged/cancelled→FAILED`, `refunded/partially_refunded→REFUNDED`, `initialized/processing→CREATED`.
- Response codes: `200` processed/ignored/duplicate, `401` bad signature, `400` missing raw body or unparseable type, `500` processing failure (Cashfree retries).

## Entitlements and enforcement

`resolveBilling(orgId)` returns `{ enforced, planCode, limits, subscription }`:

- **Global bypass**: `BillingSetting.billingEnabled === false` (default) → `enforced: false`, unlimited.
- **Entitled subscription**: `ACTIVE`, `PENDING` (bank approval grace), or `PAUSED && cancelAtPeriodEnd && currentPeriodEnd` in the future (cancel-at-period-end grace). Everything else falls back to the Free plan.
- **Fail-open**: any error reading the billing tables logs and bypasses limits (a billing outage never bricks the product).
- `assertQuota(org, feature, current)` / `assertEntitled(resolved, feature)` / `assertApiAccessAllowed(org)` throw `402 { error: 'PaymentRequired' }` (handled by the error handler's 402 branch).

Enforcement points:

| Feature | Route |
| --- | --- |
| Agents | `POST /api/control/agents` |
| Tickets / month | `POST /api/tickets` |
| Runs / month | `POST /api/control/runs`, `POST /api/tickets/:id/run` |
| Members (incl. pending invites) | `POST /api/account/workspace/invitations` |
| API keys + API access | `POST /api/account/api-keys`; every `rsk_` API-key request is checked in `requireAuth` (402 without `apiAccess`) and counted into `BillingUsage` |
| Analytics | `GET`/`POST /api/evaluations` (402 → the Evaluations tab shows an upgrade banner) |

Validation always runs **before** quota checks, and 404/409 checks run **before** 402, so existing error semantics are preserved.

## Plan changes, cancellation, failed payments

- **Upgrade / plan change**: the previous subscription is left alone at checkout time. When the new subscription turns `ACTIVE` (verify endpoint or `SUBSCRIPTION_STATUS_CHANGED` webhook), `settlePreviousSubscriptions()` pauses each older `ACTIVE/PENDING` subscription remotely at the cycle end and marks it `PAUSED` + `cancelAtPeriodEnd` (or terminal if the provider ended it). Failures are logged per subscription and never block the new plan.
- **Cancel at period end** (`mode: 'at_period_end'`, default): Cashfree has no native cancel-at-cycle-end, so the subscription is remotely **PAUSE**d — no further charges, entitlement continues until `currentPeriodEnd` via the grace rule.
- **Cancel now** (`mode: 'immediate'`): remote **CANCEL**; the provider returning neither `PAUSED` nor a terminal status raises `502`.
- **Downgrade to Free**: immediate cancel.
- **Failed payments**: webhook records the `FAILED` payment with its reason; the subscription status flows from the provider (`HALTED`/`PENDING` etc.) and entitlement follows the rules above. Reauthorization happens on the Cashfree side; once the provider reports `ACTIVE`, access resumes automatically.
- **Refunds**: `SUBSCRIPTION_REFUND_STATUS` marks the matching payment `REFUNDED`.

## Admin dashboard (system admins only)

`Admin → Billing` (UI) calls `/api/admin/billing/*`, every endpoint audited:

- `GET /overview` — status counts, MRR (yearly plans divided by 12), payment totals, webhook stats.
- `GET|POST /plans`, `PATCH /plans/:id`, `DELETE /plans/:id` — price edits clear the stored Cashfree plan id (forcing re-creation with the new deterministic id); deleting is refused for the default plan or plans with subscriptions (deactivate instead).
- `GET /subscriptions?status=`, `POST /subscriptions/:id/action { action: cancel|sync }`, `PATCH /subscriptions/:id { status }` — remote cancel/sync through the provider or a manual status override.
- `GET /payments`, `GET /webhooks` — gateway history for support.
- `GET|PUT /settings` — the **global enforcement toggle** (`billingEnabled`). Off = full-access bypass, on = limits active.

## Public pricing

`GET /api/billing/plans` is public (no auth) and feeds the standalone `/pricing` page plus the landing-page nav. It exposes plan definitions only — no org or customer data.

## Provider abstraction (adding Stripe later)

All gateway code sits behind `services/billing/types.ts`:

```ts
interface BillingProvider {
  name: string;
  isConfigured(): boolean;
  checkoutEnvironment(): 'sandbox' | 'production';
  ensurePlan(input): Promise<string>;
  createSubscription(input): Promise<ProviderSubscription>;
  getSubscription(id): Promise<ProviderSubscription>;
  cancelSubscription(id, atCycleEnd: boolean): Promise<ProviderSubscription>;
  listSubscriptionPayments(id): Promise<ProviderPayment[]>;
  verifyWebhookSignature(rawBody, signature, timestamp): boolean;
}
```

`services/billing/index.ts` picks the implementation from `BILLING_PROVIDER` (currently only `cashfree`). Database columns are provider-neutral (`providerCustomerId`, `providerSubscriptionId`, `providerPlanMonthly/Yearly`, `providerPaymentId`, `providerOrderId`), so a Stripe provider only needs a new module implementing the interface plus a webhook adapter — routes, entitlements and the admin dashboard stay untouched.

## Observability

- Prometheus: `billing_events_total`, `billing_entitlement_denials_total`, `billing_webhook_duration_seconds` (all visible in the admin Observability pages).
- Billing errors are logged through the structured logger → ring buffer → admin Logs page.
- Every admin billing action and every checkout/cancel writes to the audit log (`billing.checkout_created`, `admin.billing_settings_updated`, …).

## Security notes

- Credentials live only in backend env vars (`CASHFREE_*`); the browser only ever receives the hosted-checkout session id.
- The webhook route is the only CSRF-exempt billing route and requires a valid HMAC over the raw body.
- Amounts are integers in paise end to end; prices cannot be negative and are validated by zod.
- The enforcement toggle, plan edits and subscription overrides require a **system ADMIN** session (DB-resolved on every request — API keys can reach them only if their owner is a system admin).
