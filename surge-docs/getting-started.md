# Getting Started

Surge publishes static web projects—HTML, CSS, and JavaScript—straight from the command line. This walkthrough takes you from nothing to a live project in about a minute.

## 1. Install the CLI

Surge runs on [Node.js](https://nodejs.org) (version 18 or later). With Node installed, grab the CLI from npm:

```sh
npm install --global surge
```

(If npm complains about permissions, [fix npm's global prefix or use a Node version manager](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally) rather than reaching for `sudo`.)

## 2. Publish something

Go to any directory with an `index.html` in it—or make one:

```sh
mkdir lucid-example && cd lucid-example
echo '<h1>Hello, Surge</h1>' > index.html
surge publish
```

The first run asks you to create an account—just an email and password, right in the terminal. Then it prompts for the project (your current directory) and a domain, suggesting one based on your directory's name—accept it, or type anything you like:

```
$ surge publish

   Running as you@example.com (Free)

        project: /Users/you/lucid-example/
        project: /Users/sintaxi/Documents/Surge/steno/fixtures/lucid-example/dist
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

   domain written to CNAME
```

That's the entire flow. Your project is live on Surge's [CDN](https://surge.sh/docs/platform/cdn), over HTTPS, with [clean URLs](https://surge.sh/docs/platform/clean-urls)—at the domain you accepted or typed at the prompt.

**Verify your email.** A new account's `surge.sh` domains serve for their first 90 minutes; after that they wait—status **ready**—until the account's email address is verified, then serve again with nothing to republish. Run `surge verify` to get the link.

## 3. The domain is remembered

Notice the last line: the CLI wrote the domain to a `CNAME` file in your project, so every command now knows where the project lives. From now on `surge publish` ships straight there, no questions asked.

## 4. Ship an update

Change a file and run `surge publish` again. Each publish creates a new [revision](https://surge.sh/docs/cli/revisions), and production cuts over atomically when the upload completes. Shipped a mistake? Undo it:

```sh
surge rollback
```

## Where to go from here

**Use your own domain.** Point it at Surge and publish—custom domains are free, and the SSL certificate is provisioned automatically. → [Custom Domains](https://surge.sh/docs/platform/custom-domains)

**Preview before you ship.** `surge publish --preview` uploads a revision with its own URL, without touching production. → [Previews](https://surge.sh/docs/cli/previews)

**Publish from CI.** Mint a token with `surge tokens add`, set `SURGE_TOKEN` in your pipeline, done. → [CI & Automation](https://surge.sh/docs/cli/automation)

**Publishing a single-page app?** Name your shell `200.html` so deep links work. → [Client-Side Routing](https://surge.sh/docs/platform/spa-routing)

**Publishing a Vite, Astro, or Eleventy build?** The [Guides](https://surge.sh/docs/guides/) cover each framework's particulars—and migrating from GitHub Pages or Netlify.

Or head to the [CLI docs](https://surge.sh/docs/cli/) for the full tour of what `surge` can do.
