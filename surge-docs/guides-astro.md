# Publish an Astro Project

Astro is static-first: `astro build` emits a `dist/` directory of finished HTML, and Surge puts directories of finished HTML on the web. The two need no adapter, no configuration, and no server.

## Build and publish

```sh
npm create astro@latest my-project
cd my-project
npm run build
surge ./dist my-project.surge.sh
```

The publish propagates to [every edge node](https://surge.sh/docs/platform/cdn) while the command runs—`Success!` means live in every region, not queued for it.

## Keep the domain across builds

That first publish wrote the domain to `dist/CNAME`—but the next `astro build` recreates `dist/` and would lose it. Astro copies everything in `public/` straight into the build, so that's the file's home:

```sh
mv dist/CNAME public/CNAME
```

Every subsequent build carries its domain, and `surge ./dist publish` needs no arguments. Wire it into your scripts:

```json
{
  "scripts": {
    "build": "astro build",
    "deploy": "astro build && surge ./dist publish"
  }
}
```

## The 404 page

Add `src/pages/404.astro` and Astro emits `404.html`—which is exactly the file [Surge serves for missing paths](https://surge.sh/docs/platform/custom-404). Style your not-found page like any other page of the project; nothing to configure on the platform side.

## View transitions, islands, and client JS

All of Astro's client-side behavior ships as static assets, so it publishes like everything else. The one Astro feature Surge doesn't run is SSR (`output: 'server'`)—Surge serves files, it doesn't execute them. Astro's default static output is the fit.

## Custom domain

`surge ./dist example.com` and follow the DNS records the output prints—[the full walkthrough](https://surge.sh/docs/guides/custom-domain) covers delegation, certificates, and forcing HTTPS.
