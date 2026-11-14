# Publishing & Streams

The streaming methods—`publish` and `encrypt`—each return a Node.js `EventEmitter` rather than taking a callback. The Surge API responds to these operations with a live stream of newline-delimited JSON, and the SDK re-emits each message as an event, so your tool can show real progress while the work happens.

These methods are only available when the client was constructed with the `surge-stream` module—see [Client & Authentication](https://surge.sh/docs/sdk/client).

## Publishing a project

```js
sdk.publish(projectPath, domain, creds, headers, argv)
```

| Argument | Description |
|----------|-------------|
| `projectPath` | Directory to deploy—or a single `.html` file, published as the domain's `index.html`. Files are gathered recursively, filtered by Surge's default ignore rules plus a `.surgeignore` file if one exists, then packed into a gzipped tarball and streamed to the API. |
| `domain` | Target domain, e.g. `"my-project.surge.sh"`. |
| `creds` | Credentials—normally `{ user: "token", pass: token }`. |
| `headers` | Optional object of extra HTTP headers. This is how deploy metadata travels: `version` (your client's version), `message`, `stage`, and so on—see [deploy headers](https://surge.sh/docs/api/deploys#deploy-headers). `file-count` and `project-size` are filled in from the project when you leave them out. |
| `argv` | Optional parsed-arguments object; serialized into an `argv` header for the server. |

A complete example, modelled on how the CLI itself deploys:

```js
sdk.publish("./my-project", "my-project.surge.sh",
  { user: "token", pass: token },
  {
    "version":   "1.0.0",           // your tool's version
    "timestamp": new Date().toJSON()
  }
)
.on("progress", function(p){
  // p.id is the phase: "upload", "cdn", or "encrypt"
  // p.written / p.total track completion; p.file names the current file
})
.on("info", function(info){
  // The deploy result: info.urls, info.instances, info.metadata
})
.on("error",   function(e){ console.error(e.error ? e.error.message : e) })
.on("success", function(){ console.log("Published!") })
.on("fail",    function(){ console.error("Deploy failed") })
```

For projects over 1 MB, `publish` first asks which files the domain's live revision already has and uploads only the rest; a `carry` event reports `{ carried, sent }`. Nothing about the result differs.

## Stream events

Every JSON message from the server is emitted twice: once as a generic `data` event with the full object, and once as an event named after the message's `type` field (`progress`, `info`, `users`, `cert`, `subscription`, `collect`, `msg`, `error`). The message types and their payloads are the wire protocol, documented once in [Deploys: the response stream](https://surge.sh/docs/api/deploys#the-response-stream).

On top of those, the client emits lifecycle events of its own:

| Event | Meaning |
|-------|---------|
| `success` | The stream ended after an `info` message was received. The deploy is live. |
| `fail` | The stream ended without an `info` message, or the request failed outright. |
| `error` | The deploy was refused mid-stream—the server's `{ error: { message } }` line (project too large, an `AUTH` file without Pro, a CDN failure), a single file the SDK can't publish, or a transport error. Always attach a listener: an unhandled `error` event throws. |
| `unauthorized` | HTTP 401—the token is invalid or expired. |
| `forbidden` | HTTP 403—authenticated but not permitted (no access to the domain, token scope, project too large). Payload is the `reason` header when the server sends one. |
| `invalid` | HTTP 422—the domain is invalid. |
| `ratelimited` | HTTP 429—too many publishes in the window ([limits](https://surge.sh/docs/cli/publishing#publishing-limits)). Payload is the reason string, including when to retry. |
| `response` | The raw HTTP response, before any body—status code and headers. |
| `single` | A single file is being published: `{ file, as, local }`, where `local` lists files the page references that stay behind. |
| `skipped` | Paths left out because they have no content (dangling or looping symlinks, sockets). |
| `carry` | Upload dedupe: `{ carried, sent }`. |

Treat `success`/`fail` as the authoritative outcome; `info` merely carries the result payload.

## Provisioning a certificate

`encrypt` asks the platform to provision a free SSL certificate for a custom domain. Same event model, no request body:

```js
sdk.encrypt("example.com", { user: "token", pass: token }, { version: "1.0.0" })
  .on("info",    function(info){ console.log(info.certs.length + " valid certificate(s)") })
  .on("success", function(){ console.log("Request finished") })
```

The stream always ends with an `info` line, so `success` means the request ran—not that a certificate was issued. Read `info.certs` (the domain's valid certificates once the attempt is done), or ask afterwards with `sdk.certs()` or `sdk.status()`.
