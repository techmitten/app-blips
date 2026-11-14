# Command Reference

The complete `surge` command surface. Run `surge --help` for the built-in overview, and `surge <command> --help` for one command's usage.

Project commands are written here as `surge <domain> <verb>`, but the target slot takes three forms: a **domain**, a **path** to a project directory, or nothing at all—in which case the current directory's project is the target. `surge example.com rollback`, `surge ./dist rollback`, and `surge rollback` are the same command. Account commands take no target. Commands typed in the older, verb-first order (`surge rollback example.com`) keep working forever, silently—both orders are first-class.

A few commands don't appear on the `--help` overview—`zone`, `token`—power tools it doesn't spend lines on; this page documents everything. `surge account <verb>` also dispatches to the flat identity commands (`surge account whoami` = `surge whoami`).

## Global flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--project <path>` | `-p` | The directory to publish. Also settable as the first positional argument. |
| `--domain <domain>` | `-d` | The domain to act on. Also settable as a positional argument or via the `CNAME` file. |
| `--preview` | `--stage`, `-s` | Publish a [preview](https://surge.sh/docs/cli/previews) instead of cutting over production. |
| `--message <msg>` | `-m` | Attach a [message](https://surge.sh/docs/cli/publishing#messages) to the revision (or to a token at `tokens add`). |
| `--force <protocol>` | | `https` (or `http`) redirects all traffic to that protocol. Sticks as [configuration](https://surge.sh/docs/cli/config). |
| `--private` / `--public` | | Lock the domain to the people who can publish it, or open it again. See [private domains](https://surge.sh/docs/cli/config#private-domains). |
| `--token <token>` | | Authenticate with a token instead of the stored login. The `SURGE_TOKEN` environment variable does the same. |
| `--endpoint <url>` | `-e` | Target a different Surge API endpoint. |
| `--version` | `-V` | Print the CLI version. |
| `--help` | `-h` | Print the command listing, adapted to the target—or one command's usage after a verb. |

Publish-intent flags carry their own routing: `surge ./dist -d example.com` and bare `surge --preview` are publishes, no verb needed.

## Environment

| Variable | Description |
|----------|-------------|
| `SURGE_TOKEN` | A [token](https://surge.sh/docs/cli/account#tokens) to authenticate with—no login, no prompt. `--token` wins when both are set. |
| `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` | Send API traffic through a proxy (lowercase spellings work too). |
| `NO_PROXY` | Hosts that bypass the proxy. |

With no stored login, no token, and no terminal to prompt on, a command that needs an account aborts on stderr—`` Aborted - not logged in and no terminal to ask. Run `surge login` in a terminal, or set SURGE_TOKEN. ``—and exits `1`. See [CI & Automation](https://surge.sh/docs/cli/automation#the-non-interactive-rule).

## Publishing

### `surge <path> <domain>`

Publish a directory to a domain—or a single HTML file, published as the domain's [`index.html`](https://surge.sh/docs/cli/publishing#a-single-html-file). Pass `_` as the domain for a freshly generated `.surge.sh` subdomain, no prompt. Pass `--force https` to redirect all HTTP traffic to HTTPS; the setting sticks across publishes. Respects [`.surgeignore`](https://surge.sh/docs/cli/publishing#ignoring-files). → [Publishing](https://surge.sh/docs/cli/publishing)

### `surge [path] publish`

Publish using the project's own domain—from its [`CNAME` file](https://surge.sh/docs/cli/publishing#the-cname-file) when present, prompting with a generated suggestion otherwise (enter `_` at the prompt for a fresh one). This is the everyday form once a project knows where it lives. `deploy` is accepted as a silent alias.

### `surge <domain> teardown`

Remove the project from the domain and the CDN. → [Revisions](https://surge.sh/docs/cli/revisions#tearing-down-a-project)

## Revisions

Surge keeps the last 100 revisions of each domain.

### `surge list [--all] [<org>:]`

Your domains and your orgs' domains, newest publish first: owner (an email or an org), age, last publisher, and on a wide terminal file count and size. Shows the newest 50; `--all` shows every one. `surge list acme:` shows only the domains the org `acme` owns.

### `surge <domain> revs`

The project's revisions—preview URL, age, author, size, and message—with the live revision highlighted. `surge <domain> list` is the same command. → [Revisions](https://surge.sh/docs/cli/revisions)

### `surge <domain> rollback`

Serve the previous revision.

### `surge <domain> rollfore`

Serve the next revision (the inverse of `rollback`).

### `surge <domain> cutover [revision]`

Serve the given revision, or the latest one when omitted. Ships [previews](https://surge.sh/docs/cli/previews).

### `surge <domain> discard [revision]`

Remove a revision from the system. If it was live, production moves to a neighboring revision; discarding the last revision takes the project offline.

## Domains & DNS

### `surge <domain> dns list`

List the domain's custom DNS records. Bare `dns` prints the available subcommands and Surge's name servers. → [Domains & DNS](https://surge.sh/docs/cli/domains)

### `surge <domain> dns add <type> <name> <value>`

Add a DNS record. MX records take a priority: `dns add MX <priority> <value>` (host defaults to `@`) or `dns add MX <name> <priority> <value>`.

### `surge <domain> dns rem <id>`

Remove a DNS record by the id shown in the listing.

### `surge <domain> zone`

Print the domain's complete zone in BIND format, including records Surge manages automatically. Supports the same `add`/`rem` subcommands as `dns`.

## Debug

### `surge <domain> debug status`

The domain's state: **waiting on dns** (with the records to add), **securing**, **ready** (published, serving once the account's email is verified), or **live**. `surge <domain> status` is the same command. → [Analytics & Diagnostics](https://surge.sh/docs/cli/analytics#status)

### `surge <domain> debug files`

List every file in the live revision with its size, as served by the CDN.

### `surge <domain> debug audit`

Report each edge node's state for the domain: revision, file count, size, certificate validity.

### `surge <domain> debug bust`

Purge the project from the cache on all edge nodes.

### `surge <domain> debug certs`

Show the certificates installed for the domain: subject, issuer, alt names, expiry, auto-renewal. → [SSL Certificates](https://surge.sh/docs/cli/ssl)

### `surge <domain> debug encrypt`

Provision the domain's managed SSL certificate manually. Certificates normally provision and renew automatically.

## Stats

### `surge <domain> stats traffic`

Visits, uniques, connections, encryption share, cache hit rates, top pages, 404s, redirects, and sources for the past two weeks. → [Analytics & Diagnostics](https://surge.sh/docs/cli/analytics)

### `surge <domain> stats audience`

Browsers, operating systems, and devices of your visitors.

### `surge <domain> stats usage`

Per-file bandwidth served, with a projected monthly total.

### `surge <domain> stats load`

Connection volume per datacenter across the network.

## Configuration

### `surge <domain> config`

View the project's platform settings; pass flags to change them: `--force http|https`, `--redirect <domain>`, `--cors <domain>|*`, `--hsts <seconds>`, `--private` / `--public`, any value `null` to clear. Changes apply across the edge immediately. → [Project Configuration](https://surge.sh/docs/cli/config)

## Collaborators

Orgs are how people share domains. Collaborator invites are closed. → [Teams](https://surge.sh/docs/cli/teams#collaborators-from-before-orgs)

### `surge <domain> revoke <emails…>`

Remove a collaborator invited before orgs, immediately.

## Orgs

### `surge orgs`

Every org you belong to, each with its members, their roles and pending invites. `surge orgs <org>` shows one. → [Orgs](https://surge.sh/docs/cli/orgs)

### `surge orgs <org> create [--name <name>]`

Create an org with the slug `<org>`; you become its admin. Needs a verified email.

### `surge orgs <org> rename <slug> [--name <name>]`

Change the slug, the display name, or both. The old slug keeps resolving for 30 days.

### `surge orgs <org> remove`

Remove the org. Refused while it holds any domains: transfer or tear them down first.

### `surge orgs <org> invite [--admin]`

Print a one-time invite code to send to someone yourself; nothing is emailed. `--admin` invites an admin. → [Inviting someone](https://surge.sh/docs/cli/orgs#inviting-someone)

### `surge orgs <org> leave`

Leave the org. The last admin can't leave until someone else is an admin; the last member leaving removes the org, as `remove` does. → [Members](https://surge.sh/docs/cli/orgs#members)

### `surge orgs <org> members [<email> [revoke|mkadmin|rmadmin]]`

List members and pending invites, show one, remove a member, or change a role. Members are equal, except that only admins make, demote or remove an admin. → [Orgs](https://surge.sh/docs/cli/orgs)

### `surge orgs <org> tokens [add [--domain <domain>] [-m <msg>] | rem <id>]`

List, add or remove the org's tokens. An org token publishes as the org and keeps working whoever leaves; any member manages them. → [Org tokens](https://surge.sh/docs/cli/orgs#tokens)

### `surge <path> <org>:<domain>`

Publish a new domain owned by the org; any member can. → [Publishing to an org](https://surge.sh/docs/cli/orgs#publishing-to-an-org)

### `surge <domain> transfer [<org> | <your email>]`

Move the domain into an org you're in, or out to your own account. With nothing after it, print a transfer code for giving the domain to someone else. Serving is unchanged. → [Moving a domain](https://surge.sh/docs/cli/orgs#moving-a-domain)

### `surge claim <code> [--yes]`

Join the org an invite code is for, or take the domain a transfer code names into your account. In a terminal it shows what the code does and asks first; `--yes` doesn't ask. In a browser, `https://auth.surge.sh/claim/<code>` does the same.

### `surge scrap <code>`

Cancel an invite or transfer code. It stops working at once.

## Account

### `surge login`

Authenticate (or create an account) and store a token in `~/.netrc`. → [Account, Plans & Tokens](https://surge.sh/docs/cli/account)

### `surge logout`

Remove the stored token and expire it.

### `surge whoami`

Show the logged-in email and plan—or, when authenticating with a token, the token's id and scope. Exits `1` when not authenticated.

### `surge verify`

Send an email verification link to your address.

### `surge login --browser`

Sign in via the browser—any provider, approve with a code match. → [Account, Plans & Tokens](https://surge.sh/docs/cli/account#sign-in-with-the-browser)

### `surge mfa`

Open the browser page that sets up or manages two-factor auth—passkeys and authenticator apps. → [Account, Plans & Tokens](https://surge.sh/docs/cli/account#mfa)

### `surge tokens list`

Every token on the account: id, scope, message, uses, created, last used. → [Tokens](https://surge.sh/docs/cli/account#tokens)

### `surge tokens add [--domain <domain>] [-m <msg>]`

Mint a token—shown once, at mint time. `--domain` scopes it to one domain or a pattern like `*.previews.example.com` (repeat the flag for several); `-m` labels it.

### `surge tokens rem <id>`

Expire a token by its `tok-` id.

### `surge tokens transfer <id> <org>`

Hand one of your tokens to an org you're in. Its value doesn't change; from then on it publishes as the org. → [Org tokens](https://surge.sh/docs/cli/orgs#tokens)

### `surge token`

Print the token the CLI is currently authenticating with.

### `surge plan [--web | --manage]`

Change your account plan interactively, or print a private browser link for checkout (`--web`) or full billing management (`--manage`).

### `surge card`

Update the payment card on file.

### `surge nuke`

Permanently delete your account. Refuses while any project remains or while you are an org's only admin. See [Account](https://surge.sh/docs/cli/account#nuke) for what it removes.
