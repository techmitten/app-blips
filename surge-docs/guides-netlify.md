# Migrate from Netlify

If your Netlify project is a static build—and most are—migration is: publish the build output, translate a couple of config files, move DNS when ready. Surge has no build minutes to meter because builds happen wherever you like; the platform's job is serving what you built, [instantly and globally](https://surge.sh/docs/platform/cdn).

## 1. Publish the build output

Your `netlify.toml` (or the Netlify UI) names a publish directory—`dist`, `build`, `_site`. Build locally and publish it to a test domain:

```sh
npm run build
surge ./dist my-project.surge.sh
```

Check it end to end on the `.surge.sh` URL before touching anything else.

## 2. Translate the config

| On Netlify | On Surge |
|------------|----------|
| `_redirects` rules | A [`ROUTER` file](https://surge.sh/docs/platform/redirects): `301 /old /new`, with `:segment` patterns. Pro. |
| `/* /index.html 200` (SPA fallback) | Name your shell [`200.html`](https://surge.sh/docs/guides/spa)—free, one file copy in your build script. |
| Custom headers | [Lucid Caching](https://surge.sh/docs/platform/cdn#lucid-caching) replaces cache-header tuning; HSTS and protocol enforcement live in [`surge config`](https://surge.sh/docs/cli/config). |
| Password protection | An [`AUTH` file](https://surge.sh/docs/platform/auth). Pro. |
| Deploy previews | [`surge publish --preview`](https://surge.sh/docs/cli/previews)—every revision has its own URL on the production CDN. |
| Build hooks / CI | [GitHub Actions in one workflow file](https://surge.sh/docs/guides/github-actions), or any runner with Node. |

The honest boundary: Surge serves static files and doesn't execute anything. Netlify Functions, form handling, and edge functions need a home of their own (an API host of your choosing)—your static front end calls them cross-origin same as before, with [CORS](https://surge.sh/docs/platform/cors) if you're hosting the API yourself somewhere that needs it.

## 3. Publish to your real domain

```sh
surge ./dist example.com
```

The output reports **waiting on dns** with the records to add—your content is already on every edge node, staged, waiting for the domain. It also writes the domain to `dist/CNAME`; move that file to wherever your bundler copies static assets from (`public/` for most) so rebuilds keep it, and every publish after this one is just `surge ./dist publish`.

## 4. Move DNS

At your registrar, point the domain at Surge—[delegation recommended](https://surge.sh/docs/guides/custom-domain#2-point-the-domain-at-surge), plain CNAME supported. Netlify serves until propagation completes; Surge serves after; nobody sees a gap. `surge example.com debug status` reports **live** the moment the switchover is real, certificate provisioned and verified.

## Afterward

The loop gets simpler: build anywhere, `surge ./dist publish`, done—propagated to every region before the command exits, with [rollback](https://surge.sh/docs/cli/revisions) as your safety net. No build queue between you and production, and no bill that scales with how often you ship.
