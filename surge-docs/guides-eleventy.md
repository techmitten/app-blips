# Publish an Eleventy Project

Eleventy renders to `_site/` by default, and a rendered `_site/` is a finished Surge project. No plugin, no adapter.

## Build and publish

```sh
npx @11ty/eleventy
surge ./_site my-project.surge.sh
```

The publish output confirms every node of [the CDN](https://surge.sh/docs/platform/cdn) individually—your project is live worldwide when the command returns, not minutes later.

## Keep the domain across builds

That first publish wrote the domain to `_site/CNAME`—but Eleventy rebuilds `_site/`, so move the file to the project root and tell Eleventy to pass it through to every build:

```sh
mv _site/CNAME CNAME
```

```js
// eleventy.config.js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("CNAME")
}
```

Now every build lands in `_site/` with its domain aboard, and publishing is argument-free:

```sh
npx @11ty/eleventy && surge ./_site publish
```

## Ignore the sources

If you publish from the project root instead of `_site/` by accident, [`.surgeignore`](https://surge.sh/docs/cli/publishing#ignoring-files) is the guard rail—but the cleaner habit is what this guide shows: publish the output directory, keep sources out of the question entirely.

## Custom domain

Same command, your domain: `surge ./_site example.com`. The output prints the DNS records to add, and [the custom-domain guide](https://surge.sh/docs/guides/custom-domain) walks the whole path to `live`.
