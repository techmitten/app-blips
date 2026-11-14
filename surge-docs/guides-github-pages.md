# Migrate from GitHub Pages

Surge and GitHub Pages share the `CNAME` convention—the file in your repo that names your custom domain means the same thing to both. Most projects migrate in minutes, and because both hosts keep serving until DNS moves, there's no downtime window.

## 1. Publish what you already have

Find the directory Pages serves—the repo root, `/docs`, or your build output—and publish it to a test domain first:

```sh
surge ./docs my-project.surge.sh
```

If Pages was building Jekyll for you, build locally and publish the result:

```sh
bundle exec jekyll build
surge ./_site my-project.surge.sh
```

Check the `.surge.sh` URL. That's your project on [Surge's CDN](https://surge.sh/docs/platform/cdn)—already propagated to every region, before you've touched DNS.

## 2. Publish to your real domain

Your repo's existing `CNAME` file already names it, so:

```sh
surge ./docs publish
```

reads the domain straight from the file. The output reports **waiting on dns** with the records to add—your project is staged on the edge, waiting for the domain to arrive.

## 3. Move DNS

At your DNS provider, replace the Pages records (the `185.199.108–111.x` A records, or the `CNAME` to `username.github.io`) with Surge's—either [delegate to Surge's name servers or CNAME to the edge](https://surge.sh/docs/guides/custom-domain#2-point-the-domain-at-surge). Until propagation completes, visitors reach Pages; after, they reach Surge. Both serve the same content the whole way through—no gap, no rush, no maintenance page.

```sh
surge example.com debug status
```

tells you the moment it's **live**, verified against the actual edge. The certificate provisions itself during **securing**—nothing to configure.

## What you gain

Publishing decouples from pushing: ship from your machine, from [CI](https://surge.sh/docs/guides/github-actions), from anywhere—no waiting on a Pages build, and the repo can stay private without a plan discussion. Every publish is a [revision with instant rollback](https://surge.sh/docs/cli/revisions). [Previews](https://surge.sh/docs/cli/previews) exist. And your not-found page is just [`404.html`](https://surge.sh/docs/platform/custom-404), same as it was.

One honest boundary: `username.github.io` domains belong to GitHub and can't move—this migration is for projects on custom domains, or projects ready to have one. Custom domains are [free on Surge](https://surge.sh/docs/platform/plans), certificate included.
