# Servone tracker import

Writes the day-by-day schedule in `docs/SERVONE-PRODUCT-PLAN.md` into a workspace as a ready
Scrum project. (Phase 0 PRD, user stories 57–59; plan section P0.3.)

| File | Role |
|---|---|
| `plan.ts` | Pure parsing: plan markdown → `ImportPlan` (project, sprints, epics, tasks) |
| `apply.ts` | Writes the plan into a workspace as a Scrum project |
| `tickets.ts` | Writes ticket text from `docs/tracker-tickets.md` into the project `apply.ts` made |
| `__tests__/plan.test.ts` | Jest tests on a small inline plan |

## Apply to a workspace

`apply.ts` builds the plan with `plan.ts` and writes it over a system connection signed with
the backend's `SERVER_SECRET` (the same connection as `dev/servone-tracker-seed`, in its
`workspace.ts`). It needs no password:

- project `SRV` "Servone MVP launch" on the Scrum type: 1-week sprints, Fibonacci points,
  an estimate required before Done
- the five sprints with their dates, planned, each with its week as the sprint goal
- the epics (type Epic, start and due dates covering their tasks)
- one task per plan row: type Task, story points, hours, start and due date on its day, in
  the sprint that covers that day (day 33, launch, stays out of any sprint). Everything starts
  in Backlog; starting a sprint moves its issues and their epics to Todo
- the plan text of each row (and each epic's module intro) as the issue's first comment
- `--member <email>`: owns the project and is assigned every task

```bash
SERVER_SECRET="$(tr -d '\n' < dev/railway/secret.txt)" dev/railway/node_modules/.bin/tsx \
  dev/servone-tracker-import/apply.ts --workspace servone --member admin@servone.local
```

It refuses to run twice. `--replace` removes the project an earlier run made (found by its
description) and writes it again, which also drops any status changes made since. Start
Sprint 1 from the Backlog on day 1.

Tests (they borrow jest and ts-jest from `dev/import-tool`, so it must be installed):

```bash
dev/import-tool/node_modules/.bin/jest -c dev/servone-tracker-import/jest.config.js
```
