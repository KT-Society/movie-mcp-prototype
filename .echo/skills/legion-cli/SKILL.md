---
name: legion-cli
description: >-
  Use the public `legion` CLI to operate Legion-managed worktrees, folder contexts,
  terminals, repos, automations, worktree comments, and the browser embedded
  inside the Legion app. Use when the user says "$legion-cli", "use legion cli",
  "Legion worktree", "child worktree", "cardStatus", "spawn codex/claude in a worktree",
  "read/wait/send Legion terminal", "terminal send", "full handoff", "handover",
  "give this to another agent", "another worktree", "Legion browser", or
  "control the browser inside Legion". Prefer this over raw `git worktree`, ad hoc
  PTYs, Playwright, or Computer Use when the task touches Legion-managed state.
  Use Computer Use for browser windows, webviews, or desktop UI outside Legion's
  embedded browser.
---

# Legion CLI

This file is a discovery stub, not the usage guide. The full, version-matched Legion CLI
reference is served by the `legion` binary itself — kept out of this file on purpose so it
can never drift from the binary that will actually run your commands.

Engage Legion whenever its running editor/runtime is the source of truth: Legion-managed
worktrees, folder contexts, terminals, repos, automations, worktree comments, and the
browser embedded inside the Legion app. Triggers include "$legion-cli", "Legion worktree",
"child worktree", "spawn codex/claude in a worktree", "read/wait/send Legion terminal",
"full handoff" / "handover" / "give this to another agent", and "control the browser
inside Legion". Use plain shell tools when Legion state does not matter.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `LEGION_CLI_COMMAND` environment variable is set, use its value. Legion exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `LEGION_DEV_REPO_ROOT`, use `legion-dev`.
- Otherwise, on Linux outside an Legion-managed terminal, use `legion-ide`. Never run bare
  `legion` there — outside Legion's terminals it normally resolves to the
  GNOME Legion screen reader (`/usr/bin/legion`) and starts speech on the user's machine.
- Otherwise, use `legion`.

Below, `LEGION` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `LEGION` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Legion build.

## Load the full guide before running Legion commands

```text
LEGION skills get legion-cli
```

That prints the complete, version-matched guide for the exact binary that will handle your
next commands — worktrees, handoffs, terminals, automations, and the built-in browser.
Read it first, then run the specific command you need.

Don't guess subcommands or flags from memory or from a cached copy of this stub. They
change between Legion releases, and this file deliberately no longer lists them. Confirm the
app is up with `LEGION status --json` (start it with `LEGION open --json` if needed), and
prefer `--json` for agent-driven calls.

## If an older Legion does not recognize `skills get`

Use this fallback only when the selected binary explicitly reports that `skills get` is an
unknown command. Another failure is not proof of an older binary; report it rather than
guessing or changing executables. For a confirmed pre-guide binary, use only this bounded,
read-only bootstrap to orient. Do not dead-end and do not invent commands:

```text
LEGION status --json
LEGION worktree ps --json
LEGION terminal list --json
```

Then tell the user that updating Legion restores the full, version-matched guide via
`LEGION skills get legion-cli`. Beyond these commands, ask the user rather than guessing a
command surface this older binary may not support.
