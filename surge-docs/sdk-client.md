# Client & Authentication

## Creating a client

`surge-sdk` exports a single factory function. Call it with a configuration object, and optionally the `surge-stream` module:

```js
var surgeSDK    = require("surge-sdk")
var surgeStream = require("surge-stream")

var sdk = surgeSDK({
  endpoint: "https://surge.surge.sh"
}, surgeStream)
```

### Configuration options

| Option | Type | Description |
|--------|------|-------------|
| `endpoint` | string, required | Base URL of the Surge API. Use `https://surge.surge.sh` for the public platform. |
| `defaults` | object, optional | Map of HTTP status code → handler function, called whenever a response with that status is received. See [status handlers](#status-handlers) below. |

The second argument, `surgeStream`, is the `surge-stream` module itself—not an instance. When you pass it, the SDK wires up the three streaming methods (`publish`, `encrypt`, `ssl`). If you omit it, those three methods become no-ops that log `` `surge-stream` not found ``, so pass it whenever you intend to deploy.

## Supplying credentials

The SDK is stateless: every method takes a credentials argument, and nothing is persisted between calls. Credentials can take any of these shapes:

```js
// A token (the usual case)
{ user: "token", pass: "6b1a5b7d…" }

// A bare token string is shorthand for the same thing
"6b1a5b7d…"

// Email and password (only needed to mint a token)
{ user: "you@example.com", pass: "your-password" }
```

Under the hood, credentials are sent as HTTP Basic auth. `username`/`password` keys work as aliases for `user`/`pass`.

## Getting a token

Exchange an email and password for a long-lived token with `sdk.token(creds, [args], callback)`. This is the only call that needs a password—everything after it uses the token:

```js
sdk.token({ user: "you@example.com", pass: password }, function(err, creds){
  if (err) return console.error(err)   // err.status === 401 → bad credentials

  // creds is ready to pass to any other method:
  // { user: "token", pass: "6b1a5b7d…" }

  sdk.account(creds, function(err, account){
    console.log("Logged in as " + account.email)
  })
})
```

Signing in with an email address that has no account yet **creates the account**—the same behavior as `surge login` in the CLI. There is no separate registration call. (New accounts are capped per network: past 50 in an hour from one IP, creation answers `429`.)

Two cases refuse a password:

- **Two-factor auth.** An account with [two-factor auth](https://surge.sh/docs/cli/account#mfa) on can't mint a token with its password—every password-authenticated call answers `403` with `details: { mfa: "required" }`. Tokens for those accounts come from the browser sign-in (`surge login --browser`) or `surge tokens add`.
- **Bad credentials.** `401`, with the reason in the JSON body.

### Labelled and scoped tokens

`sdk.tokenAdd(args, creds, callback)` mints a token from an existing token or password, with a label and an optional scope—the same call as [`surge tokens add`](https://surge.sh/docs/cli/account#tokens):

```js
sdk.tokenAdd({ msg: "ci", scope: ["example.com"] }, creds, function(err, record){
  // record: { email, token, id, msg, scope, created_at }
  console.log(record.id + " " + record.token)   // tok-1a2b3c4d 6b1a5b7d…
})
```

A scoped token can publish to its domains and run their project calls, and nothing account-wide. `sdk.tokens(creds, cb)` lists the account's tokens (by id—never the secret), and `sdk.tokenRem(id, creds, cb)` expires one.

Where you store the token is up to your application. The Surge CLI writes it to the user's `~/.netrc` file (keyed by API host, with `0600` permissions), which is a good convention for command line tools. For CI and server environments, an environment variable is typical.

To send a password reset email, use `sdk.reset(email, callback)`—no authentication required.

## Verifying the account

`sdk.account(creds, callback)` returns the account object:

```json
{
  "email": "you@example.com",
  "email_verified_at": "2026-05-01T18:22:10.000Z",
  "role": 4,
  "plan": { "name": "Free" },
  "card": null
}
```

Use it at startup to validate a stored token: a `401` means the token has expired or been removed (`surge tokens rem`), and you should re-run the token flow.

## Status handlers

The `defaults` option lets you register cross-cutting handlers for specific HTTP status codes—useful for handling authorization failures in one place instead of in every callback:

```js
var sdk = surgeSDK({
  endpoint: "https://surge.surge.sh",
  defaults: {
    403: function(err, response, body){
      console.error("Unauthorized.")
      process.exit(1)
    }
  }
})
```

Handlers receive `(error, response, body)` and run before the method's own callback. The SDK itself never writes to stdout, and errors always reach the callback whether or not a handler is registered.
