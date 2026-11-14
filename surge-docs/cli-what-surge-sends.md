# What Surge Sends

A publish sends your project and the details the platform needs to put it online. This page lists all of it, so you can check it against the source and against your own network traffic.

## With every publish

- **Your project's files**, packed as a gzipped tarball under the project folder's name. For projects over 1 MB, files the domain already has are [left out](https://surge.sh/docs/cli/publishing).
- **Your credential**: the token from `surge login`, `SURGE_TOKEN`, or `--token`.
- **The domain** you're publishing to.
- **The file count and total size** of the project.
- **The arguments you passed**, as you typed them, so the platform can act on flags like `--preview`, `-m` and `--private`. A project path typed in full, like `/Users/you/site/dist`, travels as typed.
- **The CLI's version**, its command name (`surge`, or the tool embedding it), and the time the publish started.
- **A User-Agent** saying how the CLI was called (below).

Like any request, a publish also reaches us from your IP address.

## The User-Agent

```txt
surge/0.54.0 (auth=env; ci=0; tty=0; via=npx; agent=claude-code)
```

| Field | Values | Meaning |
|---|---|---|
| `auth` | `netrc`, `env`, `flag` | Where the credential came from: the saved login, `SURGE_TOKEN`, or `--token` |
| `ci` | `0`, `1` | Whether the `CI` environment variable is set |
| `tty` | `0`, `1` | Whether a terminal is attached |
| `via` | `npx`, `installed` | Whether the CLI ran through `npx` or from an installed copy |
| `agent` | a name, or absent | The AI agent running the CLI, when it identifies itself |

`agent` comes from the `AI_AGENT` environment variable (only the name before any `_`, `/` or `@`, so `claude-code_2-1-300_agent` is sent as `claude-code`). Without it, the CLI looks for a few variables agents set in the shells they run: `CLAUDECODE`, `CURSOR_AGENT`, `GEMINI_CLI`, `CODEX_SANDBOX`, `REPL_ID` and `E2B_SANDBOX`. It checks whether they're set, and never sends what they contain.

We use it to see how Surge is used—by people at a terminal, by CI, and by agents—so we can make each of them work well.

## Never sent

- The value of any environment variable
- Your hostname or operating system
- Any file outside the project you're publishing
- Anything about other software on your machine, beyond the agent name above

The User-Agent's fields are names and `0`/`1` only. A change to what the CLI sends will be listed in the release notes and on this page.

See the [Privacy Policy](https://surge.sh/privacy) for how Surge handles what it receives.
