# The Surge CLI

`surge` is a command line tool for publishing static web projects. It does one thing exceptionally well—putting a directory on the web—and then gives you everything you need to run it in production: custom domains, SSL, instant rollbacks, DNS, teams, and analytics, all without leaving the terminal.

## Install

```sh
npm install --global surge
```

Requires [Node.js](https://nodejs.org) 18 or later. No account setup beforehand—the CLI walks you through creating one on first publish. See [Getting Started](https://surge.sh/docs/getting-started) for the full walkthrough.

## The whole surface

Everything the CLI does fits on one screen:

```
$ surge --help

  Surge.sh ⚡ Static Web Publishing 0.53.0

  PUBLISHING
    surge <path> <domain>                 publish dir to domain
    surge <path> publish                  publish using local CNAME
    surge <page.html> <domain>            publish one html page as index.html
    surge <path> <domain> --preview       publish a preview, production untouched

  REVISIONS
    surge <domain> revs                   list revisions
    surge <domain> cutover [<rev>]        serve a revision (ships a preview)
    surge <domain> rollback|rollfore      change live revision
    surge <domain> discard <rev>          remove a revision

  ADMIN
    surge whoami                          display current session
    surge login                           authenticate
    surge logout                          remove session & expire token
    surge verify                          verify email address
    surge mfa                             manage two-factor auth
    surge list                            list your domains, newest first
    surge card                            change billing credit card
    surge plan                            show/change account plan
    surge tokens                          show available tokens commands
    surge orgs                            show your orgs
    surge claim <code>                    join an org, or take a domain, with a code
    surge scrap <code>                    cancel an invite or transfer code

  PROJECT
    surge <domain> config                 show/change project configuration
    surge <domain> transfer [<org>]       move to an org, or get a code to give it away
    surge <domain> teardown               remove project (!destructive)
    surge <domain> stats                  show available analytics commands
    surge <domain> dns                    show available dns commands
    surge <domain> debug                  show available debug commands

  AUTH
    --token <token>                       authenticate without logging in
    SURGE_TOKEN=<token>                   same, from the environment

  surge <command> --help for one command
```

That's the design constraint the whole tool is built under: a surface small enough to hold in your head, arranged so the command you need is the command you'd guess.

## The grammar

Every project command names its target first, then the verb:

```sh
surge <project> <verb>
```

The project is a **domain** (`example.com`), a **path** (`./dist`), or—when omitted—the **current directory**. So these are the same command at three levels of explicitness:

```sh
surge example.com rollback     # the domain, spelled out
surge ./dist rollback          # a project directory that knows its domain
surge rollback                 # the current directory's project
```

Day to day you work from inside your project, so the short forms carry you: `surge publish`, `surge revs`, `surge rollback`. The explicit forms exist for scripts, CI, and operating on projects you're not standing in.

Two safety properties fall out of the grammar. A target with no verb never acts—`surge example.com`, or just `surge`, prints an overview instead of doing something to production. And commands typed in the older, verb-first order (`surge rollback example.com`) keep working forever, silently—both orders are first-class. Muscle memory is never punished.

## Design principles

**Publishing is global, and it's done when it says it's done.** A publish doesn't upload to "a server" and trickle outward—it propagates to every edge node of [Surge's CDN](https://surge.sh/docs/platform/cdn) while the command runs, and the output confirms each node individually. When you see `Success!`, your project is live in every region, not queued for it. That's also why [rollback](https://surge.sh/docs/cli/revisions) is instant: moving between revisions is a pointer switch, not a re-upload.

**The prompt is the UI.** Anything the CLI needs and doesn't have, it asks for—and every prompt can be pre-empted with an argument or flag, so every workflow scripts cleanly. `surge ./dist example.com` never asks a question. There is no dashboard you'll eventually be forced into; the terminal is the whole product.

**Your project is the configuration.** The domain lives in a [`CNAME` file](https://surge.sh/docs/cli/publishing#the-cname-file). Files to exclude go in [`.surgeignore`](https://surge.sh/docs/cli/publishing#ignoring-files). Server behavior—[auth](https://surge.sh/docs/platform/auth), [redirects](https://surge.sh/docs/platform/redirects), [CORS](https://surge.sh/docs/platform/cors)—is plain files that publish with your code. There's no manifest, no scaffolding, no project state living anywhere but your directory. Every [revision](https://surge.sh/docs/cli/revisions) therefore carries its complete configuration: roll back the code and the behavior rolls back with it.

**Publishing is cheap and reversible.** Every publish creates an immutable revision with its own preview URL, and Surge keeps the last 100 of them. Ship freely—the previous version is one `surge rollback` away, effective everywhere instantly. The cost of a mistake is a command, which changes how boldly you ship.

## The command surface

| Command | What it does |
|---------|--------------|
| `surge <path> <domain>` | [Publish a project to a domain](https://surge.sh/docs/cli/publishing) |
| `surge <path> publish` | [Publish using the project's `CNAME` file](https://surge.sh/docs/cli/publishing#the-cname-file) |
| `surge … --preview` | [Publish a preview without touching production](https://surge.sh/docs/cli/previews) |
| `surge <domain> revs` | [List a project's revisions](https://surge.sh/docs/cli/revisions) |
| `surge <domain> rollback` / `rollfore` / `cutover` / `discard` | [Move between revisions](https://surge.sh/docs/cli/revisions) |
| `surge <domain> dns` / `zone` | [Manage DNS records](https://surge.sh/docs/cli/domains) |
| `surge <domain> stats` | [Traffic, audience, usage, and load](https://surge.sh/docs/cli/analytics) |
| `surge <domain> status` | [Where the domain stands: waiting on dns, securing, ready, or live](https://surge.sh/docs/cli/analytics#status) |
| `surge <domain> debug` | [Status, files, audit, cache, certificates](https://surge.sh/docs/cli/analytics#debug) |
| `surge <domain> config` | [View and change project settings](https://surge.sh/docs/cli/config) |
| `surge <domain> transfer` / `surge claim` | [Move a domain into an org, or give it to someone](https://surge.sh/docs/cli/orgs#moving-a-domain) |
| `surge orgs` | [Share domains as a team](https://surge.sh/docs/cli/teams), [create orgs, manage members and tokens](https://surge.sh/docs/cli/orgs) |
| `surge <domain> teardown` | [Remove a published project](https://surge.sh/docs/cli/revisions#tearing-down-a-project) |
| `surge list` | Your domains and your orgs', newest first |
| `surge login` / `logout` / `whoami` / `verify` / `plan` / `card` / `tokens` / `nuke` | [Account, plans & tokens](https://surge.sh/docs/cli/account) |

The complete listing with every flag is in the [Command Reference](https://surge.sh/docs/cli/reference)—or run `surge --help`, which adapts to the project you run it in: inside a project directory the target slot fills in, and the screen shows exactly the commands you can run right there. For one command's usage, run `surge <command> --help` (for example `surge cutover --help`).

## Where to go

New to Surge? [Getting Started](https://surge.sh/docs/getting-started) has you live in about a minute. Publishing a Vite, Astro, or Eleventy build—or migrating from another host? The [Guides](https://surge.sh/docs/guides/) walk each task end to end. Shipping to production? [Publishing](https://surge.sh/docs/cli/publishing), [Previews](https://surge.sh/docs/cli/previews), and [Revisions](https://surge.sh/docs/cli/revisions) are the working loop. Automating? [CI & Automation](https://surge.sh/docs/cli/automation) covers tokens and pipelines. And everything about how the platform serves what you publish lives in the [Platform docs](https://surge.sh/docs/platform/).
