# Authentication

Every authenticated request to the Surge API uses **HTTP Basic auth**. There are two credential forms:

| Form | Username | Password | Used for |
|------|----------|----------|----------|
| Token | the literal string `token` | your API token | Everything, day to day |
| Email + password | your email address | your password | Minting tokens |

## Minting a token

`POST /token` with email + password credentials returns a long-lived token:

```sh
curl -X POST https://surge.surge.sh/token -u you@example.com:password
```

```json
{
  "email": "you@example.com",
  "token": "6b1a5b7d0f8e4c…",
  "id": "tok-1a2b3c4d",
  "msg": null,
  "scope": [],
  "created_at": "2026-10-25T18:22:10.000Z"
}
```

The response is `201`. Tokens are valid for three years. Use the token for all subsequent requests:

```sh
curl https://surge.surge.sh/account -u token:6b1a5b7d0f8e4c…
```

This is the same token that `surge login` stores in your `~/.netrc`, and that [`surge token`](https://surge.sh/docs/cli/account) prints—so for scripting against the API you can simply reuse the CLI's token.

An account with [two-factor auth](https://surge.sh/docs/cli/account#mfa) on can't mint a token with its password: every password-authenticated request answers `403` with `details: { "mfa": "required" }`. Sign in with `surge login --browser`, then mint more tokens with a token, as below.

## Labelled and scoped tokens

`POST /token` takes an optional JSON body, and works with token credentials as well as a password:

```sh
curl -X POST https://surge.surge.sh/token -u token:YOUR_TOKEN \
  -H "Content-Type: application/json" \
  -d '{ "msg": "ci", "scope": ["example.com"] }'
```

- `msg` labels the token (up to 140 characters).
- `scope` restricts it to the listed domains. A scoped token can publish to those domains and run their project calls (revisions, settings, analytics, teardown); account-wide routes and the domain's DNS, collaborators, plan, and certificate changes answer `403`. Scoping to a domain the account can't publish to is refused with `403`.

The rest of the token lifecycle:

| Method & path | Description |
|---------------|-------------|
| `GET /tokens` | The account's tokens: `id`, `msg`, `scope`, `uses`, `created_at`, `last_used_at`. Never the secret. |
| `DELETE /tokens/:id` | Expire a token by its `tok-` id. `204`. |

## Account creation

There is no separate signup endpoint. Authenticating with an email address that has no account **creates the account** with that email and password. This is how the CLI's first `surge` run registers you, and it applies to `POST /token` as well: mint a token with fresh credentials and you've created an account. New accounts are capped per network—past 50 in an hour from one IP, creation answers `429` with `retry-after`.

## The account object

`GET /account` returns the authenticated account, including plan and card status:

```json
{
  "email": "you@example.com",
  "email_verified_at": "2026-05-01T18:22:10.000Z",
  "created_at": "2024-01-15T09:30:00.000Z",
  "plan": { "name": "Free" },
  "card": null
}
```

A `401` here means the token has expired or been removed—mint a new one.

## Email verification

`POST /verification` (authenticated) sends a verification link to the account's email address:

- `200` `{ "verified": true }` — already verified, nothing sent.
- `201` `{ "verified": false, "sent": true }` — verification email sent.
- `200` `{ "verified": false, "sent": false, "msg": "…" }` — an email was already sent within the last five minutes.

Verify early: unverified accounts publish under half the usual rate limits, and a newly signed-up account's `surge.sh` domains stop serving after their first 90 minutes—`GET /:domain/status` reports them as `ready`—until the email is verified.

## Password reset

`POST /token/reset/:email` (no authentication) sends password reset instructions:

```sh
curl -X POST https://surge.surge.sh/token/reset/you@example.com
```

Always responds `201`, whether or not the email matches an account.
