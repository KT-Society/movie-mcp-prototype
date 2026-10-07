---
name: orchestration
description: >-
  Use Legion orchestration for structured multi-agent coordination: threaded
  messages, blocking ask/reply flows, task dispatch, worker_done/escalation
  waits, task DAGs, decision gates, coordinator loops, or decomposing work
  across agents. Use `legion-cli` instead for full ownership handoffs, including
  requests phrased as "hand off", "handoff", "handover", "give this to another
  agent", or "another worktree" when the user did not explicitly ask to
  supervise, monitor, wait for results, or coordinate a DAG. Use `legion-cli` for
  ordinary terminal control, lightweight terminal prompts, shell commands, Legion
  worktree management, reading or waiting on terminals, and automation of the
  browser embedded inside Legion. Use Computer Use for browser windows, webviews,
  Legion app UI, or desktop UI outside Legion's embedded browser.
---

# Legion Orchestration

This file is a discovery stub, not the usage guide. The full, version-matched Legion
orchestration reference is served by the `legion` binary itself — kept out of this file on
purpose so it can never drift from the binary that will actually run your commands.

Engage Legion orchestration whenever you need structured multi-agent coordination: threaded
messages, blocking ask/reply flows, task dispatch, worker_done/escalation waits, task DAGs,
decision gates, coordinator loops, or decomposing work across agents. Use the legion-cli skill
instead for full ownership handoffs ("hand off", "handoff", "handover", "give this to
another agent", "another worktree") when the user did not ask to supervise, monitor, wait
for results, or coordinate a DAG — and for ordinary terminal control, shell commands,
worktree management, and the built-in browser. Coordination requires real Legion runtime
state; never substitute a non-Legion subagent tool.

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
LEGION skills get orchestration
```

That prints the complete, version-matched guide for the exact binary that will handle your
next commands — task creation and dispatch, injected lifecycle preambles, worker_done
authority, decision gates, and coordinator loops. Read it first, then run the specific
command you need.

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
LEGION orchestration task-list --json
LEGION terminal list --json
```

Then tell the user that updating Legion restores the full, version-matched guide via
`LEGION skills get orchestration`. Beyond these commands, ask the user rather than guessing a
command surface this older binary may not support.
