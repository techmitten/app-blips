# Method Reference

Every JSON method follows Node's callback convention—the last argument is always `function(err, data)`. Arguments marked *optional* (in brackets) may be omitted entirely; the remaining arguments shift left. `creds` is a credentials object as described in [Client & Authentication](https://surge.sh/docs/sdk/client).

The streaming methods (`publish`, `encrypt`, `ssl`) return an `EventEmitter` instead and are covered in [Publishing & Streams](https://surge.sh/docs/sdk/publishing). Request and response bodies for each endpoint are in the [API Endpoint Reference](https://surge.sh/docs/api/reference); this page maps methods to them.

## Account & tokens

| Method | Calls | Description |
|--------|-------|-------------|
| `token(creds, [args], cb)` | `POST /token` | Exchange email + password (or a token) for a token. Yields `{ user: "token", pass: "…" }`, ready to use as `creds`. `args` takes `{ msg, scope }`. |
| `tokenAdd([args], creds, cb)` | `POST /token` | Mint a labelled, optionally scoped token: `{ msg, scope: [domains] }`. Yields the full record `{ email, token, id, msg, scope, created_at }`. |
| `tokens(creds, cb)` | `GET /tokens` | The account's tokens by id: scope, msg, uses, created and last-used times. Never the secret. |
| `tokenRem(id, creds, cb)` | `DELETE /tokens/:id` | Expire a token by its `tok-` id. |
| `tokenTransfer(id, org, creds, cb)` | `PUT /tokens/:id` | Hand a token to an org you're in, its value unchanged. |
| `reset(email, cb)` | `POST /token/reset/:email` | Send a password reset email. No auth required. |
| `account(creds, cb)` | `GET /account` | Fetch the account: email, verification state, plan, card. |
| `verification(creds, cb)` | `POST /verification` | Send an email verification link. Yields `{ verified: true }` if already verified, `{ sent: true }` if sent, or `{ sent: false, msg }` inside the five-minute resend window. |
| `loginSession(host, cb)` | `POST /login/session` | Start a browser sign-in. Yields `{ uuid, url, code, poll, interval, expires_in }`. No auth. |
| `loginPoll(uuid, poll, cb)` | `POST /login/session/:uuid/poll` | Poll a browser sign-in: `status` is `pending`, `approved` (with `email` and `token`, once), or `gone`. |
| `mfaSession(creds, cb)` | `POST /mfa/session` | Open the browser page that sets up or manages two-factor auth. Yields its `url`. |
| `nuke(creds, cb)` | `DELETE /account` | **Permanently delete the account.** Fails with a 409 while projects still exist or the account is an org's only admin. |
| `stats(cb)` | `GET /stats` | Public platform statistics. No auth required. |

## Orgs

| Method | Calls | Description |
|--------|-------|-------------|
| `orgs(creds, cb)` | `GET /orgs` | Every org the account belongs to, with its role. |
| `org(org, creds, cb)` | `GET /orgs/:org` | One org and its members. |
| `orgCreate({ slug, name }, creds, cb)` | `POST /orgs` | Create an org; the caller becomes its admin. |
| `orgRename(org, { slug, name }, creds, cb)` | `PUT /orgs/:org` | Change the slug, name, or both. Any member. |
| `orgRemove(org, creds, cb)` | `DELETE /orgs/:org` | Remove the org. Refused while it holds domains. |
| `orgMembers(org, creds, cb)` | `GET /orgs/:org/members` | Members and pending invites (`pending: true`, listed by `hint`). |
| `orgMember(org, email, creds, cb)` | `GET /orgs/:org/members/:email` | One member. |
| `orgInvite(org, [role], creds, cb)` | `POST /orgs/:org/invites` | Mint a one-time invite code, `{ code, hint, role, expires_at }`, to send yourself. `role` is `"member"` (the default) or `"admin"`. Any member; inviting an admin, admins only. |
| `orgRole(org, email, role, creds, cb)` | `PUT /orgs/:org/members/:email` | Set `role` to `"admin"` or `"member"`. Any change to or from admin is for admins. |
| `orgRevoke(org, email, creds, cb)` | `DELETE /orgs/:org/members/:email` | Remove a member (anyone may remove themselves). |
| `orgJoin(org, code, creds, cb)` | `POST /orgs/:org/join` | Join with an invite's code, as the signed-in account. |
| `orgTokens(org, creds, cb)` | `GET /orgs/:org/tokens` | The org's tokens by id, with who added each. Never the secret. |
| `orgTokenAdd(org, { msg, scope }, creds, cb)` | `POST /orgs/:org/tokens` | Add a token that acts as the org; the secret comes back once. |
| `orgTokenRem(org, id, creds, cb)` | `DELETE /orgs/:org/tokens/:id` | Expire an org token. |

## Transfers

| Method | Calls | Description |
|--------|-------|-------------|
| `owner(domain, creds, cb)` | `GET /:domain/owner` | Who owns the domain: `{ owner: { account } }`, `{ owner: { org: { slug, name } } }`, or `"someone else"`. |
| `transfer(domain, to, creds, cb)` | `PUT /:domain/owner` | Move the domain into an org you're in (`to` is its slug), or to your own account (`to` is your email). |
| `transferCode(domain, creds, cb)` | `POST /:domain/owner/code` | A code whoever claims takes the domain with: `{ code, expires_at }`. A new one cancels the last. |
| `claim(code, [{ check }], creds, cb)` | `POST /claim` | Any code: join the org an invite is for, or take the domain a transfer code names into the signed-in account. `{ check: true }` describes what the code would do and does nothing. |
| `scrap(code, creds, cb)` | `POST /scrap` | Cancel an invite or transfer code. |

## Projects & revisions

| Method | Calls | Description |
|--------|-------|-------------|
| `list(creds, cb)` | `GET /list` | All projects on the account. |
| `list(domain, creds, cb)` | `GET /:domain/list` | The project's revisions (the last 100). |
| `teardown(domain, creds, cb)` | `DELETE /:domain` | Take the project down and remove it. |
| `rollback(domain, creds, cb)` | `POST /:domain/rollback` | Point the domain at the previous revision. |
| `rollfore(domain, creds, cb)` | `POST /:domain/rollfore` | Point the domain at the next revision. |
| `cutover(domain, [rev], creds, cb)` | `PUT /:domain/rev/:rev` | Promote a revision to live (`PUT /:domain/rev`, the latest, when `rev` is omitted). |
| `discard(domain, rev, creds, cb)` | `DELETE /:domain/rev/:rev` | Delete a revision from the system. |
| `bust(domain, creds, cb)` | `DELETE /:domain/cache` | Purge the project from every edge node's cache. |
| `metadata(domain, [rev], creds, cb)` | `GET /:domain/metadata.json` | Deploy metadata for the live revision, or `GET /:domain/:rev/metadata.json` for a given one. |
| `manifest(domain, [rev], creds, cb)` | `GET /:domain/manifest.json` | File manifest—a map of path → size and checksum. `GET /:domain/:rev/manifest.json` with a rev. |

## Domains, DNS & certificates

| Method | Calls | Description |
|--------|-------|-------------|
| `status(domain, creds, cb)` | `GET /:domain/status` | Where the domain stands: `{ status, action, https, reason, records }`, with `status` one of `waiting on dns`, `securing`, `ready`, or `live`. |
| `certs(domain, creds, cb)` | `GET /:domain/certs` | Certificate information for the domain. |
| `dns(domain, creds, cb)` | `GET /:domain/dns` | List the domain's DNS records. |
| `dnsAdd(domain, record, creds, cb)` | `POST /:domain/dns` | Add a DNS record, e.g. `{ type: "MX", name: "@", priority: "10", value: "mail.example.com" }`. |
| `dnsRem(domain, id, creds, cb)` | `DELETE /:domain/dns/:id` | Remove a DNS record by id. |
| `zone(domain, creds, cb)` | `GET /:domain/zone` | The full zone, including records Surge manages for you. |
| `zoneAdd(domain, record, creds, cb)` | `POST /:domain/zone` | Add a zone record. |
| `zoneRem(domain, id, creds, cb)` | `DELETE /:domain/zone/:id` | Remove a zone record by id. |

DNS methods only apply to apex domains you've pointed at Surge's name servers—see [Custom Domains](https://surge.sh/docs/platform/custom-domains).

## Collaborators

| Method | Calls | Description |
|--------|-------|-------------|
| `invite(domain, { emails }, creds, cb)` | `POST /:domain/collaborators` | Closed: every email comes back `"not sent"`. Orgs share domains now. |
| `revoke([domain, ...emails], creds, cb)` | `DELETE /:domain/collaborators` | Revoke collaborators invited before orgs. Takes a single array mixing the domain and the emails to take off. |

## Settings & analytics

| Method | Calls | Description |
|--------|-------|-------------|
| `settings(domain, props, creds, cb)` | `PUT /:domain/settings` | Update the domain's settings: `force`, `redirect`, `cors`, `hsts`, `private`. |
| `analytics(domain, creds, cb)` | `GET /:domain/analytics` | Traffic analytics for the past 14 days. |
| `usage(domain, creds, cb)` | `GET /:domain/usage` | Bandwidth usage data. |
| `audit(domain, creds, cb)` | `GET /:domain/audit` | Per-edge-node state of the project, including live certificate checks. |

## Billing & plans

| Method | Calls | Description |
|--------|-------|-------------|
| `plans(headers, creds, cb)` | `GET /plans` | Available plans, the current plan, and card status. |
| `plan(args, creds, cb)` | `PUT /plan` | Subscribe to or change a plan: `{ plan, token, timestamp }`. |
| `subscription(creds, cb)` | `GET /subscription` | The account's current subscription. |
| `card({ token }, creds, cb)` | `PUT /card` | Update the payment card with a Stripe source token. |
| `upgradeLink([plan], creds, cb)` | `POST /upgrade/link` | Mint a browser checkout URL (valid 48 hours). |
| `billingLink(creds, cb)` | `POST /billing/link` | Mint a browser billing portal URL (valid 48 hours). |

## Error handling

On success, callbacks receive `(null, data)` where `data` is the parsed response body. On failure, the error arrives as the **first and only** argument. Its shape depends on the endpoint:

```js
// The common shape — the response body, with status attached
{ messages: ["domain must be valid."], details: { domain: "must be valid." }, status: 422 }

// Some endpoints use a single message (rate limits among them)
{ message: "Rate limited. (domain). Try again in 9 hours.", status: 429 }

// A failure with no JSON body — described from the status
{ messages: ["request failed (502)"], details: { request: "request failed (502)" }, status: 502 }

// A network failure — the request never completed (no status)
{ messages: ["request did not complete"], errors: ["request did not complete"], details: { request: "did not complete" } }
```

Check `err.status` for the HTTP code, and fall back through `err.messages`, `err.message`, and `err.errors` when displaying the failure—the CLI does exactly this.
