# Put a Project on Your Own Domain

Custom domains are free on Surge, certificates included and provisioned for you. This is the whole path: from a domain at a registrar to `live`, with the platform telling you whose move it is at every step.

## 1. Publish to the domain

Don't wait for DNS—publish first:

```sh
surge ./dist example.com
```

The publish succeeds immediately (your files are on [the CDN](https://surge.sh/docs/platform/cdn), staged), and the output reports the domain as **waiting on dns** along with the exact records to add. That status is the platform's honest answer to "why isn't it up yet?"—and it's the only step that's ever yours.

## 2. Point the domain at Surge

Pick one of the three ways in—[compared in depth on Custom Domains](https://surge.sh/docs/platform/custom-domains):

```txt
Name servers   ns1.surge.world  ns2.surge.world  ns3.surge.world  ns4.surge.world
CNAME          geo.surge.world
A              138.197.235.123
```

Delegating to the name servers is recommended: geo-aware routing, the apex and every subdomain covered, and extra records managed [from the CLI](https://surge.sh/docs/cli/domains). Recreate any records the domain already depends on before you switch. Keeping DNS at your current provider? Use a `CNAME` for subdomains, and an `A` record (or your provider's ALIAS/ANAME) for the apex.

## 3. Watch it go live

```sh
surge example.com status
```

The domain moves through three states, and only the first is yours: **waiting on dns** (add the records above) → **securing** (DNS is right; Surge is provisioning the certificate—no action, no charge) → **live** (verified by real requests against the actual edge, not a dashboard's optimism). DNS propagation at your registrar is the only wait in the pipeline; Surge picks the domain up the moment the records are in place.

## 4. Force HTTPS

Once live, publish with `--force https` to redirect all plain-HTTP traffic permanently:

```sh
surge ./dist example.com --force https
```

The choice sticks as [project configuration](https://surge.sh/docs/cli/config). To have browsers insist on HTTPS too, set an HSTS max-age: `surge example.com config --hsts 31536000`. More in [SSL & HTTPS](https://surge.sh/docs/platform/ssl#forcing-https).

## What you get

`www` folds into the apex automatically (or vice versa—whichever you publish is canonical). Every subdomain of a delegated domain is publishable as its own independent project—`surge ./docs docs.example.com`—each with its own [revisions](https://surge.sh/docs/cli/revisions) and settings. And the certificate renews itself forever; there is no step 5.
