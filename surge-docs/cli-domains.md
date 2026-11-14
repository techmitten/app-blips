# Domains & DNS

Custom domains are free on Surge. Publish to one the same way you'd publish to a subdomain:

```sh
surge ./dist example.com
```

For the domain to resolve, it has to point at Surge—by delegating to Surge's name servers, a `CNAME` record, or an `A` record. The records, the trade-offs between the three, and the domain's states (**waiting on dns** → **securing** → **live**) are all in [Custom Domains](https://surge.sh/docs/platform/custom-domains). Until the domain points at Surge, every publish prints the exact records to add; check where things stand any time with [`surge <domain> status`](https://surge.sh/docs/cli/analytics#status).

This page covers the CLI side: the DNS records Surge answers for a delegated domain.

## Managing DNS records

Once a domain is delegated to Surge's name servers (`ns1`–`ns4.surge.world`, also printed by bare `surge <domain> dns`), the `dns` commands manage your custom records—no dashboard needed. This is how you keep email, subdomains, and verification records working on a domain that Surge serves:

```sh
surge example.com dns list                        # view records
surge example.com dns add <type> <name> <value>   # add a record
surge example.com dns rem <id>                    # remove a record
```

For example:

```sh
# Point a subdomain somewhere else
surge example.com dns add CNAME app app.example.dev

# Domain verification for a search console
surge example.com dns add TXT @ "google-site-verification=…"

# Mail — MX records take a priority before the value
surge example.com dns add MX 10 mail.example.com
surge example.com dns add MX @ 10 mail.example.com   # explicit host form
```

Adding or removing a record prints the resulting record set along with a `Success` confirmation. Each record has an id, shown in the listing, which is what `rem` takes.

DNS management applies to apex domains (`example.com`, not `sub.example.com`) that are delegated to Surge's name servers. Add your existing records *before* switching the name servers, and nothing skips a beat.

## Viewing the full zone

`dns list` shows the records *you've* added. To see everything Surge is answering for the domain—including the records it manages automatically—use `zone`:

```sh
surge example.com zone
```

This prints the domain's complete zone in BIND format: SOA, NS, and all records. `zone` also supports `add` and `rem` with the same syntax as `dns`, for the rare case where you need to override a managed record.

## Subdomains

Every subdomain is its own independent project—`surge ./docs docs.example.com`—with its own revisions, settings, and owner. See [Subdomains](https://surge.sh/docs/platform/custom-domains#subdomains) for what each DNS setup needs.
