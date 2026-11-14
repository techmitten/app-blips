# Publishing

Publishing takes a directory and puts it on the web at a domain:

```sh
surge <path> <domain>
```

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

Every publish reports the whole picture: the certificate covering the domain, how DNS is answered, and each edge node of the [CDN](https://surge.sh/docs/platform/cdn) confirming what it serves—plus the revision's permanent preview URL and the domain's [latest URL](https://surge.sh/docs/cli/previews#the-latest-url) alongside production.

Some useful forms:

```sh
surge ./dist example.com       # publish ./dist to example.com — no prompts
surge . example.com            # publish the current directory
surge ./dist _                 # publish to a fresh generated .surge.sh domain
surge page.html example.com    # publish one HTML page as the domain's index.html
surge ./dist publish           # publish using the project's CNAME file
surge publish                  # same, from inside the project directory
surge -p ./dist -d example.com # flag form, for pipelines
```

`surge <path> publish` is the constructor: run against a directory that has never been published, it prompts for the domain—suggesting a generated `.surge.sh` subdomain you can accept, replace with any domain you own, or refresh by typing `_`. Once the project knows its domain (see [the CNAME file](#the-cname-file)), the same command publishes with no questions at all.

## A single HTML file

Pass a file instead of a directory and the page is published on its own, as the domain's `index.html`:

```sh
surge page.html my-page.surge.sh
```

- **The domain.** Run without one, the prompt suggests a name from the file: `page.html` suggests `page.surge.sh`, and an `index.html` suggests its folder's name.
- **HTML only.** `.html` and `.htm` files publish this way. Anything else is refused before the upload starts—put it in a folder and publish the folder.
- **The page goes up alone.** If it uses images, stylesheets, or scripts sitting next to it, the output names them as `left behind`. Publish the folder to include them.
- **No CNAME file.** A single file never takes its domain from a `CNAME` in the current directory (that belongs to another project), and none is written. Pass the domain every time.
- **It replaces the domain.** Like any publish, the page becomes the whole of what the domain serves.

This needs surge 0.45 or newer; `npm install -g surge` updates it.

## Choosing a domain

You can publish to two kinds of domain:

- **A `surge.sh` subdomain** — free, instant, no setup: `anything-you-like.surge.sh`, as long as it's not taken.
- **Your own domain** — also free; point it at Surge first. See [Domains & DNS](https://surge.sh/docs/cli/domains).

The `--force` flag controls HTTPS behavior: publish with `surge ./dist example.com --force https` and the platform will redirect all HTTP traffic to HTTPS (new `.surge.sh` subdomains start out that way). Add `--private` to lock the domain to the people who can publish it, or `--public` to open it again—see [private domains](https://surge.sh/docs/cli/config#private-domains). More in [SSL & HTTPS](https://surge.sh/docs/platform/ssl).

## The CNAME file

A project remembers its domain in a file named `CNAME` at the root of the directory you publish—and Surge writes it for you. That's the `domain written to dist/CNAME` line in the output above: publish to a domain once, and the project knows where it lives. From then on `surge publish` goes straight there with no prompt—and every other command resolves its target the same way, so `surge rollback` or `surge dns list` inside the project just work.

The convention is shared with GitHub Pages, so a project can move between the two without changes. One thing to know if a build tool generates the directory you publish: the next build may wipe the file with everything else—the [framework guides](https://surge.sh/docs/guides/) show where to keep it so it survives.

## Ignoring files

By default, Surge excludes things that don't belong on a web server:

```txt
.git  .*  *.*~  node_modules  bower_components
```

To exclude more, add a `.surgeignore` file to your project root. It uses the same syntax as `.gitignore`:

```gitignore
# .surgeignore
src/
*.map
drafts/
```

The `.*` rule excludes every dot-directory, `.well-known/` included. To publish one, re-include it with a negated line:

```gitignore
# .surgeignore
!.well-known
```

Everything else in the directory is published. Before uploading, the CLI prints a `size:` line with the file count and total size, so you'll notice if something unexpected is being included. Projects are limited to 10,100 files and 450 MB; a larger project is refused before anything is published.

## Messages

Attach a message to a publish the way you would to a git commit. Messages show up in the revision list, which makes `surge <domain> revs` read like a log of everything you've shipped:

```sh
surge publish -m "fix nav on mobile"
```

## Publishing limits

There's no cap on how many projects or domains you publish, but how often you publish is rate limited. Limits are counted over rolling windows:

| Limit | Per 15 minutes | Per 24 hours |
|-------|----------------|--------------|
| Each domain | 30 | 200 |
| Each account | 60 | 500 |
| Each IP address | 240 | — |

Accounts with an unverified email get half of each limit—run `surge verify` to lift them (see [account](https://surge.sh/docs/cli/account)). [Previews](https://surge.sh/docs/cli/previews) count the same as publishes.

When you go over, the publish aborts with the limit you hit and when to try again:

```txt
Aborted - Rate limited. (domain). Try again in 9 hours.
```

Attempts made while limited count toward the window too, so a job that keeps retrying stays limited. Stop and resume after the time shown.

For scheduled or looping jobs, the 24-hour limit is the one to plan around: 200 a day is one publish every ~7 minutes, so publish every 10 minutes or more—or better, only when the content has changed. See [CI & Automation](https://surge.sh/docs/cli/automation).

## What happens on publish

A publish is done when it says it's done—everywhere. Your files upload once, then propagate to **every edge node of [Surge's CDN](https://surge.sh/docs/platform/cdn) while the command runs**; the `CDN:` bar is that propagation happening, and the table underneath is each node individually confirming what it now serves. There's no "allow a few minutes for changes to appear," no cache to wait out: when `Success!` prints, the new revision is live in every region at once.

Only changed files travel. For projects over 1 MB, files the domain's live revision already has are carried over rather than uploaded again, so republishing a large project with a small change is quick.

The cutover is atomic. Every publish creates a new [revision](https://surge.sh/docs/cli/revisions) (Surge keeps the last 100), and production points at it only after the upload completes—a failed or interrupted publish leaves the live project exactly as it was. To upload without moving production at all, use a [preview](https://surge.sh/docs/cli/previews).

The output also reports the state of the domain itself—the certificate covering it, how DNS is answered, and the exact records to add if the domain isn't pointing at Surge yet.
