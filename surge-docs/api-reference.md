# Endpoint Reference

All endpoints are relative to `https://surge.surge.sh` and require [token authentication](https://surge.sh/docs/api/authentication) unless noted. Errors mostly use the `{ messages, details }` shape described in the [overview](https://surge.sh/docs/api/).

Calling from JavaScript? The [SDK Method Reference](https://surge.sh/docs/sdk/reference) maps each endpoint to its method.

## Projects

| Method & path | Description |
|---------------|-------------|
| `PUT /:domain` | Deploy a gzipped tarball to the domain. Streaming—see [Deploys](https://surge.sh/docs/api/deploys). |
| `DELETE /:domain` | Tear the project down. `200` `{ "msg": "project removed" }`. |
| `GET /list` | All projects on the account. Array of `{ domain, rev, timeAgoInWords, … }`. (`planName` is a legacy per-project label; read the plan from `GET /account`.) |
| `GET /:domain/metadata.json` | Metadata for the live revision: revision id, deploy message, publisher email, file counts, sizes, and the project's active config. `GET /:domain/:rev/metadata.json` targets a specific revision. |
| `GET /:domain/manifest.json` | The file manifest—a map of path to `{ size, md5 }`. Also available per revision. |
| `DELETE /:domain/cache` | Purge the project from every edge node's cache. `200` `{ "confirmed": [...], "unconfirmed": [...] }`. |
| `POST /:domain/carry` | Upload dedupe: send the project's file list and checksums, get back the files the live revision lacks and a `carry-ticket` for the deploy. Optional—see [Deploys](https://surge.sh/docs/api/deploys#request). |
| `GET /:domain/status` | Where the domain stands: `{ status, action, https, reason, records }`. `status` is `waiting on dns`, `securing`, `ready` (a new account's `surge.sh` domain awaiting email verification), or `live`. |

## Revisions

Revision ids are millisecond timestamps (e.g. `1719852000000`). Each revision has its own preview URL, and the last 100 per domain are kept.

| Method & path | Description |
|---------------|-------------|
| `GET /:domain/list` | All revisions of the project: `{ rev, friendlySize, timeAgoInWords, publicFileCount, … }`. `404` if none. |
| `POST /:domain/rollback` | Point the domain at the previous revision. `201` `{ revision, former, instances }` when it moved, `200` when it was already there. |
| `POST /:domain/rollfore` | Point the domain at the next revision. Same responses. |
| `PUT /:domain/rev` | Cut over to the latest revision; `PUT /:domain/rev/:rev` to a specific one. |
| `DELETE /:domain/rev/:rev` | Discard a revision from the system. |

## Certificates

| Method & path | Description |
|---------------|-------------|
| `GET /:domain/certs` | Certificate information for the domain. |
| `PUT /:domain/encrypt` | Provision a managed certificate. Streaming NDJSON—see [Deploys](https://surge.sh/docs/api/deploys#certificates-over-the-same-stream). |
| `PUT /:domain/ssl` | Upload a custom PEM bundle. `Content-Type: application/x-pem-file`. Pro only. Always `200`; the outcome is the final `msg` line's `status`. |

## DNS

DNS endpoints apply to **apex domains** delegated to Surge's name servers; on other domains they respond `405`. Records take the form `{ type, name, value, priority }`.

| Method & path | Description |
|---------------|-------------|
| `GET /:domain/dns` | The custom records you've added. |
| `POST /:domain/dns` | Add a record. `400` on validation failure. |
| `DELETE /:domain/dns/:id` | Remove a record. |
| `GET /:domain/zone` | The full zone, including the records Surge manages automatically. |
| `POST /:domain/zone` | Add a zone record. |
| `DELETE /:domain/zone/:id` | Remove a zone record. |

## Collaborators

| Method & path | Description |
|---------------|-------------|
| `POST /:domain/collaborators` | Closed: orgs share domains now. Answers `200` with each email `"status": "not sent"` and what to do instead; nothing is sent. |
| `DELETE /:domain/collaborators` | Revoke collaborators invited before orgs. Body `{ "emails": [...] }`. `202` `{ "successes": [...], "fails": [...] }`. |

## Settings & analytics

| Method & path | Description |
|---------------|-------------|
| `PUT /:domain/settings` | Update the domain's settings. Body is a map of setting → value—`force` (`http`/`https`), `redirect` (a domain), `cors` (a domain or `*`), `hsts` (seconds), `private` (`true`/`false`), any of them `null` to clear; the response echoes the resulting configuration. |
| `GET /:domain/analytics` | Aggregated traffic analytics for the past 14 days: visits, uniques, connections, bandwidth, status codes, encryption breakdown, sources, and per-file load. Cached for 15 minutes. |
| `GET /:domain/usage` | Bandwidth usage—same data source as analytics. |
| `GET /:domain/audit` | The project's state on every edge node, including a live TLS certificate check per node. |

## Account, tokens & billing

| Method & path | Description |
|---------------|-------------|
| `POST /token` | Mint an API token. Optional body `{ msg, scope }`. `201` `{ email, token, id, msg, scope, created_at }`. See [Authentication](https://surge.sh/docs/api/authentication#labelled-and-scoped-tokens). |
| `GET /tokens` | The account's tokens, by id. |
| `DELETE /tokens/:id` | Expire a token. `204`. |
| `PUT /tokens/:id` | Hand a token to an org the account is in: `{ org }`. Its value doesn't change. |
| `POST /token/reset/:email` | Send password reset instructions. No auth. Always `201`. |
| `POST /verification` | Send an email verification link. |
| `GET /account` | The account object, with plan and card. |
| `DELETE /account` | **Permanently delete the account.** `409` while projects still exist or the account is an org's only admin. |
| `GET /plans` | Available plans, the current plan, and card status. |
| `GET /subscription` | The account's current subscription. |
| `PUT /plan` | Subscribe to or change a plan. Body `{ plan, token, timestamp }`. |
| `PUT /card` | Update the payment card. Body `{ token }` (a Stripe source token). `201` on success. |
| `POST /upgrade/link` | Mint a browser checkout URL, valid 48 hours. `201` `{ url }`. |
| `POST /billing/link` | Mint a browser billing portal URL (card, invoices, cancellation), valid 48 hours. `201` `{ url }`. |

## Orgs

`:org` is an org's slug or id. Non-members get `404`, the same as for an org that doesn't exist. See [`surge orgs`](https://surge.sh/docs/cli/orgs).

| Method & path | Description |
|---------------|-------------|
| `GET /orgs` | The orgs the account belongs to, with its role in each. |
| `POST /orgs` | Create an org: `{ slug, name }`. The caller becomes its admin. Needs a verified email. |
| `GET /orgs/:org` | An org and its members. Members only. |
| `PUT /orgs/:org` | Change `slug` and/or `name`. Any member. |
| `DELETE /orgs/:org` | Remove the org. Admins only; refused while it holds domains (transfer or tear them down first). |
| `GET /orgs/:org/members` | Members and pending invites. A pending invite has no email: it's listed by `hint`, its code's first word. |
| `GET /orgs/:org/members/:email` | One member. |
| `POST /orgs/:org/invites` | Mint an invite: `201` `{ code, hint, role, expires_at }`. Nothing is emailed. Single-use, valid 7 days, up to 10 waiting per org. Optional `{ role }`: `member` (the default) or `admin`. Any member; inviting an admin, admins only. |
| `PUT /orgs/:org/members/:email` | Set `{ role }` to `admin` or `member`. Any change to or from admin is for admins. |
| `DELETE /orgs/:org/members/:email` | Remove a member. Any member; removing an admin, admins only; anyone, for themselves. |
| `POST /orgs/:org/join` | Join with `{ code }`, as the signed-in account. The same as `POST /claim` with an invite. |
| `GET /orgs/:org/tokens` | The org's tokens by id: scope, msg, `created_by`, uses, last used. Never the secret. Any member. |
| `POST /orgs/:org/tokens` | Add an org token: `{ msg, scope }`. `201` `{ org, token, id, msg, scope, created_by, created_at }`; the token is shown once. Any verified member, signed in as themselves; up to 10 per org. |
| `DELETE /orgs/:org/tokens/:id` | Expire an org token. `204`. Any member. |

An org token acts as the org. It publishes the org's domains (new ones become the org's), rolls back, cuts over, tears down, and reads `/list`, revisions, status and certs. Every other endpoint answers `403`. It outlives whoever added it.

## Transfers

A domain moves into an org you're in, out of one to your own account, or—by a transfer code—to anyone. Serving is unchanged. See [Moving a domain](https://surge.sh/docs/cli/orgs#moving-a-domain).

| Method & path | Description |
|---------------|-------------|
| `GET /:domain/owner` | Who owns the domain, for anyone who holds it: `{ owner: { account } }`, `{ owner: { org: { slug, name } } }`, or `"someone else"`. |
| `PUT /:domain/owner` | Move it: `{ to }` is an org slug you're a member of, or your own email. The owner account or any member of the owning org. Answers `{ domain, owner, from, collaborators }`. |
| `POST /:domain/owner/code` | Mint a transfer code: `201` `{ code, expires_at }`, valid 7 days. A new code cancels the last. |
| `POST /claim` | Claim with `{ code }`. A transfer code: the domain becomes the signed-in account's (`{ domain, owner, orgs }`), once, and only while the domain still has the owner it was minted under. An invite: the account joins the org (`{ org: { slug, name }, role, already }`). With `{ code, check: true }` it does nothing and describes the code instead: `{ check, kind: "transfer", domain, from, by, expires_at, yours }` or `{ check, kind: "invite", org, role, by, expires_at, member }`. After 10 codes that didn't work in an hour, per account or IP, answers `429`. |
| `POST /scrap` | Cancel `{ code }`: an invite, by any member of its org (`{ scrapped: "invite", org }`), or a transfer code, by whoever may mint one for the domain (`{ scrapped: "transfer", domain }`). |

Tokens scoped to a domain can read its owner but can't move it or mint a code.

## Sign-in sessions

These back `surge login --browser` and `surge mfa`; most tools never need them.

| Method & path | Description |
|---------------|-------------|
| `POST /login/session` | Start a browser sign-in. No auth. `{ uuid, url, code, poll, interval, expires_in }`. |
| `POST /login/session/:uuid/poll` | Poll it with `{ poll }`: `status` is `pending`, `approved` (with `email` and `token`, once), or `gone`. |
| `POST /mfa/session` | Open the two-factor setup page for the account. `{ url }`. |

## Feeds & platform stats

| Method & path | Description |
|---------------|-------------|
| `GET /stats` | Public, unauthenticated platform statistics—deploy counts, bytes published, project totals. CORS-enabled. |
| `GET /pulse` | Public server-sent event stream of completed publishes, anonymized. CORS-enabled. |
| `GET /activity` | Server-sent event stream of every change on the account's domains. Authenticated. |
