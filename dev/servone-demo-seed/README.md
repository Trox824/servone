# Demo company data

Fills the demo workspace `acmestudio` with a fictional company, Acme Studio, for the apps the
tracker seed does not cover. It reuses the tracker seed's 8 demo teammates
(`@demo.servone.local`, no login) and the admin, so run `dev/servone-tracker-seed` first.

## What it writes

- **Departments**: Engineering, Product, Design, Operations (the admin leads Operations). Demo
  people move into them; the admin stays in the root.
- **Chat**: `#engineering`, `#design`, `#releases` and a private `#leadership` are created;
  `#general` and `#random` get messages. 58 messages and 14 thread replies over the last two
  weeks with mentions and two pinned messages. 3 DMs between the admin and Linh, Minh and Duc.
- **Calendar**: weekly team sync, biweekly sprint planning, weekly design review, 1:1s, a
  customer call, a team lunch, a go/no-go and a workshop, with guests. 4 bookable resources
  (Big room, Small room, Client room that needs approval from Linh, Projector) with bookings.
  Two leave requests: one approved (Mai), one pending for the admin (Thao).
- **Approvals**: Engineering hiring, Office purchasing and IT helpdesk, created with the same
  `createWorkflow` as the app, 7 items each across statuses. Three items sit at a gate; the
  approval engine files them to the admin.
- **Drive**: "Company" with Policies, Design, Finance, Onboarding and 8 small generated files
  (markdown, PDF, PNG) uploaded to the datalake.
- **Mail**: a mailbox `admin@acmestudio.co` for the admin with 17 threads (customers, a candidate, vendors,
  teammates, spam) across Inbox, Sent, Archive, Spam and Important, 4 unread, PDF attachments. Content is in
  `mail-content.ts`.

## Run

```bash
export SERVER_SECRET="$(tr -d '\n' < dev/railway/secret.txt)"
T=dev/railway/node_modules/.bin/tsx

$T dev/servone-demo-seed/seed.ts --workspace acmestudio --dry-run   # counts only
$T dev/servone-demo-seed/seed.ts --workspace acmestudio
$T dev/servone-demo-seed/seed.ts --workspace acmestudio --wipe
$T dev/servone-demo-seed/seed.ts --workspace acmestudio --mail          # mail only
$T dev/servone-demo-seed/seed.ts --workspace acmestudio --mail --wipe   # remove mail only
```

Any other workspace is refused unless `--i-know` is passed. Re-running without `--wipe` refuses.
Times are relative to today, so wipe and re-seed to move them forward. After a seed the script
waits for the approval engine and prints counts.

Options: `--accounts <url>` (default `ACCOUNTS_PROXY` in `dev/.servone-railway.json`),
`--datalake <url>` (default `DATALAKE_URL` there).

## How it marks and removes its data

Every doc and space the seed picks the id for starts with `acme-`; workflow projects carry a
marker in their description. `--wipe` removes those, the approval requests the engine filed for
them, and the guest copies of events the calendar service made. It puts demo people back in the
root department.

Left behind by `--wipe`: model docs (workflow statuses, one project type per workflow, the
resource class and booking fields) and the drive file blobs in the datalake.

## Things to know

- Demo people have no account, so the seed gives each a fixed account id (`personUuid`). That is
  what lets a DM name them. The calendar service therefore files a read-only copy of each event
  in a calendar that does not exist; they are invisible and wiped with the event. `--wipe`
  clears the account ids.
- Items at "Hired" and "Purchased", and the approved leave, are past an approval gate. The
  transactor's approval guard only lets the `servone-approvals` session write those, so the seed
  opens a second system connection under that service id for them (and to remove requests).
- The annual leave balance is computed (12 days minus approved annual leave); nothing is stored.
  Mai's approved leave is Vacation, so it counts.
- The mailbox has no IMAP login behind it, so the mail service never opens a session for it. Reading and
  starring work; send, reply, archive and move fail with "not connected", and folder unread counts stay as
  seeded. Connecting a real mailbox for the admin is refused until the mail is wiped. Wipe refuses to touch a
  mailbox it did not create.
- Issue descriptions and form fields beyond the title are not set: they need the collaborator
  service.

## Tests

```bash
dev/import-tool/node_modules/.bin/jest -c dev/servone-demo-seed/jest.config.js
```

They check that no resource is double-booked (repeats included), message order, event dates,
mention markup and the generated file bytes.
