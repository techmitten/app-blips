# Custom 404 Pages

When a visitor requests a page that doesn't exist, Surge serves your project's `404.html` if it has one—styled like the rest of your project, saying what you want said—with a proper `404 Not Found` status.

Add the file to the root of the directory you publish:

```txt
my-project/
├── index.html
├── about.html
└── 404.html
```

Then deploy as usual. Every unmatched URL on the project now renders your page:

```sh
surge publish
```

A good 404 page is small, loads instantly, and offers a way forward—a link home, your navigation, or a search box. Since it's just a page in your project, it can use your project's CSS and assets like any other.

Many static generators can emit a `404.html` for you (Jekyll, Hugo, Astro, and others have it as a convention)—if yours does, it works on Surge with no extra configuration.

Building a single-page app? You likely want [`200.html`](https://surge.sh/docs/platform/spa-routing) instead, so unmatched URLs boot your app rather than dead-ending.
