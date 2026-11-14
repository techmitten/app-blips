# Revisions

Every publish creates a revision—a complete, immutable snapshot of your project with its own [preview URL](https://surge.sh/docs/cli/previews#the-preview-url). Surge keeps the last 100 revisions of each domain; older ones drop off as new ones arrive. Production is just a pointer at one of them, and the revision commands move that pointer. Shipped something broken? You're one command from the previous version.

## Listing revisions

`surge list` shows your domains and your orgs', newest first. `revs` shows one project's revisions, newest last:

```
$ surge vivid-example.surge.sh revs

  1785786900000--vivid-example.surge.sh  Just now  you@example.com  4 files  695.0B  new hero section
  1785787164375--vivid-example.surge.sh  Just now  you@example.com  4 files  695.0B  fix nav on mobile
```

The revision currently serving production is highlighted. Each row shows the revision's preview URL, its age, who published it, its size, and the [message](https://surge.sh/docs/cli/publishing#messages)—write good messages and this becomes a log of everything you've shipped. (Inside a project directory, plain `surge revs` does the same.)

## Moving between revisions

```sh
surge example.com rollback    # serve the previous revision
surge example.com rollfore    # serve the next revision
surge example.com cutover     # serve the latest revision
```

```
$ surge vivid-example.surge.sh rollback

   ⟲ Rollback

  1785786900000--vivid-example.surge.sh    /└───   1785787164375--vivid-example.surge.sh   
  by you@example.com              /        by you@example.com              
  4 files, 695 size                       \        4 files, 695 size                       
  Tue, 04 Aug 2026 02:35:00 GMT            \┌───   Tue, 04 Aug 2026 02:39:24 GMT           

  ┌──────────┬────────────────────────────────────────────────────────────────────────────────────────┐
  │          │   ns1.surge.world   ns2.surge.world     or CNAME…                                      │
  │    NS    │   ns3.surge.world   ns4.surge.world     geo.surge.world                                │
  ├──────────┼──────────────────┬───────────────────────┬─────────────────────┬─────────────┬─────────┤
  │   HTTP   │   sfo.surge.sh   │   US, San Francisco   │   138.197.235.123   │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   lhr.surge.sh   │   GB, London          │   46.101.67.123     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   yyz.surge.sh   │   CA, Toronto         │   159.203.50.177    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   jfk.surge.sh   │   US, New York        │   159.203.159.100   │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   ams.surge.sh   │   NL, Amsterdam       │   188.166.132.94    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   fra.surge.sh   │   DE, Frankfurt       │   138.68.112.220    │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   sgp.surge.sh   │   SG, Singapore       │   139.59.195.30     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   blr.surge.sh   │   IN, Bangalore       │   139.59.50.135     │   D.Ocean   │   ✔ ◍   │
  │   HTTP   │   syd.surge.sh   │   AU, Sydney          │   45.76.126.95      │   Vultr     │   ✔ ◍   │
  │   HTTP   │   nrt.surge.sh   │   JP, Tokyo           │   172.104.96.133    │   Linode    │   ✔ ◍   │
  └──────────┴──────────────────┴───────────────────────┴─────────────────────┴─────────────┴─────────┘

   Done! - vivid-example.surge.sh now serving revision 1785786900000--vivid-example.surge.sh
```

The two cards are the revisions production is moving between—the pointer steps from the newer to the older—and the table confirms the change across the network, ending with the revision now serving.

- **`rollback`** steps production one revision back. Run it again to go back further.
- **`rollfore`** steps production one revision forward—the undo for a rollback.
- **`cutover`** jumps production to the latest revision, or to a specific one: `surge example.com cutover 1719765600000`. This is how a [preview](https://surge.sh/docs/cli/previews) ships.

All three are pointer moves, and that's why they're instant: every revision is already stored on the platform, so moving production between them uploads nothing and rebuilds nothing—the pointer switches across [every edge node](https://surge.sh/docs/platform/cdn), worldwide, in the time it takes the command to run. Shipped something broken at the worst possible moment? The fix is faster than the panic. If the pointer is already where you asked it to go, the command reports `Unchanged` and does nothing.

Note that publishing normally cuts over automatically: a rolled-back project that receives a fresh publish will serve the new revision. To upload without cutting over, use `--preview`.

## Discarding revisions

Remove a revision from the system entirely:

```sh
surge example.com discard 1719852000000
```

If the discarded revision was serving production, production moves to a neighboring revision (the CLI reports which way it went). Discard the only revision and the project goes offline.

## Tearing down a project

To take a project down completely—every revision, gone from every edge node:

```
$ surge vivid-example.surge.sh teardown

   Success - vivid-example.surge.sh has been removed.
```

Teardown removes the project from your account. It doesn't touch DNS records or your domain registration, so republishing to the same domain later works exactly like the first publish.
