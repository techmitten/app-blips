# Orgs

An org is a named group of accounts. Its **members** are equal: any of them can invite, remove members, and rename the org. Its **admins** are members nobody else can remove or demote. `surge orgs` creates and manages them, and naming an org when you publish a new domain makes the domain the org's: every member can publish it, and it stays with the org when people come and go.

The namespace reads target-first, like the project commands: the org comes first, then the verb.

```sh
surge orgs                                  # every org you belong to, with its members and their roles
surge orgs <org>                            # one org: its name, your role, member count
surge orgs <org> create [--name <name>]     # create it; you become its admin
surge orgs <org> rename <slug> [--name <name>]
surge orgs <org> remove                     # remove the org
```

`<org>` is the org's slug (or its id). Every command that changes something names its org—there's no "current org" to get wrong.

## Creating an org

```sh
surge orgs acme create --name "Acme Inc."
```

The slug (`acme`) is the org's handle; `--name` is the display name and defaults to the slug. Creating an org needs a verified email address (see [`surge verify`](https://surge.sh/docs/cli/account#verify)).

`rename` changes the slug, the name, or both. After a slug change the old slug keeps resolving to the org for 30 days, so scripts and links don't break overnight.

## Members

```sh
surge orgs acme members                            # members and pending invites
surge orgs acme members jane@example.com           # one of them
surge orgs acme members jane@example.com revoke    # remove a member
surge orgs acme members jane@example.com mkadmin   # make an admin
surge orgs acme members jane@example.com rmadmin   # back to member
surge orgs acme leave                              # leave the org yourself
```

Any member can invite and remove members. Making an admin (`mkadmin`, or `invite --admin`), demoting or removing an admin, and removing the org are for admins. Anyone can leave with `surge orgs acme leave`.

An org always keeps at least one admin, so the last admin makes someone else an admin before leaving. The last member leaving removes the org, the same as `surge orgs acme remove`—and like `remove`, that waits until the org's domains are transferred or torn down.

### Inviting someone

```sh
surge orgs acme invite            # prints an invite code and its claim link
surge claim tiger73azqrk          # run by whoever you give it to
```

`invite` prints a code like `tiger73azqrk` and a link, `https://auth.surge.sh/claim/tiger73azqrk`, and emails nothing: send one of them to the person yourself. Whoever runs `surge claim` with the code, or opens the link and accepts, joins acme from whichever account they're signed in as. The link works without a terminal: it shows what the code does, signs the person in (Google or GitHub makes them an account if they don't have one), and asks before it accepts. `invite --admin` makes a code that joins as an admin.

A code works once and expires after 7 days. Several can wait at once, up to 10 per org; `surge orgs acme members` lists them by their first word, since the codes themselves aren't kept. To cancel one before it's used:

```sh
surge scrap tiger73azqrk
```

`scrap` cancels a transfer code the same way.

## Publishing to an org

Put the org in front of a new domain:

```sh
surge ./dist acme:docs.acme.com
```

The domain becomes acme's on its first publish, and the result says so: `Published to docs.acme.com (owned by acme)`. From then on any member publishes it with or without the prefix.

A domain that already belongs to someone—you included—is never moved by a publish; the prefix only claims domains nobody holds yet. To bring a domain you already own into the org, [transfer it](#moving-a-domain).

An org's domains share the org's publishing limits. Once a day, members get one email listing the new domains the others added and the ones they tore down.

## Tokens

An org token publishes as the org, so CI keeps working whoever comes and goes:

```sh
surge orgs acme tokens                                   # the org's tokens: id, scope, msg, who added it, uses, last used
surge orgs acme tokens add -m "ci"                       # shown once: give it to CI as SURGE_TOKEN
surge orgs acme tokens add --domain '*.previews.acme.com' -m "previews"
surge orgs acme tokens rem tok-1a2b3c4d                  # stops it at once
```

The token belongs to the org, not to whoever added it. It publishes the org's domains, and a new domain it publishes becomes the org's. Someone leaving the org, resetting their password or deleting their account doesn't touch it; only `rem` or removing the org ends it. When a member is removed, the org tokens they added are listed so you can `rem` any you want rotated.

An org token publishes and nothing more: publishing, rollback, cutover, teardown, `list` and `status` on the org's domains. Members, tokens, transfers, settings and DNS need a member signed in as themselves. `--domain` narrows a token to some of the org's domains, or to every name under a pattern like `*.previews.acme.com`. Any member can add and remove the org's tokens, and they're in the daily email too.

Already have a token on a shared login that CI uses? Move the login's domains into the org first, then the token: `surge tokens transfer tok-1a2b3c4d acme`. Its value doesn't change, so nothing in CI needs updating, and from then on it publishes as the org.

## Moving a domain

```sh
surge docs.acme.com transfer acme                # into an org you're in
surge docs.acme.com transfer jane@example.com    # out of the org, to your own account
```

The owner of a domain can move it into any org they belong to. Any member can move an org's domain out to their own account, or into another org they're in. The org's other members get an email as soon as a domain joins or leaves.

Serving is unchanged: the same content, revisions, certificate and DNS. What changes is who can publish and tear the domain down, and whose limits its publishes count against. `surge docs.acme.com status` shows who owns a domain.

### Giving a domain to someone else

```sh
surge docs.acme.com transfer      # prints a transfer code and its claim link
surge claim tiger73azqrk          # run by whoever you give it to
```

`transfer` with nothing after it prints a code like `tiger73azqrk`—a word, two digits and five letters, short enough to read out on a call—and a link to claim it in a browser, `https://auth.surge.sh/claim/tiger73azqrk`. Send either to the person who should have the domain: when they run `surge claim tiger73azqrk` (capitals and spaces don't matter), or open the link and accept, the domain becomes theirs and you no longer reach it. A code works once, expires after 7 days, and stops working if the domain moves some other way first. Making a new code cancels the last one.

In a terminal, `surge claim` shows what a code does before it does it—the domain and who it's from, or the org and the role—and asks. Answer no and the code still works. `--yes` claims without asking, and scripts and agents never get asked. This is how an agent hands a domain it published to the person it works for. To put a claimed domain in an org, transfer it once it's yours.

## Limits

Free orgs hold up to five people, admins and members together—pending invites don't count until they're accepted, and tokens never do. Each account can be the admin of up to three free orgs. An org can have up to 10 tokens.

## Removing an org

```sh
surge orgs acme remove
```

The slug is free for anyone to use as soon as the org is gone. Removal is refused while the org holds any domains, and the refusal lists them: transfer them out or tear them down first.
