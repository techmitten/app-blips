# Plans

Surge has two plans, both account-level: **Free** and **Pro**. Every project and domain on your account is on your account's plan—there's nothing to choose per project.

## Free—actually free

The core of Surge costs nothing, without trial windows or project caps:

- Unlimited projects and domains, with publishing under [rate limits](https://surge.sh/docs/cli/publishing#publishing-limits) that apply to every plan
- [Custom domains](https://surge.sh/docs/platform/custom-domains)
- Managed [SSL certificates](https://surge.sh/docs/platform/ssl), provisioned automatically, and forced HTTPS
- The [CDN](https://surge.sh/docs/platform/cdn), [clean URLs](https://surge.sh/docs/platform/clean-urls), [revisions](https://surge.sh/docs/cli/revisions) (the last 100 per domain), and [teams](https://surge.sh/docs/cli/teams)
- [Cross-origin resource sharing](https://surge.sh/docs/platform/cors) (`CORS` file or `config --cors`)
- [Private domains](https://surge.sh/docs/cli/config#private-domains) (`--private`), served only to the people who can publish them

## What Pro adds

Pro unlocks exactly two features:

- [Password protection & protected paths](https://surge.sh/docs/platform/auth) (`AUTH` file)
- [Redirects](https://surge.sh/docs/platform/redirects) (`ROUTER` file)

Current pricing is listed by the CLI itself—`surge plan` shows each plan with its price and perks—and on the [pricing page](https://surge.sh/pricing). The bill is the plan price: no overage charges, ever.

## Upgrading

You don't have to decide in advance. Publish a project that uses a Pro feature—an `AUTH` file, say—and the CLI walks you through upgrading right in the publish, card entry included. Or manage it explicitly:

```sh
surge plan            # interactive picker in the terminal
surge plan --web      # checkout in the browser
surge plan --manage   # plan, card & invoices in the browser
```

Upgrade, downgrade, or cancel at any time; `surge plan --manage` opens a private billing portal with your invoices. See [Account & Plans](https://surge.sh/docs/cli/account) for the commands in detail.
