# CI & Automation

Everything the CLI does interactively it also does non-interactively: pass the project and domain as arguments, supply a token instead of logging in, and `surge` runs prompt-free in any pipeline.

## Mint a token

On your own machine, where you're logged in:

```sh
surge tokens add --domain example.com -m "ci"
```

Copy the token it prints into your CI provider's secret store as `SURGE_TOKEN`. The CLI picks that environment variable up automatically—no login step in the pipeline:

```sh
SURGE_TOKEN=… surge ./dist example.com
```

A `--token <token>` flag is also accepted where an environment variable is awkward. Tokens never face a two-factor challenge: turning [two-factor auth](https://surge.sh/docs/cli/account#mfa) on for your account guards the ceremonies that create credentials, and leaves every pipeline holding a token running untouched.

Scoping the token with `--domain` means a leaked CI secret can publish to that one domain and nothing else; the `-m` message is how you'll recognize it later. Rotate or kill a pipeline's access any time with `surge tokens rem <id>`—see [tokens](https://surge.sh/docs/cli/account#tokens).

For a team, add the token to the [org](https://surge.sh/docs/cli/orgs#tokens) instead: `surge orgs acme tokens add -m "ci"`. It publishes as the org, so the pipeline doesn't stop when the person who set it up leaves or resets their password.

## The non-interactive rule

`surge` only prompts for information it doesn't have. Give it everything up front and it never asks:

```sh
surge ./dist example.com          # path + domain as arguments…
surge ./dist publish              # …or the CNAME file a previous publish wrote
```

If a required value is missing *and* there's no terminal to ask on, the command aborts rather than hangs—so a misconfigured pipeline fails fast. With no token and no stored login, that's:

```txt
Aborted - not logged in and no terminal to ask. Run `surge login` in a terminal, or set SURGE_TOKEN.
```

printed to stderr, with exit code `1`. An unset or misspelled `SURGE_TOKEN` fails the job instead of passing it. To check what a pipeline is running as before it acts, run `surge whoami`: with a token it prints the token's id and scope, and it exits `1` when the credentials don't work.

## Behind a proxy

The CLI honors the standard proxy variables—`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` (or their lowercase spellings)—and `NO_PROXY` for hosts that should bypass it. Nothing else to configure.

## npm scripts

Make publishing part of the project by installing surge as a dev dependency:

```sh
npm install --save-dev surge
```

```json
{
  "scripts": {
    "build": "vite build",
    "deploy": "npm run build && surge ./dist example.com"
  }
}
```

Now `npm run deploy` works for everyone on the team (each using their own account, through an [org](https://surge.sh/docs/cli/teams)), and in CI with `SURGE_TOKEN` set.

## GitHub Actions and other CI

[Publish from GitHub Actions](https://surge.sh/docs/guides/github-actions) has the complete workflow—a preview for every pull request, production on every merge. The same shape works in GitLab CI, CircleCI, or any runner with Node available: build, then `surge <path> <domain>` with `SURGE_TOKEN` in the environment.

Scheduled jobs and loops should keep each domain under 200 publishes a day: publish every 10 minutes or less often, or only when the build output changed. See [publishing limits](https://surge.sh/docs/cli/publishing#publishing-limits).

## Previews per branch

The [preview flow](https://surge.sh/docs/cli/previews) maps naturally onto pull requests—publish every branch build as a preview, and cut over on merge:

```sh
# on pull request builds
surge ./dist example.com --preview -m "$COMMIT_MESSAGE"

# on merge to main
surge ./dist example.com
```

Each PR build gets a stable revision URL to link in the review, and production only moves when main does.

## Git hooks

For a lighter-weight setup—no CI service at all—publish from a local git hook. Git has no hook that runs after a push, so use `pre-push`, which runs on every `git push` (a failed publish stops the push):

```sh
printf '#!/bin/sh\nsurge ./dist example.com\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

Or use `husky`/`simple-git-hooks` to version the hook with the project.
