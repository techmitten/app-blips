# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AppBlips turns a text prompt into a working single-file app, website or browser game with a live sandboxed preview. It also imports and edits React + Vite codebases. It is a React 19 + Vite 8 + Tailwind 4 client written in plain JavaScript (JSX, no TypeScript sources). The same client ships as an Electron desktop app, a browser version (`server.js`, Docker, Cloudflare Worker) and an Android app (Capacitor).

## Commands

Node 22.12+.

- `npm run dev`: Vite dev server on `127.0.0.1:5175` (`strictPort`; a different port is a different origin with no saved provider). Vite middleware answers `/api/*` with the same handlers as the server.
- `npm run check`: type check (`scripts/typecheck.js`) then ESLint. The type check runs `tsc` over the JS but only fails on error codes that are always real bugs (missing names/modules/exports, wrong argument counts, syntax).
- `npm run lint`, `npm run typecheck`
- `npm run build`: client build into `dist/` (always `--mode desktop`; every target uses this build).
- `npm start`: build, then serve `dist/` and `/api/*` with `server.js` on `127.0.0.1:3000`.
- `npm run build:server`: bundle `server.js` into one file for the Docker image (no node_modules).
- `npm run desktop`: build and launch Electron. `npm run desktop:dist` builds the AppImage, .deb and snap into `dist-desktop/`.
- `npm run release [minor]`: see `notes/RELEASING.md`.

### Tests

Tests are standalone Node scripts in `testing/`, run with the built-in `node:test` runner. There is no Jest or Vitest.

- `npm test` runs every `testing/test*.js` except five Playwright UI tests. CI runs lint, build, `build:server`, then `npm test`.
- One test: `node --test testing/testSurgicalEdits.js`
- `testing/testServer.js` spawns `server.js`, so run `npm run build` first.
- `testing/*.mjs` and the five excluded UI tests (`testGuidedTour`, `testImportEnvironmentUI`, `testOutputTokenSettingsUI`, `testProviderModelsUI`, `testResponsiveLayout`) use Playwright Chromium and are run directly, e.g. `node testing/testReactPreview.mjs`. The UI tests need a running dev server; the header comment of each file gives its exact command and URL variable.

## Architecture

### One client, several hosts

The renderer in `src/` is identical everywhere. What differs is who answers `/api/*` and where projects and keys are stored.

- **Shared request handlers** live in `electron/server/`. They take a Fetch `Request` and return a `Response`, and use only Node built-ins. Four hosts mount them:
  - `electron/main.js`: serves `dist/` from the privileged `appblips://app` scheme through `protocol.handle`, so the handlers run in-process with no network port. Projects are stored on disk (`projectStore.js`) and provider keys in the OS keychain (`providerStore.js`). The renderer reaches them only through `preload.cjs` IPC.
  - `server.js`: the `npm start` and Docker server. Single-user, loopback by default, with a Host allow-list (`hosts.js`).
  - `vite.config.js`: dev middleware.
  - `worker/index.js`: the hosted browser version at web.appblips.com on Cloudflare Workers (`wrangler.jsonc`). It deploys automatically on push to `master`. Free-AI counts live in a Durable Object (`worker/freeLimitsObject.js`).

  A new `/api/*` route has to be wired into each host that needs it.
- **Browser hosts** keep projects in IndexedDB/localStorage. Each request carries the visitor's own keys (`browserKeys.js`), so one server never stores or shares keys. `src/lib/desktop.js` hides the difference: `isDesktop`, the project store and `providerApi`.
- **Free AI** (no key) is the server's own provider, limited by `freeLimits.js` and gated by Clerk sign-in (`freeAuth.js`, `freeSignInConfig.js`, `clerkWebhook.js`). Server settings are the `OPENAI_*`, `APPBLIPS_*` and `CLERK_*` variables in `.env.example`.
- `chatProxy.js` forwards chat to the provider and `relay.js` streams the response back. `providers.js` holds the provider list (Anthropic, OpenAI, Gemini, xAI, DeepSeek, OpenRouter).

### Generation pipeline (HTML studios: Website, Game, App)

- `src/App.jsx` is the composition root: workspace state, undo/redo version history, studios.
- `src/lib/llm.js` drives generation. Routers classify the request first (`isQuestionOnly`, `routeGameEngine`, `routeWebsiteAddons`). A first build streams a full HTML document. Later requests run a bounded tool-call **refinement loop** (`MAX_REFINEMENT_TURNS`) against an in-memory copy, using surgical edits (`src/lib/edits.js`), multi-page file tools (`pages.js`, `pageTools.js`), and syntax and broken-link repair passes. Prompts are in `src/lib/prompts.js`.
- Integrations ("connectors": Pollinations, Pixabay, Unsplash, Sheets, SEO, analytics…) are in `src/lib/connectors.js`. Their settings UIs are the `*Connector.jsx` components.

### Preview

- Generated code runs in an origin-isolated iframe (`sandbox` without `allow-same-origin`). `src/previewBridge.js` injects one inline script into the document: JSX compile, loop protection, Pollinations/Sheets helpers, source-position stamps for click-to-edit, gallery image rewriting. The parent talks to the frame only over `postMessage` (`hooks/usePreviewBridge.js`).
- Visual click-to-edit maps preview elements back to source through `sourcePositions.js`/`sourceMap.js`. The edits themselves are made by `directEdits.js`.

### Imported codebases (React + Vite)

`src/lib/codebase/` is a separate pipeline. `import.js` reads the zip. `bundler.js`, `esbuildBrowser.js` and `importMap.js` bundle the project in the browser with esbuild-wasm (npm imports come from a CDN import map). `previewHtml.js` builds the preview page. `codebase/llm.js` runs its own edit loop with codebase tools (`tools.js`) and runs a real build check after every turn that changes files, then feeds the errors back for repair. `export.js` writes the project back out.

### Other

- `src/lib/whisperWorker.js`: local voice input (transformers.js). `onnxruntime-node` and `minimatch` are replaced with local stubs in `vendor/` through package.json `overrides`. Keep them that way.
- `scripts/licenses.js`: a Vite plugin that collects third-party licenses for Settings → About.

## Docs

`docs/` is the Mintlify user documentation site. It is published when it changes on `master`, and nothing keeps it in sync with the app. Any change a user would notice needs a matching docs update.
