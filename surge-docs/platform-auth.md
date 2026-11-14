# Password Protection & Protected Paths

Protection lives in an `AUTH` file (no extension) at the root of the directory you publish. Every line is a rule: a path pattern, then who's allowed. Rules ship with your files when you publish—no dashboard, no separate setup, and no login code in your project; the edge handles everything before your files are served.

```txt
/admin/*   jane@example.com
```

`AUTH` is a Pro feature—publishing a project that contains one prompts you to upgrade right in the CLI if you haven't already. See [Plans](https://surge.sh/docs/platform/plans). (To lock a whole domain to the people who can publish it on any plan, use [`--private`](https://surge.sh/docs/cli/config#private-domains) instead.)

## Who's allowed

A rule lists one or more principals after the path. There are two kinds:

| Principal | Who it matches | How they get in |
|-----------|----------------|-----------------|
| `jane@example.com` | Exactly that address | The sign-in page |
| `*@example.com` | Anyone at that domain | The sign-in page |
| `collaborators` | Everyone who can publish the domain: the members of the [org](https://surge.sh/docs/cli/teams) that owns it, and anyone [invited before orgs](https://surge.sh/docs/cli/teams#collaborators-from-before-orgs) | The sign-in page |
| `user:password` | Whoever knows the password | Browser password prompt, or `curl -u` |

Identity principals send visitors to Surge's sign-in page. A rule names email addresses; the page offers three ways to prove one—sign in with **Google**, with **GitHub**, or with a **Surge account**'s email and password. The rule doesn't care which: whichever a visitor uses, a verified email that matches lets them in, for 12 hours across the whole domain. The people you name don't need a Surge account—any Google or GitHub account works as-is (GitHub counts every verified address on the account; Surge accounts sign in once their email address is verified, and are asked for their code as part of the same sign-in if they keep [two-factor auth](https://surge.sh/docs/cli/account#mfa) on).

Credential principals are classic HTTP basic auth.

## Rules

Write as many rules as you need, one per line. The first rule that matches the request path decides; blank lines and `#` comments are ignored.

```txt
# who can see what
/admin/*     collaborators
/drafts/*    *@example.com
/internal/*  jane@example.com sam@partner.co
```

A `/*` pattern covers the entire domain (a bare `*` means the same thing):

```txt
/*   collaborators
```

`collaborators` follows the org on its own: once someone [joins](https://surge.sh/docs/cli/teams), they can sign in without you republishing.

## Passwords

A credential principal puts a password on a path instead of (or as well as) an identity:

```txt
/*         viewer:letmein
/staging/* team:sekrit
```

The first line is whole-domain password protection—the classic use. The second protects just a section. Visitors get the browser's password prompt; scripts pass credentials the usual way:

```sh
curl -u viewer:letmein https://example.surge.sh/
```

The two kinds mix on one line, which is exactly what a protected path with automation wants—people sign in with Google, CI fetches with credentials:

```txt
/reports/*   collaborators ci-bot:s3cret
```

## Notes

- The `AUTH` file itself is never served—it's consumed by the platform, not published.
- Because `AUTH` ships with your files, protection is versioned: [rolling back](https://surge.sh/docs/cli/revisions) a revision rolls back its rules too, and removing the file on the next publish removes the protection.
- Sign-in lasts 12 hours per domain. Visiting `/__surge/logout` on your domain signs out, and the page a signed-in-but-not-allowed visitor sees offers the same switch—useful for changing accounts.
- Removing someone takes effect on their next sign-in: update the rule and publish, or remove them from the org; existing sessions expire within 12 hours.
- Serve protected projects over HTTPS (automatic on `surge.sh` subdomains, automatic certificates on [custom domains](https://surge.sh/docs/platform/ssl)) so nothing is exchanged in the clear.
- A malformed rule stops the publish with a line-by-line explanation that names the fix—`jane@example.com` on its own suggests `/* jane@example.com`. Your project is never published with a policy you didn't write.
- Legacy `AUTH` files—bare `user:password` lines with no path—keep working exactly as before, as shorthand for `/* user:password`.
