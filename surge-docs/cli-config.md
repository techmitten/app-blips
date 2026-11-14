# Project Configuration

Every project carries a small set of platform settings—the knobs that control how the edge serves it. The `config` command views and changes them, and changes take effect across [every edge node](https://surge.sh/docs/platform/cdn) immediately: no republish, no cache to wait out.

## Viewing configuration

```sh
surge example.com config
```

Prints the project's current settings as `key: value` pairs. A fresh project has nothing set and prints `Empty`—every setting below is optional, and absence means the sensible default. (Inside a project directory, plain `surge config` does the same.)

## Changing configuration

Pass any setting as a flag; pass `null` to clear one back to its default:

```sh
surge example.com config --force https      # set
surge example.com config --force null       # clear
```

The command prints the resulting configuration so you can confirm exactly what's now in effect.

## The settings

| Setting | Values | What it controls |
|---------|--------|------------------|
| `force` | `http`, `https` | Redirect all traffic to one protocol. `https` is the right value for almost every project—publishing with `--force https` sets it for you. |
| `redirect` | a domain | Answer every request with a redirect to another domain—how a retired domain sends visitors to its successor. |
| `cors` | a domain, `*` | Allow cross-origin requests from one origin, or any. The [`CORS` file](https://surge.sh/docs/platform/cors) does this per-project in code; the setting does it from the platform side. |
| `hsts` | seconds | Send a `Strict-Transport-Security` header with the given max-age, telling browsers to insist on HTTPS. |
| `private` | `true`, `false` | Require sign-in for the whole domain. The people who can publish it get in; everyone else meets the sign-in page, and crawlers get a `Disallow: /` robots.txt. The [`AUTH` file](https://surge.sh/docs/platform/auth) does this per-path. |

Every setting is available on every plan, `cors` and `private` included.

## Private domains

`private` also works as a flag at publish time—`surge ./dist example.com --private` publishes and locks the domain in one move, and `--public` flips it back:

```sh
surge example.com config --private     # lock the domain
surge example.com config --public      # open it again
```

A private domain serves only the people who can publish it: the members of the [org](https://surge.sh/docs/cli/teams) that owns it, or you for a domain of your own, plus anyone [invited before orgs](https://surge.sh/docs/cli/teams#collaborators-from-before-orgs). Someone joining or leaving the org takes effect without a republish. Everything else about serving is unchanged: certs provision, previews work, and the domain stays live the whole time.

When some paths should be open and others protected, or when specific outside people need in, that granularity lives in the [`AUTH` file](https://surge.sh/docs/platform/auth).

## Configuration from your project files

Most day-to-day behavior isn't set through `config` at all—it's driven by files in the directory you publish, which travel with every publish:

| File | Controls |
|------|----------|
| `CNAME` | The project's domain. See [Publishing](https://surge.sh/docs/cli/publishing#the-cname-file). |
| `.surgeignore` | Files excluded from publishing. See [Publishing](https://surge.sh/docs/cli/publishing#ignoring-files). |
| `AUTH` | Password protection and protected paths (Pro). See [the platform docs](https://surge.sh/docs/platform/auth). |
| `CORS` | Cross-origin resource sharing. See [CORS](https://surge.sh/docs/platform/cors). |
| `ROUTER` | Redirects and routing rules (Pro). See [Redirects](https://surge.sh/docs/platform/redirects). |
| `200.html` | Client-side routing for single-page apps. See [SPA routing](https://surge.sh/docs/platform/spa-routing). |
| `404.html` | The not-found page. See [Custom 404 pages](https://surge.sh/docs/platform/custom-404). |

The split is deliberate: anything that should be versioned with your code lives *in* the project and rolls back with it, revision by revision. Anything about the running service—which revision is live, protocol enforcement, platform-side redirects—is `config`, applied to the domain no matter what's published there.
