# Guides

The [CLI docs](https://surge.sh/docs/cli/) explain every command and the [Platform docs](https://surge.sh/docs/platform/) explain how serving works. Guides are the third thing: complete walkthroughs of the task you actually showed up with, start to finish, with nothing assumed and nothing left dangling.

Every guide ends the same way, because every path through Surge ends the same way: your project propagated to [every edge node of the CDN](https://surge.sh/docs/platform/cdn) before the command finishes—live everywhere, instantly, with an undo.

## Publish your framework's build

Any tool that produces a directory of static files works with Surge—these cover the details that differ, like where the `CNAME` file belongs so it survives your build:

- [Publish a Vite Project](https://surge.sh/docs/guides/vite)
- [Publish an Astro Project](https://surge.sh/docs/guides/astro)
- [Publish an Eleventy Project](https://surge.sh/docs/guides/eleventy)
- [Publish a Single-Page App](https://surge.sh/docs/guides/spa) — React Router, Vue Router, or any client-side routing

## Automate

- [Publish from GitHub Actions](https://surge.sh/docs/guides/github-actions) — a preview per pull request, production on merge

## Domains

- [Put a Project on Your Own Domain](https://surge.sh/docs/guides/custom-domain) — registrar to `live`, the whole path

## Migrate

- [Migrate from GitHub Pages](https://surge.sh/docs/guides/github-pages)
- [Migrate from Netlify](https://surge.sh/docs/guides/netlify)

Using a tool that isn't covered? The recipe is always the same shape: build, then `surge <output-directory> <domain>`. If your tool makes a folder of files, you're already done—[Getting Started](https://surge.sh/docs/getting-started) is the generic version.
