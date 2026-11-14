# The CDN & Edge Network

Surge runs its own CDN, purpose-built for static projects. Every edge node serves your project directly—content, certificate, redirects, and headers—and every node learns about a publish, a rollback, or a configuration change the moment it happens. That's why they behave the way they do everywhere else in these docs: instantly, and in every region at once.

## The network

Ten regions, on three continents' worth of coverage—the same table every publish prints, [live on the network page](https://surge.sh/network):

| Node | Location |
|------|----------|
| `sfo` | US, San Francisco |
| `jfk` | US, New York |
| `yyz` | CA, Toronto |
| `lhr` | GB, London |
| `ams` | NL, Amsterdam |
| `fra` | DE, Frankfurt |
| `blr` | IN, Bangalore |
| `sgp` | SG, Singapore |
| `nrt` | JP, Tokyo |
| `syd` | AU, Sydney |

Every project—Free or Pro—serves from all of them.

## How routing works

Visitors reach the node nearest to them, and the routing happens at the DNS layer. When your domain is [delegated to Surge's name servers](https://surge.sh/docs/platform/custom-domains), those name servers are geo-aware: a resolver in Berlin is answered with Frankfurt's address, one in Melbourne with Sydney's. `*.surge.sh` domains route the same way.

Domains pointed at Surge with a plain `CNAME` record resolve through the same entry point and reach the network without geo-answers from your DNS provider—delegation is recommended for exactly this reason.

Once a request arrives, the node answers it—content, certificate, redirects, headers—from the region the visitor reached, not from a distant server.

## How publishing propagates

This is the property the whole platform is built around: **a publish propagates to every node while the publish runs.** Your files upload once; the network distributes them to each region; and each node confirms individually—that's the per-node table in the publish output, checking off in real time. When the command prints `Success!`, every node in the list is serving the new revision. There is no propagation delay to explain to a client, no "give it a few minutes."

Production moves atomically. Every publish creates an immutable [revision](https://surge.sh/docs/cli/revisions), and production is a pointer at one of them—so `rollback`, `rollfore`, and `cutover` are pointer switches executed across the network in moments. Nothing re-uploads. The undo is as fast and as global as the publish was.

The same broadcast machinery applies to [configuration](https://surge.sh/docs/cli/config): change a setting and every node picks it up immediately.

## Lucid Caching

Every asset is served with the same carefully-chosen caching strategy, applied automatically:

```http
Cache-Control: public, max-age=0, must-revalidate
ETag: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
```

Read together, these headers tell the browser: *keep this file, but check with the server before using it again.* The check is an ETag validation—a tiny conditional request that returns `304 Not Modified` when the file hasn't changed, or the fresh file when it has. The result:

- The browser **never downloads the same bytes twice**—not even HTML.
- A visitor **never sees a stale file** after you publish.
- You **never rename files to bust caches** or fingerprint asset paths.

It's the most aggressive caching that never serves stale content—which is why there's no cache configuration on Surge at all.

## Gzip

All compressible content types—HTML, CSS, JavaScript, JSON, SVG, text—are gzipped automatically at the edge. Binary formats that are already compressed (images, video, fonts) are passed through untouched. Nothing to configure, no build step.

## Watching the network work

The network is inspectable from the CLI, node by node. [`surge <domain> debug status`](https://surge.sh/docs/cli/analytics#status) confirms the domain is live against the actual edge—`live` means real requests are being answered with a valid certificate, not that a control panel thinks so. [`debug audit`](https://surge.sh/docs/cli/analytics#audit) asks every node which revision it's serving and the state of its certificate. [`stats load`](https://surge.sh/docs/cli/analytics) charts where in the world your traffic lands, per datacenter. And if you ever need to force the network's hand, [`debug bust`](https://surge.sh/docs/cli/analytics#bust) purges every node's cache—though routine publishing never needs it: propagation and the ETag model keep every visitor current on their next request.
