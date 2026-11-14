# The Surge Platform

Surge is a web publishing platform built for front-end developers. You hand it a directory of HTML, CSS, and JavaScript; it hands you back a live domain on a global CDN. The [CLI](https://surge.sh/docs/cli/) is how you drive it—this section documents what the platform itself does with your project once it's up.

## What every project gets

Publish anything to Surge—free—and it comes with:

- **A global edge network.** Your files propagate to [ten regions worldwide](https://surge.sh/docs/platform/cdn) *during* the publish—every node confirms before the CLI says `Success!`—and visitors are served from the nearest one, with [aggressive-but-correct caching](https://surge.sh/docs/platform/cdn#lucid-caching) applied automatically.
- **[Custom domain support](https://surge.sh/docs/platform/custom-domains).** Publish to your own domain at no cost, with DNS managed by Surge or by your existing provider.
- **[SSL](https://surge.sh/docs/platform/ssl).** Every `surge.sh` subdomain is HTTPS out of the box; custom domains get free managed certificates, provisioned automatically.
- **[Clean URLs](https://surge.sh/docs/platform/clean-urls).** `/about` serves `about.html`, canonical redirects are handled, and `www` folds into your root domain automatically.
- **[Revisions](https://surge.sh/docs/cli/revisions).** The last 100 publishes are kept, each previewable and instantly restorable.
- **[Client-side routing](https://surge.sh/docs/platform/spa-routing)** for single-page apps, and [custom 404 pages](https://surge.sh/docs/platform/custom-404).
- **Gzip, ETags, and far-future caching**—applied for you, never configured.

## Configuration is files in your project

The platform's conventions follow one idea: your project directory is the configuration. Behavior is controlled by files that publish with your code:

| File | Purpose |
|------|---------|
| `CNAME` | Sets the project's domain. |
| `.surgeignore` | Excludes files from publishing. |
| `200.html` | Serves your app shell for unmatched URLs ([SPA routing](https://surge.sh/docs/platform/spa-routing)). |
| `404.html` | The not-found page ([custom 404s](https://surge.sh/docs/platform/custom-404)). |
| `ROUTER` | Redirect rules ([redirects](https://surge.sh/docs/platform/redirects)). |
| `AUTH` | [Password protection & protected paths](https://surge.sh/docs/platform/auth)—a password on the project, or Google sign-in on specific paths. |
| `CORS` | Cross-origin access ([CORS](https://surge.sh/docs/platform/cors)). |

Because these travel with every publish, each [revision](https://surge.sh/docs/cli/revisions) carries its own complete configuration—roll back the code and you roll back the behavior with it. The control files themselves (`ROUTER`, `AUTH`, `CORS`) are never served to visitors.

## Free and Pro

Publishing, custom domains, managed SSL, revisions, CORS, and the CDN are free. Pro adds exactly two things: password protection and protected paths (`AUTH`), and redirects (`ROUTER`). See [Plans](https://surge.sh/docs/platform/plans).
