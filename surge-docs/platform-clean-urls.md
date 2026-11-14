# Clean URLs

Clean URLs take real work on most servers—rewrite rules, framework configuration, boilerplate. On Surge they're automatic for every project:

- `/hello-world` serves `hello-world.html`
- `/foo/bar/` redirects to `/foo/bar` when the content is `foo/bar.html`
- `/foo/bar` redirects to `/foo/bar/` when the content is `foo/bar/index.html`
- `www.example.com` redirects to `example.com` (or vice versa—whichever form you publish to is canonical)
- `http://` can [redirect to `https://`](https://surge.sh/docs/platform/ssl#forcing-https)

Build your project with plain `.html` files and link to the extensionless paths—Surge resolves them. Directory-style URLs (`/guide/` backed by `guide/index.html`) work equally well; pick the shape you like and the other resolves or redirects to it.

## Why the redirects matter

Serving the same page at multiple URLs—with and without a trailing slash, with and without `www`—splits your search ranking and your analytics across duplicates. Surge's redirects guarantee each page has exactly one canonical URL, and everything else points at it with a proper redirect. There's nothing to configure and no way to get it wrong.
