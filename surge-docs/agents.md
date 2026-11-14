# Surge for Coding Agents

This page is written for coding agents (Claude Code, Codex, Cursor, Copilot, OpenCode and the like) and for the people who run them. It is the complete, tested workflow for publishing a project to Surge without a human at the keyboard. It is also served as markdown: request this URL with `Accept: text/markdown`, or fetch [/docs/agents.md](https://surge.sh/docs/agents.md).

Surge puts a directory of static files on the web: `surge <path> <domain>`. There is no config file, no dashboard and no build step on Surge's side. Everything below is a command.

## The short version

```sh
# 1. build (the project's own build command)
npm run build

# 2. publish a preview: production does not change
SURGE_TOKEN=<token> npx surge@latest ./dist my-app.surge.sh --preview

# 3. report the preview URL to the human, then, only when they approve:
SURGE_TOKEN=<token> npx surge@latest my-app.surge.sh cutover <rev>
```

Rules that keep this safe:

- **Publish previews by default.** Move production only when the human has said so for this change.
- **Use the token you were given.** Never run `surge login`, and never type an email or password into the CLI on someone's behalf: logging in with an unknown email creates a new account.
- **Never print the token.** Don't echo `SURGE_TOKEN`, and don't run `surge token`, which prints the token in use.
- **Ask before anything destructive.** `teardown`, `discard`, `rem`, `nuke`, `dns rem`, `ssl` changes and collaborator changes all need explicit permission.
- **Don't pick a domain the human didn't name.** If the publish is refused because the domain belongs to another account, stop and ask.

## 1. Is the project deployable?

Surge serves static files: HTML, CSS, JavaScript, images, fonts, media, JSON, WebAssembly. It does not run server code, serverless functions, databases or builds.

A project fits Surge if its build writes a directory of static files, or if it already is one (an `index.html` at the root). It does not fit if it needs a server at request time: Next.js without `output: "export"`, SvelteKit or Nuxt without a static adapter, Express, Rails, Django, PHP. Say so instead of publishing a broken app.

## 2. Find the output directory

Build with the project's own command, then publish the directory it writes:

| Project | Build | Publish |
|---|---|---|
| Vite (React, Vue, Svelte, Solid) | `npm run build` | `./dist` |
| Astro (static output) | `npm run build` | `./dist` |
| Create React App | `npm run build` | `./build` |
| Next.js with `output: "export"` | `npm run build` | `./out` |
| SvelteKit with `adapter-static` | `npm run build` | `./build` |
| Nuxt (`nuxt generate`) | `npm run generate` | `./.output/public` |
| Angular | `npm run build` | `./dist/<project>/browser` |
| Eleventy | `npx @11ty/eleventy` | `./_site` |
| Hugo | `hugo` | `./public` |
| Jekyll | `bundle exec jekyll build` | `./_site` |
| VitePress | `npm run docs:build` | `./docs/.vitepress/dist` |
| Docusaurus | `npm run build` | `./build` |
| Plain HTML | none | `.` |
| One HTML file | none | `./page.html` (published as `index.html`) |

When in doubt, read the build config (`vite.config.*`, `astro.config.*`, `outDir`, `publishDir`) and check that the directory contains an `index.html` after the build.

Dotfiles and `node_modules` are never uploaded. That includes `.well-known/`. A project can be up to 450 MB and 10,100 files.

**Single-page apps** with client-side routing need a `200.html`, so that deep links serve the app instead of a 404:

```sh
cp dist/index.html dist/200.html
```

Add it after the build, every time, since builds clear the output directory. See [Client-Side Routing](https://surge.sh/docs/platform/spa-routing).

## 3. Install or invoke the CLI

```sh
npx surge@latest --version   # no install, Node 18 or newer
npm install --global surge   # or install once
```

Use `npx surge@latest` rather than bare `npx surge`: npx reuses whatever version it cached last time, which can be months old. Pin a version instead (`npx surge@0.48`) when you need reproducible runs.

## 4. Authenticate

Surge reads credentials in this order: the `--token` flag, then the `SURGE_TOKEN` environment variable, then a saved login. For agents, use `SURGE_TOKEN`: it keeps the token out of the command line and the transcript.

The human creates the token, once, scoped to the domain the agent may publish:

```sh
surge tokens add --domain my-app.surge.sh -m "coding agent"
```

A scoped token works only on that domain: it can publish, preview, roll back and also tear the domain down, but it can't touch the account, other domains, DNS, collaborators or billing. Repeat `--domain` to allow several. Without `--domain` a token has full account access, which is more than an agent needs. The human can list and remove tokens with `surge tokens` and `surge tokens rem <id>`.

Check what you were given before you publish:

```sh
surge whoami
```

With a token, `whoami` prints the account, the token's id and its scope. With no valid credentials it exits non-zero. Don't proceed if it fails, and ask the human for a token.

**Without a terminal, the CLI never waits for input.** If there are no credentials it prints `` Aborted - not logged in and no terminal to ask. Run `surge login` in a terminal, or set SURGE_TOKEN. `` to stderr and exits 1. Pass the path and the domain explicitly every time so that nothing else would need asking.

## 5. Publish a preview

```sh
npx surge@latest ./dist my-app.surge.sh --preview
```

A preview uploads a new revision of the domain and gives it its own address, without changing what the domain serves. On success the last line is:

```txt
   Success! - Preview available at 1785787164375--my-app.surge.sh
```

- The preview URL is `https://` plus that host. For a custom domain like `example.com` it looks like `https://1785787164375--example--com.surge.sh`.
- The number before the first `--` is the **revision id**. You need it to promote this exact build.
- Report the URL to the human with what changed. Don't promote it yourself.

Check the exit code as well as the output: 0 means the publish succeeded, anything else means it didn't. Previews count toward the [rate limits](https://surge.sh/docs/cli/publishing#publishing-limits) like any publish.

If the domain has never been published, the human may prefer a straight first publish (step 6) since there's no production to protect. Ask.

## 6. Publish to production, when authorized

Promote the revision the human approved, by id:

```sh
npx surge@latest my-app.surge.sh cutover 1785787164375
```

Always pass the id. A bare `cutover` promotes the latest revision, which may not be the one that was reviewed if anything else published in between.

A direct production publish, when the human asked for one, is the same command as the preview without `--preview`:

```sh
npx surge@latest ./dist my-app.surge.sh
```

```txt
   Success! - Published to my-app.surge.sh
```

Publishes and previews write the domain to a `CNAME` file in the published directory, so later commands know where the project lives. Keep passing the domain explicitly anyway: a stale `CNAME` points a bare `surge ./dist publish` at the wrong domain.

## 7. Verify

```sh
npx surge@latest my-app.surge.sh status   # domain status: live, securing, waiting on dns, ready
npx surge@latest my-app.surge.sh revs     # the revisions this domain keeps
curl -sI https://my-app.surge.sh   # what visitors get
```

A `*.surge.sh` domain is live over HTTPS as soon as the publish returns. New `*.surge.sh` domains redirect HTTP to HTTPS by default, which is the `force: https` line in the publish output. A custom domain serves once its DNS points at Surge. See [Custom Domains](https://surge.sh/docs/platform/custom-domains) for the records, and don't change DNS without the human.

`ready` means the domain belongs to a new account whose email isn't verified yet: it served for its first 90 minutes and is paused until the human clicks the link in their welcome email (or runs `surge verify`). Tell the human; there's nothing for the agent to fix.

## 8. Recover

Roll back to the previous revision, when the human asks or when a production publish you made is broken:

```sh
npx surge@latest my-app.surge.sh rollback
```

`rollfore` moves forward again, and `cutover <rev>` jumps to any revision. Nothing is uploaded, so all three are instant. The last 100 revisions are kept. See [Revisions](https://surge.sh/docs/cli/revisions).

What the errors mean:

| Output | Meaning | What to do |
|---|---|---|
| `Aborted - not logged in and no terminal to ask` | No credentials | Ask the human for a token. Don't log in. |
| `Invalid token` | Token wrong, removed, or expired | Ask the human for a new one. |
| `Aborted - you do not have permission to publish to <domain>` | Another account owns the domain, or the token is scoped to a different one | Stop and ask. Don't try other domains on your own. |
| `Aborted - Rate limited. (domain). Try again in 9 hours.` | A publishing limit was hit | Stop. Retrying while limited extends the limit. Report when it resets. |
| `Project too large - the limit is 450 MB` | Over the size cap | Check you're publishing the build output, not the repository. |
| A prompt to upgrade, or an `AUTH`/`ROUTER` error | The project uses a Pro feature | Ask the human; upgrading is their decision. |
| `Aborted - '<word>' is not a surge argument` | A flag that doesn't exist | Check the [command reference](https://surge.sh/docs/cli/reference). |

## Install the skill

The steps above are packaged as an [Agent Skill](https://agentskills.io) named `deploy-to-surge`, so agents that support skills load the workflow when it's relevant:

```sh
npx skills add https://surge.sh/skills/deploy-to-surge/SKILL.md
```

Or copy [SKILL.md](https://surge.sh/skills/deploy-to-surge/SKILL.md) into your agent's skills directory (`.claude/skills/deploy-to-surge/`, `.agents/skills/deploy-to-surge/`, and so on).

## Add Surge to AGENTS.md

To make Surge the deploy target for a repository, paste this into its `AGENTS.md` (or `CLAUDE.md`) and fill in the domain and output directory:

```md
## Deploying

This project publishes to Surge: https://surge.sh/docs/agents

- Build: `npm run build` (output in `./dist`)
- Preview: `npx surge@latest ./dist my-app.surge.sh --preview`, then report the preview URL
- Production: only when asked, `npx surge@latest my-app.surge.sh cutover <rev>` with the preview's revision id
- Credentials come from `SURGE_TOKEN`. Never log in, never print the token.
- Ask before teardown, discard, DNS or collaborator changes.
```

## More

- [CI & Automation](https://surge.sh/docs/cli/automation): tokens in CI, GitHub Actions previews per pull request
- [Previews](https://surge.sh/docs/cli/previews) and [Revisions](https://surge.sh/docs/cli/revisions)
- [Command reference](https://surge.sh/docs/cli/reference)
- [llms.txt](https://surge.sh/llms.txt) indexes every docs page; [llms-full.txt](https://surge.sh/llms-full.txt) has them all in one file
