# onnxruntime-node-stub

`package.json` overrides `onnxruntime-node` (pulled in by
`@huggingface/transformers`) with this no-op stub. AppBlips only uses
`@huggingface/transformers` in the browser (`src/lib/whisperWorker.js` via
`onnxruntime-web`), never in Node.

The real `onnxruntime-node@1.21.0` runs a `postinstall` script
(`node ./script/install`) that attempts to download
`onnxruntime-linux-x64-gpu-1.21.0.tgz` from GitHub Releases and fails with
HTTP 404 on Linux x64 hosts using npm 10 (such as Cloudflare Workers Builds),
where `package.json`'s `allowScripts` is ignored. Overriding it here avoids
both the failing download and ~300 MB of unused native binaries across every
npm version and CI environment, while still providing `onnxruntime-common@1.21.0`
which `@huggingface/transformers`'s browser bundle imports.
