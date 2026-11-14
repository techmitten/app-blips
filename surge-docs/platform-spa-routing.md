# Client-Side Routing

Single-page applications route in the browser: `/settings/profile` isn't a file, it's a state your JavaScript renders after loading. That breaks on ordinary static hosts—a visitor landing directly on a deep link gets a 404 before your app ever runs.

On Surge, the fix is a naming convention. Copy your app shell, `index.html`, to:

```txt
200.html
```

When a request doesn't match any file in your project, Surge serves `200.html` **with a `200 OK` status** and leaves the URL untouched. Your app boots, reads the path, and routes—deep links, refreshes, and shared URLs all just work. This is the behavior `pushState` routing expects, and it works with React Router, Vue Router, or any client-side router.

Copy rather than rename, after every build (builds clear the output directory): `/` keeps serving `index.html`, and every other unmatched path gets `200.html`. Renaming works too, since `/` falls through to `200.html` as well.

```sh
cp dist/index.html dist/200.html
surge ./dist publish
```

## Mixing static files and app routes

Real files always win. If your build also emits `/pricing.html` or a `/blog/` directory of static pages, those are served normally—only genuinely unmatched paths fall through to `200.html`. So you can pre-render what benefits from it and let the app handle the rest.

## 200 versus 404

Both files catch unmatched URLs; the difference is intent and status code:

- [`404.html`](https://surge.sh/docs/platform/custom-404) — "that doesn't exist," served with a `404` status. Right for content-first projects.
- `200.html` — "the app will decide," served with a `200` status. Right for single-page apps.

If both are present, `200.html` takes over the unmatched routes. Have your router render its own not-found view for paths it doesn't recognize.
