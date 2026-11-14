# Surge SDK

`surge-sdk` is the JavaScript library that the [Surge CLI](https://surge.sh/docs/cli/) is built on. If you're building a deployment tool, a static generator with a "publish" button, or your own CI tooling, the SDK gives you the same publishing machinery the official CLI uses—as a library.

It comes as two npm packages, versioned in lockstep:

| Package | Purpose |
|---------|---------|
| `surge-sdk` | JSON client for the Surge API—accounts, tokens, projects, revisions, DNS, plans, and analytics. |
| `surge-stream` | Streaming uploader that packs a directory into a gzipped tarball and publishes it, reporting progress as it goes. Also handles SSL certificate provisioning. |

You only need `surge-stream` if you want to publish or manage certificates. Everything else—listing projects, managing DNS records, rolling back revisions—works with `surge-sdk` alone.

## Installation

```sh
npm install surge-sdk surge-stream
```

## A first taste

```js
var surgeSDK    = require("surge-sdk")
var surgeStream = require("surge-stream")

var sdk = surgeSDK({ endpoint: "https://surge.surge.sh" }, surgeStream)

sdk.publish("./my-project", "my-project.surge.sh", { user: "token", pass: token })
  .on("progress", function(p){ process.stdout.write(".") })
  .on("success",  function(){ console.log("\nPublished!") })
  .on("fail",     function(){ console.error("\nDeploy failed") })
```

## How the pieces fit together

The SDK is a thin, stateless client for the [Surge API](https://surge.sh/docs/api/):

- **JSON methods** (`list`, `teardown`, `rollback`, `dns`, …) follow Node's callback convention: `sdk.method(args, creds, function(err, data){ … })`.
- **Streaming methods** (`publish`, `encrypt`, `ssl`) return an `EventEmitter` that relays live progress events from the server as the work happens.
- **Credentials are supplied on every call.** The SDK stores nothing on disk—token storage, prompting, and login flows are the caller's concern. (The CLI, for instance, keeps its token in `~/.netrc`.)

## Where to go next

- [Client & Authentication](https://surge.sh/docs/sdk/client) — create a client and obtain a token.
- [Publishing & Streams](https://surge.sh/docs/sdk/publishing) — deploy a directory and track progress events.
- [Method Reference](https://surge.sh/docs/sdk/reference) — every method, with signatures and error shapes.
