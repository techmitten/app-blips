# Account, Plans & Tokens

Your Surge account is created and managed entirely from the CLI. The account commands take no target—they're about who's typing, not any particular project—so they all sit at the top level.

## login

```sh
surge login
```

Prompts for email and password. If the email has no account yet, **one is created**—login and signup are the same step. On success, a token is stored in your `~/.netrc` file (readable only by you), and every subsequent command uses it silently.

Mistype your password three times and the CLI offers to email you reset instructions.

### Sign in with the browser

```sh
surge login --browser
```

Instead of a password prompt, the CLI prints a link and a four-letter code, opens your browser, and waits. Sign in on the page—with Google, GitHub, or your email and password—check that the code on the screen matches your terminal, and approve. The CLI picks up the token and stores it exactly as a password login would. If a [passkey](#mfa) is on the account, *Use a passkey instead* signs you in with the key alone.

Nothing about the stored session differs between the two: same `~/.netrc` entry, same token, same `surge logout`. It works over SSH too—the link opens on any browser, anywhere. Accounts with [two-factor auth](#mfa) on sign in this way.

## logout

```sh
surge logout
```

Removes the session's token from `~/.netrc` and expires it, so it can never be used again—by you or anything that saw it. Log in again to mint a fresh one.

## whoami

```
$ surge whoami

   you@example.com - Free
   tok-1a2b3c4d · full account
```

Shows the logged-in account and its plan. When the CLI is authenticating with a token (`SURGE_TOKEN` or `--token`), it also prints the token's id and scope—`tok-1a2b3c4d`, scoped to the domains it can publish, or full account—so a pipeline or agent can confirm it holds the least-privilege token it expects without printing the secret. When the credentials don't work, `whoami` says so and exits `1`.

## verify

```sh
surge verify
```

Sends a verification link to your account's email address. Verifying matters:

- **Serving.** A newly signed-up account's `surge.sh` domains serve for their first 90 minutes. After that they report **ready**—published, and serving once you verify your email—until the address is verified. Verify and they serve again; nothing to republish.
- **Rate limits.** Unverified accounts publish under half the usual [limits](https://surge.sh/docs/cli/publishing#publishing-limits).

Already verified? The command says so and sends nothing.

## mfa

```sh
surge mfa
```

Two-factor auth for your account. The command opens a page in your browser and gets out of the way—setup and management both happen there, so no secret, code, or recovery code ever passes through a terminal.

Turning it on: sign in fresh on the page and add a factor.

- **A passkey**—a hardware key, Touch ID, Windows Hello, or a passkey your browser or password manager keeps. Every key needs its PIN or biometric; a ceremony that skips that step is refused. Add as many keys as you like, each with a name, and remove them one at a time.
- **An authenticator app**—add the key the page shows to your app and confirm with a code.

The first factor you add mints ten recovery codes—each signs you in once if you lose every factor, and they're shown exactly once. Save them.

With two-factor on:

- Your password alone signs nothing in. `surge login` points you at `surge login --browser`. On the sign-in page, *Use a passkey instead* signs you in with the key alone—no password involved—or sign in with your password and answer with a code from your app. Google and GitHub sign-in carry their own second factor and work as before.
- **Tokens are untouched.** CI, scripts, and agents holding a token keep working—two-factor guards the ceremonies that create credentials, never the credentials themselves.
- Adding or removing keys, and turning two-factor off, happen on the same page (`surge mfa` again) and require a current code or a recovery code. Removing your last factor turns two-factor off.

## tokens

A token lets anything that isn't you—a CI pipeline, a script, an agent—publish as your account. Mint one per use, label it, and scope it to just the domain it needs:

```sh
surge tokens list                              # every token: id, scope, msg, uses, last used
surge tokens add [--domain <domain>] [-m <msg>]  # mint a token
surge tokens rem <id>                          # expire a token
surge tokens transfer <id> <org>               # hand a token to an org, value unchanged
```

```
$ surge tokens add --domain lucid-example.surge.sh -m "github actions"

   f3a1c98c42d76c1ba9d3a9f4e3c0ffee

   Scoped to lucid-example.surge.sh — github actions
```

The token itself is shown once, at mint time—copy it then. Everywhere else it's represented by its id (`tok-1a2b3c4d`), which is what `tokens list` shows and `tokens rem` takes. The `-m` message is how you remember what a token is for, and the `uses` and `last used` columns tell you whether it's still earning its keep.

A token minted with `--domain` is scoped: it can publish to that domain and run its project commands (revisions, config, stats, teardown), and nothing else—no DNS records, collaborators, certificate changes, or billing, and no other domain. Repeat the flag to scope one token to several domains (`--domain a.example.com --domain b.example.com`), or scope it to a pattern (`--domain '*.previews.example.com'`) to cover every name under it—handy for a preview per branch. Without `--domain`, the token has full account access.

A token for a team's pipeline belongs on the [org](https://surge.sh/docs/cli/orgs#tokens), where it keeps working whoever leaves. `tokens transfer` moves one of yours there without changing its value.

See [CI & Automation](https://surge.sh/docs/cli/automation) for putting tokens to work.

## plan

```sh
surge plan
```

Shows the available plans—**Free** and **Pro**—with pricing and perks, and lets you switch with an interactive picker—upgrade or downgrade at any time. Card entry happens inline the first time Pro needs one. What each plan includes is on [Plans](https://surge.sh/docs/platform/plans).

Prefer the browser for anything billing-related:

```sh
surge plan --web       # upgrade via browser checkout
surge plan --manage    # manage plan, card & invoices in the browser
```

Both print a private link (valid 48 hours) that opens a secure billing page.

## card

```sh
surge card
```

Updates the payment card on file.

## nuke

```sh
surge nuke
```

**Permanently deletes your account.** There is no undo.

Before you run it:

- **Remove every project.** `surge list` shows what you have. [Tear each one down](https://surge.sh/docs/cli/revisions#tearing-down-a-project) or [give it to someone else](https://surge.sh/docs/cli/orgs#giving-a-domain-to-someone-else); the command refuses while any remain.
- **Hand off any org you run.** An org always keeps an admin, so if you are an org's only admin, [make someone else an admin](https://surge.sh/docs/cli/orgs#members) or [remove the org](https://surge.sh/docs/cli/orgs#removing-an-org) first. Any other org you belong to, you leave automatically.

Deleting removes:

- **Your account**—its email address and password.
- **Your plan.** A paid plan is cancelled and the saved card is removed, so nothing is charged again.
- **Your tokens.** Every token on the account stops working at once. Tokens you added to an org belong to the org and keep working until an org admin removes them.
- **Your sign-in** on the machine you ran it from.

The email address is free afterward; signing up with it again starts a new, empty account.

Can't sign in? Mistype your password three times and the CLI offers to email you reset instructions. If you no longer have the account's email address, write to support@surge.sh.
