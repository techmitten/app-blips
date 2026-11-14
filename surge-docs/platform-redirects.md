# Redirects

Redirects live in a `ROUTER` file (no extension) at the root of the directory you publish. One rule per line: a status code, the pattern to match, and where to send it.

```txt
301   /contact   /about
```

`ROUTER` files are a Pro feature—publishing a project that contains one prompts you to upgrade right in the CLI if you haven't already. See [Plans](https://surge.sh/docs/platform/plans).

## Status codes

| Code | Meaning |
|------|---------|
| `301` | Moved permanently. Browsers and search engines update to the new URL. |
| `302` | Found—a temporary redirect, the classic form. |
| `307` | Moved temporarily, and the request method is kept. The original URL stays canonical. |

Use `301` for content that has genuinely moved; `302` or `307` for temporary detours you expect to undo.

## Pattern routes

Named segments capture parts of the path and substitute into the destination:

```txt
301   /my-blog/:title   /articles/:title
```

Now `/my-blog/my-first-post` redirects to `/articles/my-first-post`. Segment names are yours to choose. This is the tool for migrating URL schemes wholesale—for example, moving off a WordPress-style structure:

```txt
301   /:year/:month/:day/:slug   /blog/:slug
```

## Query strings and trailing slashes

Rules match the path only. A request's query string rides along to the destination, so with `301 /contact /about`, a request for `/contact?ref=hn` lands on `/about?ref=hn`. A trailing slash is forgiven too: `/contact/` matches the `/contact` rule (an exact match elsewhere in the file still wins).

## External redirects

The destination can be a full URL on another host:

```txt
307   /blog   https://medium.com/surge-sh
```

## A complete ROUTER

```txt
301   /:year/:month/:day/:slug   /blog/:slug
301   /contact                   /about
307   /code                      https://github.com/sintaxi/surge
```

Rules are one per line and publish with the project like any other file—so your redirect table is versioned alongside your code, and [rolling back](https://surge.sh/docs/cli/revisions) a revision rolls back its redirects too. The `ROUTER` file itself is never served.

Note you don't need `ROUTER` rules for the redirects Surge already does automatically—trailing slashes, `www` folding, and HTTPS enforcement are covered in [Clean URLs](https://surge.sh/docs/platform/clean-urls) and [SSL](https://surge.sh/docs/platform/ssl).
