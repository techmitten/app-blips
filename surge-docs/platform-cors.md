# Cross-Origin Resource Sharing

Browsers block cross-origin use of certain resources by default—web fonts referenced from another domain, `fetch()` requests, WebGL textures, some SVG uses. If a project on Surge hosts assets that your *other* domains need to load, enable CORS for it with a `CORS` file (no extension) in the root of the directory you publish.

This is the setup for using a Surge project as an asset host: fonts shared across your properties, an icon set, a data file your apps fetch.

## Allow any origin

Put a single `*` in the file:

```sh
echo '*' > CORS
surge publish
```

Every response now carries `Access-Control-Allow-Origin` permitting any origin to use the assets. Right choice for public assets—fonts, icons, open data.

## Allow specific origins only

List the origins, one per line, instead:

```txt
https://example.com
https://blog.example.com
```

Only those origins are permitted; requests from anywhere else still get the browser's default blocking.

## Notes

- The `CORS` file itself is never served.
- CORS is free on every plan. The same policy can also be set from the platform side, without a file, with [`surge <domain> config --cors`](https://surge.sh/docs/cli/config#the-settings).
- The policy applies project-wide. If only some assets should be shared, put them in their own project (a dedicated `assets.example.com`, say) and give that project the `CORS` file.
