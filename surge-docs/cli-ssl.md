# SSL Certificates

Every project on Surge is served over HTTPS, and custom domains get managed certificates automatically—there is no certificate step in the normal flow. How that works and forcing HTTPS are covered in [SSL & HTTPS](https://surge.sh/docs/platform/ssl). This page covers the commands for watching that process and nudging it.

## Watching a domain go secure

```sh
surge example.com status
```

Reports **waiting on dns**, **securing**, or **live** (and **ready** for a new account's domains awaiting email verification)—see [Checking the status](https://surge.sh/docs/platform/custom-domains#checking-the-status). Publishing reports the same states, so you rarely need to ask separately.

## Forcing HTTPS

```sh
surge ./dist example.com --force https     # at publish
surge example.com config --force https     # or as configuration, no publish
```

The setting sticks across publishes; `surge example.com config --force null` clears it. See [Forcing HTTPS](https://surge.sh/docs/platform/ssl#forcing-https).

## Inspecting certificates

```sh
surge example.com debug certs
```

Prints every certificate installed for the domain—subject, issuer, alternate names, expiry, and whether auto-renewal is on. To check certificate state on each individual edge node (useful when diagnosing propagation), see [`debug audit`](https://surge.sh/docs/cli/analytics#audit).

## Provisioning manually

```sh
surge example.com debug encrypt
```

`debug encrypt` asks the platform to provision the domain's managed certificate right now, streaming progress as it goes. Since certificates are provisioned and renewed automatically, you shouldn't need it day to day—it's the lever for unusual situations, like re-securing a domain after DNS was broken for a long stretch.
