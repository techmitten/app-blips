# Custom Domains

```txt
Name servers   ns1.surge.world  ns2.surge.world  ns3.surge.world  ns4.surge.world
CNAME          geo.surge.world
A              138.197.235.123
```

Every project on Surge can live at your own domain, free—certificate included. Once the domain points at Surge, publishing to it is identical to publishing to a subdomain:

```sh
surge ./dist example.com
```

Publish first, point DNS second: the publish succeeds immediately and reports the domain as **waiting on dns** along with the records to add. Pointing DNS at Surge is the only step that's ever yours.

There are three ways to point a domain at Surge. They differ in where DNS is managed and in how visitors are routed:

| | Name servers | `CNAME` record | `A` record |
| --- | --- | --- | --- |
| DNS managed | by Surge, from the CLI | at your DNS provider | at your DNS provider |
| Covers | the root and every subdomain | subdomains (the root only with `ALIAS`/`ANAME`) | the root or any subdomain |
| Routing | geo-aware—nearest edge | geo-aware—nearest edge | one fixed region |
| Setup | four `NS` records at the registrar | one record per hostname | one record per hostname |

Delegating to Surge's name servers is the recommended path. A `CNAME` is the right choice when DNS has to stay where it is. An `A` record covers the case a `CNAME` can't: the root domain at a provider without `ALIAS`-style records.

## Option 1: Delegate to Surge's name servers (recommended)

Set your domain's name servers, at your registrar, to:

```txt
ns1.surge.world
ns2.surge.world
ns3.surge.world
ns4.surge.world
```

Surge then answers DNS for the whole domain. The root and every subdomain—including the wildcard that makes [subdomains](#subdomains) publishable—resolve to the edge node nearest each visitor, and there are no individual records to add or maintain for your projects.

Delegation moves *all* of the domain's DNS to Surge, so any records you rely on today—mail, verification strings, subdomains hosted elsewhere—need to be recreated with [the `dns` commands](https://surge.sh/docs/cli/domains). Add them before switching the name servers and nothing skips a beat:

```sh
surge example.com dns add MX 10 mail.example.com
surge example.com dns add TXT @ "v=spf1 include:_spf.example.net ~all"
surge example.com dns add CNAME app app.example.dev
```

Delegated domains also get a single wildcard certificate covering the root and every subdomain—see [SSL & HTTPS](https://surge.sh/docs/platform/ssl#custom-domains).

## Option 2: `CNAME` record at your current DNS provider

Keep DNS where it is and point each hostname at Surge's `CNAME` target:

```txt
www      CNAME   geo.surge.world
```

`geo.surge.world` is answered by Surge's name servers, so a `CNAME` is geo-aware too—visitors still resolve to the nearest edge, without geo-answers from your provider. Add one record per hostname you publish to, or a wildcard (`*`) record to make every subdomain publishable at once.

The root domain (`example.com` itself) can't carry a `CNAME`—the DNS specification doesn't allow it. Providers that offer an `ALIAS`, `ANAME`, or "flattened `CNAME`" record type let you point the root at `geo.surge.world` all the same. At a provider without one, use an [`A` record](#option-3-a-record-at-your-current-dns-provider) for the root and a `CNAME` for `www`.

The earlier targets `geo.surge.sh` and `na-west1.surge.sh` keep working and are geo-aware too; there's no need to change a record that already has one.

## Option 3: `A` record at your current DNS provider

Point the hostname directly at a Surge edge address:

```txt
@        A       138.197.235.123
```

This is the address the CLI prints after every publish that's waiting on dns, and it works for the root or any subdomain. The trade-off is routing: an `A` record pins the hostname to a single region, so every visitor is served from that edge rather than the nearest one—the publish output reports it as **using Surge A Record, not geo-aware**. The server table in that same output lists every region's address; any of them works as an `A` record and pins the domain to that region instead.

Two things to keep in mind:

- The hostname must resolve *only* to Surge. Mixing a Surge address with another host's `A` record round-robins visitors between the two, and Surge treats the domain as not pointed.
- The most common arrangement is an `A` record for the root and a `CNAME` for `www`. Publish to whichever form you want as canonical; Surge [redirects the other](#www-and-the-root-domain) automatically.

## Checking the status

```sh
surge example.com status
```

(`surge example.com debug status` is the same command.) A custom domain moves through three states, and only the first is yours:

- **waiting on dns** — the domain doesn't resolve to Surge yet. The exact records to add are printed underneath.
- **securing** — DNS is right and Surge is provisioning the certificate. No action needed.
- **live** — verified by a real request against the edge, with the URL to visit.

Every publish reports the same status, so there's no need to run the check unless you want to watch it happen. DNS changes take time to propagate depending on the provider—Surge picks the domain up the moment the records are in place.

One more state applies to `surge.sh` subdomains published by a newly signed-up account:

- **ready** — published, and serving once you verify your email.

A new account's `surge.sh` domains serve for their first 90 minutes; after that they show **ready** until the account's email address is verified. Click the link in the verification email (`surge verify` sends a fresh one) and they serve again—nothing to republish.

## Remembering the domain

Publish to the domain once and Surge records it in a [`CNAME` file](https://surge.sh/docs/cli/publishing#the-cname-file) in your project—from then on, `surge publish` needs no arguments.

## Subdomains

Each subdomain is its own independent project—own revisions, own settings, own owner:

```sh
surge ./www  example.com
surge ./docs docs.example.com
surge ./app  app.example.com
```

On a delegated domain every subdomain already resolves to Surge; nothing to add. With a `CNAME` or `A` record at your own provider, each subdomain you publish to needs its own record—or a wildcard (`*`) record pointing at Surge covers them all.

## www and the root domain

You don't need to publish to both. Surge redirects the `www` form of your domain to the root automatically—or vice versa, if you publish to the `www` form. Either way there's exactly one canonical URL for every page, which is what search engines want to see. The redirect needs both hostnames to reach Surge: automatic on a delegated domain, and one record each with a `CNAME` or `A`. See [Clean URLs](https://surge.sh/docs/platform/clean-urls).

## HTTPS for your domain

Once the domain resolves to Surge, a free managed certificate is provisioned automatically and renewed before it expires—`surge example.com status` shows it happening. See [SSL & HTTPS](https://surge.sh/docs/platform/ssl).
