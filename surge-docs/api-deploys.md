# Deploys

A deploy is a single `PUT` to the project's domain, with the project packed as a gzipped tarball in the request body. The response is a live stream of newline-delimited JSON describing the publish as it happens: upload, propagation to the CDN, certificate work, and the final result.

```
PUT /:domain
```

## Request

```
PUT /my-project.surge.sh HTTP/1.1
Host: surge.surge.sh
Authorization: Basic dG9rZW46…
Content-Type: application/gzip
Accept: application/x-ndjson
Transfer-Encoding: chunked
version: 1.0.0
file-count: 42
project-size: 123456
```

The body is a **gzipped tar archive** of the project directory. Notes on the format the official clients produce:

- Entries are prefixed with a single top-level directory (the server unpacks with the first path segment stripped), so `project/index.html` becomes `/index.html`.
- Files matched by the default ignore rules (`.git`, dotfiles, `*.*~` backups, `node_modules`, `bower_components`) and by the project's `.surgeignore` are excluded before packing.
- A single `.html` file can be published by packing it alone as `index.html`.
- The official clients first ask `POST /:domain/carry` which files the live revision already has, and pack only the rest (the `carry-ticket` header ties the two requests together). It's an optimization; a full tarball always works.

### Deploy headers

Metadata about the deploy travels in request headers:

| Header | Description |
|--------|-------------|
| `version` | Your client's version string. |
| `file-count` | Number of files in the archive—used for progress totals and limits. |
| `project-size` | Total bytes—used for progress and limits. |
| `message` | A deploy message, shown in the revision list (`surge <domain> revs`). |
| `stage` | Set to make this a preview deploy: uploaded and given a revision preview URL, but not cut over to production. |
| `add` / `rem` | Comma-separated emails. `rem` removes collaborators invited before orgs; `add` invites no one now and the `info` line says so. |
| `argv` | JSON of the client's parsed arguments. Domain settings ride here and are applied on publish—`{ "force": "https" }`, `{ "private": true }`—the same keys as [`PUT /:domain/settings`](https://surge.sh/docs/api/reference#settings-analytics). |

## The response stream

The server responds `200` and begins streaming JSON objects, one per line. Each object has a `type`. In a typical successful deploy you'll see, in order:

```json
{ "type": "progress", "id": "upload", "written": 51200, "total": 123456 }
{ "type": "progress", "id": "cdn", "written": 12, "total": 42, "file": "index.html" }
{ "type": "cert", "data": { "issuer": "Let's Encrypt", "altnames": ["my-project.surge.sh"], "expiresInWords": "89 days" } }
{ "type": "subscription", "data": null }
{ "type": "info", "urls": [...], "instances": [...], "metadata": {...}, "config": {...} }
```

| Type | Meaning |
|------|---------|
| `progress` | Progress through a phase. `id` is `upload`, `cdn`, or `encrypt`; the final message of a phase carries `"end": true`. |
| `cert` | Certificate details, when certificate work happens during the deploy. |
| `subscription` | The project's plan, if any. |
| `collect` | Payment required—carries `plan`, `perks`, `stripe_pk`, and a `checkout_url`. The deploy will not complete until the account subscribes. |
| `msg` | A human-readable server message: `{ payload: { msg, status } }`. |
| `error` | The deploy was refused mid-stream: `{ error: { message } }`—a project over the size limits, an `AUTH` file without Pro, a CDN failure. Nothing was published. |
| `info` | **The success marker.** Contains the deploy result: `urls` (where the project is reachable, including the revision preview URL), `instances` (the edge nodes serving it), `metadata` (revision id, message, file counts, sizes; `metadata.preview` is the preview host), and `cta` (one line the server wants shown, when it has one). |

A stream that ends without an `info` line means the deploy did not succeed. Note that a refusal can arrive *inside* a `200` stream as an `error` line—the status code alone doesn't mean success.

### Failures

Failures before the stream starts arrive as plain HTTP errors:

| Status | Reason |
|--------|--------|
| `401` | Invalid or expired token. The explanation is in the JSON body. |
| `403` | No permission to publish to this domain (the `reason` header says why when it can), a token scoped elsewhere, or a project whose declared `file-count`/`project-size` exceed the limits (10,100 files / 450 MB; `reason: Unable to publish. Application too large`). A project that only goes over during the upload is stopped with an in-stream `error` line instead. |
| `422` | The domain is invalid. |
| `429` | Rate limited. Per 15 minutes: 30 deploys per domain, 60 per account, 240 per IP. Per 24 hours: 200 per domain, 500 per account. Halved for unverified accounts. Body `{ "message": "…" }`. The `retry-after` header gives the seconds until the window allows another deploy; rejected attempts count toward the window, so wait it out rather than retrying. See [publishing limits](https://surge.sh/docs/cli/publishing#publishing-limits). |

## Revisions and previews

Every deploy creates a **revision**, identified by a millisecond timestamp, and each revision gets its own preview URL—`<rev>-example.surge.sh` for a `surge.sh` subdomain, `<rev>--example-com.surge.sh` for a custom domain. Surge keeps the last 100 revisions per domain.

A normal deploy is cut over to production immediately; a deploy with the `stage` header stops after upload, leaving production untouched until you cut it over. Revisions are managed with a small family of endpoints—list, rollback, rollfore, cutover, discard—documented in the [Endpoint Reference](https://surge.sh/docs/api/reference), and correspond directly to the [CLI's revision commands](https://surge.sh/docs/cli/revisions).

## Certificates over the same stream

Two more endpoints speak the same NDJSON protocol:

- `PUT /:domain/encrypt` — provision a managed SSL certificate for a custom domain. No body. Streams `progress` (id `encrypt`) and always ends with `info`, whose `certs` lists the domain's valid certificates—an empty list means none was issued.
- `PUT /:domain/ssl` — upload a custom PEM bundle (`Content-Type: application/x-pem-file`, raw body). Requires Pro. The response is always `200` and carries no `info` line; the outcome is the final `msg` line: `{ "type": "msg", "payload": { "msg": "the pem file has been applied", "status": "ok" } }`, or `"status": "error"` when the bundle is rejected.
