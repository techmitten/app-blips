# Analytics & Diagnostics

Surge collects traffic analytics for every project at the edge—no script tag, no cookie banner, nothing added to your pages, nothing for your visitors to load—and renders them right in the terminal. The `stats` verbs answer the questions you actually ask about an audience; the `debug` verbs let you interrogate the platform node by node, because on a CDN "is it working?" is really ten questions with ten answers.

All of them take the target first, and resolve it from the current directory when you're inside the project.

## Stats

### traffic

```sh
surge example.com stats traffic
```

The overview: a bar chart of unique visitors across the last two weeks, visits and connections with day-over-day deltas, the share of traffic arriving encrypted, cache hit rates—plus the day's most-visited pages, 404s, redirects, and referring sources.

### audience

```sh
surge example.com stats audience
```

Who's visiting: browsers, operating systems, and device types, with counts.

### usage

```sh
surge example.com stats usage
```

Bandwidth: per-file bytes served today and yesterday, with a projected monthly total—so you can see exactly which assets are heavy before they become a problem.

### load

```sh
surge example.com stats load
```

Connection volume charted per datacenter across the network. Useful for understanding where in the world your traffic lands.

---

## Debug

### status

```sh
surge example.com debug status
surge example.com status          # the same command
```

The state of the domain itself: **waiting on dns** (not pointing at Surge yet—the records to add are printed), **securing** (certificate being provisioned), **ready** (a new account's `surge.sh` domain, published and serving once the email is verified), or **live** (serving, verified against the edge). This is the first command to reach for when a domain isn't behaving; it tells you whose move it is. The states are explained on [Custom Domains](https://surge.sh/docs/platform/custom-domains#checking-the-status).

### files

```sh
surge example.com debug files
```

Lists every file in the live revision with its size—the manifest of exactly what the CDN is serving, as opposed to what's on your disk.

### audit

```sh
surge example.com debug audit
```

Asks every edge node what it's serving for the domain: the revision, file count, total size, and the state of its SSL certificate. If a publish or certificate seems inconsistent from where someone's sitting, `audit` shows you node by node whether the network agrees.

### bust

```sh
surge example.com debug bust
```

Purges the project from the cache on every edge node, forcing the next request to fetch fresh content. Publishing invalidates correctly on its own, so day to day you shouldn't need this—it's the "make absolutely sure" lever, and it prints which nodes confirmed the purge.

### certs & encrypt

`debug certs` inspects the certificates installed for the domain, and `debug encrypt` provisions the managed certificate manually. Both are covered in [SSL Certificates](https://surge.sh/docs/cli/ssl).
