# Publish from GitHub Actions

The goal: every pull request gets a preview URL, and merging to `main` publishes production. One workflow file, one secret, and the [preview machinery](https://surge.sh/docs/cli/previews) does the rest—production never moves until main does.

## 1. Mint a scoped token

On your own machine, where you're logged in:

```sh
surge tokens add --domain example.com -m "github actions"
```

The token prints once—copy it into your repository's secrets as `SURGE_TOKEN` (*Settings → Secrets and variables → Actions*). Because it's scoped with `--domain`, a leaked secret can publish to this one domain and do nothing else; the `-m` message is how you'll recognize it in [`surge tokens list`](https://surge.sh/docs/cli/account#tokens), and `surge tokens rem` is the kill switch that rotates it.

If the domain belongs to an [org](https://surge.sh/docs/cli/teams), add the token to the org instead, so the workflow keeps running when whoever set it up leaves: `surge orgs acme tokens add --domain example.com -m "github actions"`.

## 2. The workflow

```yaml
name: Publish
on:
  push:
    branches: [main]
  pull_request:

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build

      # pull requests from this repo: upload a preview - production untouched
      - if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
        run: npx surge ./dist example.com --preview
        env:
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}

      # merges to main: publish production
      - if: github.event_name == 'push'
        run: npx surge ./dist example.com
        env:
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
```

The preview step's log ends with the revision's own URL—`Preview available at …`, a host like `1785787164375--example--com.surge.sh` for a custom domain, and `latest--example--com.surge.sh` always shows the newest—a complete copy of the built app on the same CDN production uses, safe to link in the PR discussion and point tests at. The production step is a full publish: propagated to [every edge node](https://surge.sh/docs/platform/cdn) before the job goes green, so a green check means *live*, not *queued*.

## Notes worth knowing

- **`SURGE_TOKEN` is picked up from the environment automatically**—no login step, no config file. The CLI [never prompts when it has what it needs](https://surge.sh/docs/cli/automation#the-non-interactive-rule), and aborts rather than hangs if something's missing, so a misconfigured pipeline fails fast and loud.
- **Fork pull requests don't receive secrets** on GitHub, which is why the preview step only runs for same-repo branches: without it, a fork's build would reach `surge` with an empty `SURGE_TOKEN` and fail the job. That's GitHub's security model, and for a token that can publish to your domain, it's the behavior you want.
- **Rollback is your incident response.** A bad merge that went live is one `surge example.com rollback` from gone—instant and global, from any machine you're logged into. No revert-commit-and-wait-for-CI required (though the revert can follow at leisure).

The same shape works in GitLab CI, CircleCI, or any runner with Node: build, then `surge <dir> <domain>` with `SURGE_TOKEN` set. More patterns in [CI & Automation](https://surge.sh/docs/cli/automation).
