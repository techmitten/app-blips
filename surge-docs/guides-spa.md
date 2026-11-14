# Publish a Single-Page App

A single-page app with client-side routing—React Router, Vue Router, SvelteKit's static adapter, anything with real URLs—has one hosting requirement: when a visitor lands directly on `/dashboard/settings`, the server must hand them the app shell instead of a 404, and let the router take it from there. On Surge, that behavior is a file name.

## The 200.html file

Name your app shell `200.html` (or ship a copy of `index.html` under that name) and [Surge serves it for every path that doesn't match a real file](https://surge.sh/docs/platform/spa-routing)—with a `200` status, at the URL the visitor asked for. The router boots, reads the address bar, and renders the right view. Deep links work. Refresh works. Shared links work.

```json
{
  "scripts": {
    "build": "vite build && cp dist/index.html dist/200.html",
    "deploy": "npm run build && surge ./dist publish"
  }
}
```

That `cp` is the entire integration. Works identically for any bundler—the only requirement is that the output directory ends up containing `200.html`.

## Why 200 and not 404 tricks

Some hosts fake SPA routing by serving the shell from the 404 page. That answers deep links with a `404` status—search engines and monitoring see errors on every route. Surge's `200.html` answers with `200`, because your routes aren't errors. Keep [`404.html`](https://surge.sh/docs/platform/custom-404) for what it's for: paths your app genuinely doesn't know.

## Publish it

```sh
npm run deploy
```

The whole app—shell, assets, both special files—propagates to [every edge node](https://surge.sh/docs/platform/cdn) during the publish. Every route of your app is served from the node nearest each visitor, because every route *is* the shell, and the shell is everywhere.

Your first publish writes the domain to a `CNAME` file in the output directory; move it to wherever your bundler copies static files verbatim (`public/` for Vite and Astro) so it survives rebuilds—details in the [Vite guide](https://surge.sh/docs/guides/vite).

## Hash routing needs nothing

If your router uses `#` URLs, every path is really `/`, and plain `index.html` already handles it. `200.html` is for routers using the History API—which is what you want anyway, and now it costs one file copy.
