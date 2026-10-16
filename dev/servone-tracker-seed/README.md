# Tracker seed data

Fills a workspace with a demo Scrum project, **Servone App** (`APP`), that looks like a team
has used it for about 14 weeks:

- 8 demo teammates: a PM, five developers, QA and a designer. They are workspace people with
  an `@demo.servone.local` email and no login. Optional real members (`--member`) join as
  part-time developers.
- 11 epics, about 100 stories, tasks and bugs, story points on the Fibonacci scale, and some
  items left unpointed in the backlog.
- 2-week sprints: 6 closed (with committed and completed snapshots and rollovers), 1 active
  (today is inside it), and 2 future (the next one partly planned).
- Real history: planning, In Progress → In Review → Done by the person who did it, QA
  sending work back, bugs added mid-sprint, items descoped or canceled, re-estimates, and
  comments. Every change keeps its original date and author, so the burndown, velocity,
  activity feeds and "Your work" all look lived-in.

## Files

- `content.ts`: people, epics, titles and comment text. Pure data.
- `scenario.ts`: the simulator. It is pure and deterministic for a given `now` and `--seed`.
  Sprint start and complete go through the app's own
  `packages/servone-ui/src/plugins/tracker-resources/sprints/lib/lifecycle.ts`, so snapshots
  match what the sprint screens write.
- `seed.ts`: replays the scenario into a workspace.
- `workspace.ts`: the platform libraries, the system connection (signed with `SERVER_SECRET`)
  and the Scrum type setup. `dev/servone-tracker-import/apply.ts` uses it too.
- The Scrum type, statuses and field names come from
  `packages/servone-ui/src/plugins/tracker-resources/sprints/scrum-spec.ts`, the same spec
  the app's "Set up sprints" uses. If the workspace has no Scrum type yet, the seed creates it.

## Run

Past dates need the **system account**: the transactor resets `modifiedOn` to "now" for
every other account (`foundations/server/packages/middleware/src/modified.ts`). So the
script signs a system token with the backend's `SERVER_SECRET`. It reads the secret from
the environment and never prints it.

```bash
# from the repo root; SERVER_SECRET is the Railway backend's secret
export SERVER_SECRET="$(tr -d '\n' < dev/railway/secret.txt)"
T=dev/railway/node_modules/.bin/tsx

$T dev/servone-tracker-seed/seed.ts --workspace servone --dry-run          # counts only, no connection
$T dev/servone-tracker-seed/seed.ts --workspace servone --member admin@servone.local
$T dev/servone-tracker-seed/seed.ts --workspace servone --wipe            # remove it again
```

Options:

- `--workspace <url>`: the workspace URL slug. Required.
- `--member <email>`: a real member (matched by email social id) who takes part as a
  developer. Can be repeated.
- `--seed <n>`: a different but still deterministic history.
- `--accounts <url>`: the account service. Defaults to `ACCOUNTS_PROXY` in
  `dev/.servone-railway.json`.
- `--wipe`: removes the marked project (its issues, sprints and comments) and the
  `@demo.servone.local` people. It can't be combined with `--dry-run`.

Re-running without `--wipe` refuses, because the project already exists. The timeline is
relative to today, so wipe and re-seed to move it forward.

## Tests

```bash
dev/import-tool/node_modules/.bin/jest -c dev/servone-tracker-seed/jest.config.js
```

The tests check event order, issue numbering and sprint states. They also run the app's
`sprintReport` over the generated history and check that it agrees with the sprint
snapshots.

## Not seeded

- Sub-tasks.
- Labels, components and time reports.
- Issue descriptions, which are left empty because they would need the collaborator service.
