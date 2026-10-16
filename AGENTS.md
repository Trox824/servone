# Project Instructions

- Do not run build commands automatically for verification.
- When finishing work, state that the task is complete and ask the user to verify it manually.

## Code rules

Applies to Servone code: `packages/servone-*`, `dev/servone-*`, `dev/railway`, and Servone edits inside upstream Huly files. Upstream code keeps its own style; do not rewrite it to match.

### Comments

- Comment only a non-obvious why: a gotcha, invariant, workaround, external constraint, or the reason behind a magic value. Never what the code does.
- A comment must make a future reader less confused. If the code already says it, delete the comment.
- One line is the target. Two lines only for two distinct facts (constraint + where it must stay in sync).
- No section banners, no decorative separators, no `// Import dependencies`, no restated function or variable names, no JSDoc that repeats the signature.
- No history in comments: no "changed from X", "added for ticket SRV-12", "previously", "now we". That belongs in the commit message.
- No comments explaining a Svelte/CSS override line by line. One line on why the override exists is enough.
- `TODO(name): specific thing + why`. Bare `TODO` is rejected.
- Keep license headers, `eslint-disable`, `@ts-expect-error`, `svelte-ignore` directives.

### Naming

- No `data`, `result`, `temp`, `item`, `obj`, `info`, `value`, `res`, `utils` as identifiers. Name the thing: `issue`, `activeSprint`, `parsedRow`.
- No `Manager`, `Handler`, `Helper`, `Util` suffixes.
- Booleans read as predicates: `isExpired`, `hasSeats`, `canEdit`.
- No `shape` in symbol names.

### Structure

- No abstraction for one caller. No interface with one implementation.
- No `try/catch` that logs and swallows. Catch specific errors and rethrow or surface them.
- No defensive checks against states the type system already excludes.
- No feature flags, config options, or params "for later".
- Magic numbers get a named const with the constraint source (`MAX_NAME_LEN = 255 // varchar column`).
- No conditional empty-object spreads (`...(cond ? { a } : {})`). Set the property directly or build the object in separate statements.

### Types

Parse at the boundary. Untyped input (HTTP body, env, JSON file, `localStorage`, third-party SDK) becomes a typed value the moment it enters, in the module that owns that shape. Inside the codebase:

- No `unknown` parameters and no type aliases that only rename `unknown`.
- No `object` parameters. Use the owner type.
- No `Record<string, any>` / `Record<string, unknown>` dictionaries. Use a concrete value type.
- No `as any`, no `as unknown as X`, no chained assertions.
- No widen-then-assert (annotating a known value with a broad type, then casting it back).
- No explicit annotation that widens a known initializer. Let inference work, or use `satisfies`.
- No `typeof x === 'object'` re-checks on values that already have a type.
- No non-null `!` to silence the compiler.

### Output hygiene

- No emojis in code, commits, logs, docs, UI copy.
- No "Enhanced", "Improved", "Robust", "Seamless", "Leverage", "Comprehensive".
- Commits: Conventional Commits, subject 50 chars or less, body only when the why is not obvious.
- UI copy is specific: "Invite teammate", not "Get started".

## Upstream Huly files

The repo is EPL-2.0, a fork of Huly. Keeping our changes out of upstream files keeps upstream merges cheap.

- Never strip or edit a Huly license header.
- New features go in Servone-owned files (`packages/servone-*`, `services/servone`, `dev/servone-*`), not in upstream Huly files.
- If a Huly file must change, make the smallest hook (one import or one prop) with the logic in a Servone file. Mark it with a `servone:` comment and add a row to `docs/upstream-edits.md`.
