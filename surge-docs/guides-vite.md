# Publish a Vite Project

Vite builds to a `dist/` directory of plain static files—exactly what Surge publishes. Total time from a fresh project to live on the web: about two minutes, most of it npm.

## Build and publish

```sh
npm create vite@latest my-project
cd my-project
npm install
npm run build
surge ./dist my-project.surge.sh
```

That's the entire flow. The publish output confirms your project propagating to every node of [Surge's CDN](https://surge.sh/docs/platform/cdn)—when it prints `Success!`, you're live worldwide:

```
$ surge ./dist lucid-example.surge.sh

   Running as you@example.com (Free)

        project: ./dist
         domain: lucid-example.surge.sh
           size: 3 files, 672 bytes
         upload: [=========================] 100%
            CDN: [=========================] 100%
     encryption: [=========================] 100%

  ┌──────────┬────────────────────────────────────────────────────────────────┬───────────────────────┐
  │   CERT   │   *.surge.sh, surge.sh                                         │   auto-renew          │
  ├──────────┼────────────────────────────────────────────────────────────────┼───────────────────────┤
  │   DNS    │   using Surge Name Servers                                     │   geo-aware           │
  └──────────┴────────────────────────────────────────────────────────────────┴───────────────────────┘
  ┌──────────┬──────────────────┬───────────────────────┬─────────────────────┬─────────────┬─────────┐
  │   HTTP   │   sfo.surge.sh   │   US, San Francisco   │   138.197.235.123   │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   lhr.surge.sh   │   GB, London          │   46.101.67.123     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   yyz.surge.sh   │   CA, Toronto         │   159.203.50.177    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   jfk.surge.sh   │   US, New York        │   159.203.159.100   │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   ams.surge.sh   │   NL, Amsterdam       │   188.166.132.94    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   fra.surge.sh   │   DE, Frankfurt       │   138.68.112.220    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   sgp.surge.sh   │   SG, Singapore       │   139.59.195.30     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   blr.surge.sh   │   IN, Bangalore       │   139.59.50.135     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   syd.surge.sh   │   AU, Sydney          │   45.76.126.95      │   Vultr     │   ✔ ◍   │
  │   HTTP   │   nrt.surge.sh   │   JP, Tokyo           │   172.104.96.133    │   Linode    │   ✔ ◍   │
  └──────────┴──────────────────┴───────────────────────┴─────────────────────┴─────────────┴─────────┘
   Live preview ................................................ 1785787164375--lucid-example.surge.sh
   Latest ............................................................. latest--lucid-example.surge.sh
   Production ................................................................. lucid-example.surge.sh

   Success! - Published to lucid-example.surge.sh

   domain written to dist/CNAME
```

## Keep the domain across builds

That first publish wrote the domain to `dist/CNAME`—but `vite build` wipes and recreates `dist/`, so the next build would lose it. Move it to `public/`, which Vite copies verbatim into every build:

```sh
mv dist/CNAME public/CNAME
```

Now the domain travels with every build, and publishing needs no arguments:

```sh
npm run build && surge ./dist publish
```

## Make it a script

```json
{
  "scripts": {
    "build": "vite build",
    "deploy": "vite build && surge ./dist publish"
  }
}
```

`npm run deploy` now builds and publishes in one move—for you, for teammates in your [org](https://surge.sh/docs/cli/teams), and for [CI](https://surge.sh/docs/guides/github-actions).

## If you're using a router

Vite + React Router (or Vue Router, or any client-side routing with real URLs) needs one extra file so deep links survive refresh—see [Publish a Single-Page App](https://surge.sh/docs/guides/spa).

## Custom domain

Publish to your own domain the same way—`surge ./dist example.com`—and the output walks you through pointing DNS. The full path is in [Put a Project on Your Own Domain](https://surge.sh/docs/guides/custom-domain).
