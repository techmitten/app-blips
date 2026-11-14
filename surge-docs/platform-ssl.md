# SSL & HTTPS

## surge.sh subdomains

Every project on a `surge.sh` subdomain is served over HTTPS automatically, covered by Surge's certificate. There is nothing to configure. A new `<name>.surge.sh` domain also [forces HTTPS](#forcing-https) from its first publish.

## Custom domains

Custom domains get free managed certificates, provisioned automatically. Once your [domain points at Surge](https://surge.sh/docs/platform/custom-domains), the platform obtains a certificate from a trusted CA, installs it across every edge node, and **renews it before expiry**—no command to run. While that's happening the domain reports **securing**; when every edge is serving it, **live**:

```sh
surge example.com status
```

Delegated domains get a single wildcard certificate covering the root and every subdomain, so new subdomains are secured the moment they're published.

Inspect the certificate any time with `surge example.com debug certs`, check it node by node with `surge example.com debug audit`, or provision it on demand with `surge example.com debug encrypt`. Details of the commands are in the [CLI SSL docs](https://surge.sh/docs/cli/ssl).

## Forcing HTTPS

Having a certificate makes your project available over HTTPS; forcing HTTPS also redirects every plain-HTTP request. Publish with `--force https`:

```sh
surge ./dist example.com --force https
```

From then on, `http://example.com/…` answers with a redirect to the `https://` URL. This is the right setting for almost every project—browsers and search engines both favor it. The choice sticks with the project across subsequent publishes—no need to pass the flag again.

The same setting is available without publishing, as [configuration](https://surge.sh/docs/cli/config):

```sh
surge example.com config --force https   # set
surge example.com config --force http    # pin to plain HTTP instead
surge example.com config --force null    # clear: serve both
```

New `<name>.surge.sh` domains start out with `force` set to `https`; `--force http` undoes it. Domains that already existed keep serving both until you choose. To also have browsers insist on HTTPS, set an [`hsts`](https://surge.sh/docs/cli/config#the-settings) max-age.
