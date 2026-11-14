# Previews

A preview uploads a new revision **without changing what production serves**. You get a URL to check, share, and test against—and production stays exactly as it was until you decide otherwise.

```sh
surge publish --preview
```

```
$ surge ./dist publish --preview

   Running as you@example.com (Free)

        project: ./dist
         domain: lucid-example.surge.sh
           size: 4 files, 695 bytes
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

   Success! - Preview available at 1785787164375--lucid-example.surge.sh
```

(`--stage` and `-s` are aliases for `--preview`.)

## The preview URL

Every revision—previewed or published—gets a URL of its own, served over the same CDN as production: the preview propagates to [every edge node](https://surge.sh/docs/platform/cdn) just like a real publish, so what you're checking is exactly what production will be, served exactly how production serves. The host is built from the revision id and the domain:

| Domain | Preview host |
|--------|--------------|
| A `surge.sh` subdomain, e.g. `example.surge.sh` | `1785787164375--example.surge.sh` |
| Your own domain, e.g. `example.com` | `1785787164375--example--com.surge.sh` |

Previews of a custom domain live under `surge.sh`, so they work—over HTTPS—whatever your DNS points at, even before the domain itself is live. The URL lasts as long as the revision does (Surge keeps the last 100 per domain), so it works for:

- **Review**: send the link to a teammate or client before shipping.
- **Testing**: point integration tests at the exact bits that will go live.
- **History**: recent revisions stay viewable at their own URLs, listed by `surge <domain> revs`.

Preview hosts read as `<revision>--<domain>.surge.sh`: a domain one level under `surge.sh` is written as its name, any other domain in full with each dot written as `--`. Links in the older forms (`1785787164375-example.surge.sh`, `1785787164375--example-com.surge.sh`) keep working.

## The latest URL

Put `latest` where the revision id goes and the URL always shows the domain's newest revision, previewed or published:

| Domain | Latest host |
|--------|-------------|
| `example.surge.sh` | `latest--example.surge.sh` |
| `example.com` | `latest--example--com.surge.sh` |

Every publish prints it on the `Latest` line. It moves on the next preview or publish, and falls back to the one before when a revision is discarded—so it is the link to hand a reviewer or put in a PR template once, and keep. To show one exact build, use the revision's own URL.

Anyone who knows the domain can guess its latest URL, so a preview is only as private as the domain: work that must stay unseen until launch belongs on a [`--private`](https://surge.sh/docs/cli/config#private-domains) domain or behind an [AUTH](https://surge.sh/docs/platform/auth) file. Preview and latest URLs enforce both, and never get indexed by search engines.

## Shipping a preview

When the preview looks right, cut it over to production:

```sh
surge example.com cutover
```

`cutover` points production at the latest revision—the one you just previewed. Nothing is re-uploaded; the switch is atomic. If you previewed several candidates, pass the specific revision to ship:

```sh
surge example.com cutover 1719852000000
```

If the preview *isn't* right, discard it and production never knew it existed:

```sh
surge example.com discard 1719852000000
```

## A typical flow

```sh
surge publish --preview -m "redesigned pricing page"   # upload a candidate
# …check the preview URL, share it, run tests…
surge cutover                                          # ship it
```

This is also the natural shape for CI: every branch build publishes a preview, and merging to the main branch runs a plain publish (or a `cutover`). See [CI & Automation](https://surge.sh/docs/cli/automation).

For the full picture of how revisions work—rollback, rollfore, discard—see [Revisions](https://surge.sh/docs/cli/revisions).
