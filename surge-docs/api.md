# Surge API

The Surge API is the HTTP interface that both the [CLI](https://surge.sh/docs/cli/) and the [SDK](https://surge.sh/docs/sdk/) are built on. Anything the CLI can do—publish, roll back, manage DNS, read analytics—happens through these endpoints, so anything the CLI can do, your own tools can do too.

If you're working in JavaScript, use the [SDK](https://surge.sh/docs/sdk/) rather than calling these endpoints directly; it handles authentication, upload streaming, and response parsing for you. This section documents the raw HTTP surface for everyone else.

## Base URL

```
https://surge.surge.sh
```

There is no path-based versioning. Clients identify themselves with a `version` header carrying their own release number.

## Conventions

**Authentication** is HTTP Basic on every authenticated endpoint. Normally the username is the literal string `token` and the password is your API token—see [Authentication](https://surge.sh/docs/api/authentication).

**Responses** are JSON. Most errors use this shape:

```json
{
  "messages": ["domain must be valid."],
  "details": { "domain": "must be valid." }
}
```

A few don't: rate limits answer `{ "message": "…" }`, a missing revision list answers `{ "error": "…" }`, and some refusals send an empty `{}` with the explanation in a `reason` header. Read `messages`, then `message`, then `error`, then the `reason` header.

**Domains are resource paths.** A project is addressed by its domain: `DELETE /example.surge.sh` tears down that project, `GET /example.surge.sh/list` lists its revisions.

**Long-running operations stream.** The deploy, certificate, and custom-SSL endpoints respond with newline-delimited JSON (`Accept: application/x-ndjson`): one JSON object per line, emitted as the work progresses. A line with `"type": "info"` signals success. See [Deploys](https://surge.sh/docs/api/deploys).

## Common status codes

| Code | Meaning |
|------|---------|
| `200` / `201` / `202` | Success. |
| `401` | Missing or invalid credentials. The JSON body explains why. |
| `403` | Authenticated, but not allowed—no permission for the domain, a token whose scope doesn't cover the request, a project over the size limits, or a password used on an account with two-factor auth (`details.mfa: "required"`). |
| `404` | No such project, revision, or account. |
| `405` | Operation not available for this domain (e.g. DNS management on a non-apex domain). |
| `409` | Conflict—for example, deleting an account that still has projects. |
| `422` | Invalid domain. |
| `429` | Rate limited. On publishes the `reason` header names the limit, and `retry-after` gives the seconds to wait—see [Deploys](https://surge.sh/docs/api/deploys#failures). Account creation is also capped per network (50 an hour). |

## A quick tour

```sh
# Mint a token with your email and password
curl -X POST https://surge.surge.sh/token -u you@example.com:password

# List your projects
curl https://surge.surge.sh/list -u token:YOUR_TOKEN

# Deploy a tarball
tar czf - -C ./my-project . | curl -X PUT https://surge.surge.sh/my-project.surge.sh \
  -u token:YOUR_TOKEN \
  -H "Content-Type: application/gzip" \
  -H "Accept: application/x-ndjson" \
  --data-binary @-

# Take it down
curl -X DELETE https://surge.surge.sh/my-project.surge.sh -u token:YOUR_TOKEN
```

## In this section

- [Authentication](https://surge.sh/docs/api/authentication) — tokens, account creation, verification.
- [Deploys](https://surge.sh/docs/api/deploys) — the upload format, deploy headers, limits, and the event stream.
- [Endpoint Reference](https://surge.sh/docs/api/reference) — every public endpoint.
