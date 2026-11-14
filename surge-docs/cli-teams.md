# Teams

A team shares Surge through an [org](https://surge.sh/docs/cli/orgs). Everyone signs in as themselves and the org owns the domains, so nobody shares a password and nothing depends on one person's login. People come and go; the domains, their revisions and their settings stay with the org.

## Setting up

```sh
surge orgs acme create --name "Acme Inc."   # you're its admin
surge orgs acme invite                      # prints a code - one per teammate
```

Send each teammate their code, or the claim link printed under it. They join from their own account, whichever one they sign in with:

```sh
surge claim tiger73azqrk
```

The link (`https://auth.surge.sh/claim/tiger73azqrk`) does the same in a browser, for a teammate without a terminal: they sign in, or continue with Google or GitHub to make an account, and accept. A code works once and expires after 7 days. `surge orgs` lists every org you're in with its members and their roles.

## Publishing as the team

Put the org in front of a new domain the first time it's published:

```sh
surge ./dist acme:docs.acme.com
```

The domain is acme's from then on, and any member publishes it the usual way—no prefix needed:

```sh
surge ./dist docs.acme.com
```

## Bringing in domains you already have

```sh
surge docs.acme.com transfer acme
```

Serving doesn't change: same content, revisions, certificate and DNS. What changes is who can publish and tear the domain down. See [Moving a domain](https://surge.sh/docs/cli/orgs#moving-a-domain).

## Private domains

A [private domain](https://surge.sh/docs/cli/config#private-domains) the org owns admits every member, and `collaborators` in an [`AUTH` file](https://surge.sh/docs/platform/auth) means the same people. Someone joining or leaving takes effect straight away, with no republish.

## CI

Give CI a token that belongs to the org, as `SURGE_TOKEN`:

```sh
surge orgs acme tokens add -m "ci"
```

It publishes as acme: the org's domains, and new domains become acme's. It keeps working when the person who added it leaves or resets their password. See [Org tokens](https://surge.sh/docs/cli/orgs#tokens) and [Automation](https://surge.sh/docs/cli/automation).

## When someone leaves

```sh
surge orgs acme members jane@example.com revoke   # remove a member
surge orgs acme leave                             # or leave yourself
```

It takes effect on their next command. The org's domains stay with the org, and so do its tokens: the ones they added keep CI running and are listed when they're removed.

## Plans

Free orgs hold up to three people. An org's domains get Pro's features, such as [`AUTH`](https://surge.sh/docs/platform/auth), while anyone who can publish them is on [Pro](https://surge.sh/docs/platform/plans).

## Collaborators from before orgs

Before orgs, a domain was shared by inviting people to it one at a time. Those invites are closed. Anyone invited before keeps publishing, and `surge <domain> revoke <email>` removes them.

A team that shared one login gets the same setup: create the org, move the login's domains in, then hand its CI tokens to the org with `surge tokens transfer <id> acme`. Their values don't change, so no pipeline needs touching.

To move a shared domain onto an org:

```sh
surge orgs acme create
surge orgs acme invite                  # a code for each collaborator
surge docs.acme.com transfer acme
surge docs.acme.com revoke jane@example.com   # once jane is a member
```
