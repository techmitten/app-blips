<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/blackblipsbg.webp" />
    <img src="docs/logo-light.png" alt="AppBlips — Text to App and Website Generator" width="320" />
  </picture>
</p>

<p align="center">
  <strong>Turn plain-English prompts into working apps, games, and websites in seconds.</strong>
</p>

<p align="center">
  <a href="https://apps.microsoft.com/detail/9nk9ss4v2n1k?hl=en-US&amp;gl=US"><img alt="Download for Windows" src=".github/readme/download-windows.svg" width="200" height="61"></a>
  <a href="https://github.com/TechMitten/app-blips/releases/latest"><img alt="Download for Ubuntu" src=".github/readme/download-ubuntu.svg" width="200" height="61"></a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <a href="https://github.com/techmitten/app-blips/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/techmitten/app-blips?style=flat&color=yellow"></a>
  <a href="https://discord.gg/a7QfqbvaF9"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white"></a>
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white">
</p>

---

**AppBlips** lets anyone build functional apps, websites, and 2D games from natural-language descriptions—no coding required, with full code access when you want it.

Run it locally with your own API key (Anthropic, OpenAI, Gemini, DeepSeek, or OpenRouter) or sign in to an optional AppBlips plan. There is no vendor lock-in: the generated code is always yours to inspect, edit, export, or host anywhere.


## Key Features

### Creation & Editing
- **Instant Live Preview** — Watch your project render in a sandboxed view with desktop/mobile toggles and zoom controls.
- **Visual Click-to-Edit** — Select elements directly in Website Studio to edit text, swap images, update links, or trigger targeted AI refinements from the context menu.
- **Built-in Code Editor** — Inspect and edit code directly with syntax highlighting and local autocomplete. Manual edits are saved as new versions, and syntax errors are reported without being silently overwritten by the AI.
- **Project Image Gallery ("My Images")** — Upload your own assets or pull free stock photos via Pixabay, then reference them in your prompts (e.g., *"use team-photo in the hero section"*).
- **Local Voice Input** — Dictate prompts using a bundled Whisper model that runs entirely on your device—no audio ever leaves your machine.
- **Automatic Versioning** — Every generation and manual edit is saved as a snapshot that you can undo or restore at any time.

### AI & Integrations
- **Bring Your Own Key** — Connect an API key from Anthropic, OpenAI, Gemini, DeepSeek, or OpenRouter with configurable model reasoning levels.
- **Extensions** — Easily integrate Web3Forms (contact forms), Umami/Plausible (analytics), tawk.to (live chat), Square (payments), Pollinations (AI media & chat), Pixabay (stock photos), and Tavily (live web search for the AI).
- **Built-in SEO** — Answer a few quick questions in **Settings → Tools** to automatically generate SEO metadata, a `sitemap.xml`, and a `robots.txt` on export or publish.

### Import, Export & Publishing
- **Flexible Export** — Download any project as a self-contained HTML file, or export App Studio projects as a full React + Vite codebase.
- **Project Import** — Import an existing single-file HTML page, a `.zip` archive of an HTML/CSS/JS site, or a React + Vite project.
- **One-Click Web Publishing** — Deploy directly to a free `*.surge.sh` HTTPS domain with optional password protection, custom favicons, and PWA install prompts.
- **Community Explore** — Browse community-built websites and games inside the app and submit your own creations.

---

## Quick Start

### 1. Desktop App (Windows, Linux, macOS)
- **Windows:** Install from the **[Microsoft Store](https://apps.microsoft.com/detail/9nk9ss4v2n1k)** (includes automatic updates).
- **Linux:** Download the `.AppImage` or `.deb` package from **[GitHub Releases](https://github.com/TechMitten/app-blips/releases/latest)**.
- **macOS:** Install via **[Pinokio](https://pinokio.co/apps/github-com-techmitten-app-blips-pinokio)** to run the local browser edition with your own API key, or use Docker / source below.

> **First run:** Pick a folder for your projects, then either enter an API key (encrypted via your OS keychain) or sign in to an AppBlips plan.

### 2. Docker (All Platforms)
With [Docker Compose v2](https://docs.docker.com/get-docker/) installed, run:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). Stop with `docker compose down`, or update with `git pull && docker compose up -d --build`.

### 3. Run from Source
Requires [Node.js](https://nodejs.org/) 22.12 LTS or newer.

```bash
git clone https://github.com/techmitten/app-blips.git
cd app-blips
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).
- **Desktop development:** Run `npm run desktop` for development, or `npm run desktop:dist` to build installers in `dist-desktop/`.
- **Configuration:** Copy `.env.example` to `.env` to customize server or provider settings.

---

## Architecture & Developer Notes

```text
src/
  App.jsx            # Workspace state, undo/redo history, and composition root
  previewBridge.js   # Script injected into generated apps to communicate with the sandboxed iframe
  lib/               # Core logic: LLM requests, surgical code edits, prompts, and helpers
  hooks/             # React hooks for project state, preview viewport, image gallery, and themes
  components/        # UI components: Header, BuildPanel, PreviewPane, and modals
electron/            # Desktop app: main process, preload, disk storage, and in-process API routes
server.js            # Web server (npm start / Docker): serves dist/ and /api/* endpoints
testing/             # Standalone Node test scripts for backend routes and preview logic
scripts/             # Build scripts, including Whisper model fetching
```


## License

Licensed under the [MIT License](LICENSE). Third-party open-source licenses are available in the app under **Settings → About → Licenses**.
