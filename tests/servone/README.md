# Servone acceptance suite

Playwright checks for the 12 launch scenarios in `docs/SERVONE-PRODUCT-PLAN.md` ("Acceptance scenarios"). Every spec runs twice, once as project `vi` and once as `en`. Each test creates its own workspaces through the account service and deletes them when it finishes. Workspaces it fails to delete are listed in the error.

## Setup

This package sits outside Rush. Install it on its own:

```sh
cd tests/servone
npm install
npx playwright install chromium
```

If you only need `--list` or the type check, you can link the sanity suite's modules instead: `ln -s ../sanity/node_modules node_modules`. Those modules don't include `imapflow` or `mailparser`, so the IMAP inbox won't work that way.

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `SERVONE_BASE_URL` | no | Front URL. Default `https://platform.servone.app` |
| `SERVONE_ACCOUNTS_URL` | no | Account service URL. Default: `ACCOUNTS_URL` from `<base>/config.json` |
| `SERVONE_USERS` | yes | At least 3 comma-separated emails of existing accounts, used as owner, member A and member B. The inbox must receive their mail |
| `SERVONE_INBOX` | yes | `http` or `imap`. This is where OTP and notification mail is read |
| `SERVONE_INBOX_URL` | http | URL template. `{email}` is replaced with the recipient, and the endpoint returns that recipient's latest mail as text or JSON. Mailpit example: `http://mailpit:8025/api/v1/search?query=to:{email}&limit=1` |
| `SERVONE_INBOX_TOKEN` | no | Sent as `Authorization: Bearer` to the HTTP inbox |
| `SERVONE_IMAP_HOST`, `SERVONE_IMAP_USER`, `SERVONE_IMAP_PASSWORD` | imap | Credentials for a catch-all mailbox that receives mail for every test address |
| `SERVONE_IMAP_PORT`, `SERVONE_IMAP_MAILBOX` | no | Defaults are `993` and `INBOX` |
| `SERVONE_OTP_REGEX` | no | Pattern for the code inside the mail. Default: 6 digits not preceded by `#` |
| `SERVONE_SIGNUP` | no | Set to `1` to run the scenario 1 test that signs up a new visitor. Without it, that test is skipped (production signup is off) |
| `SERVONE_SIGNUP_EMAIL` | with signup | Address template for new visitors. `{tag}` becomes a unique suffix, e.g. `qa+{tag}@test.servone.vn` |
| `SERVONE_ZOHO_EMAIL`, `SERVONE_ZOHO_APP_PASSWORD` | no | Zoho mailbox for scenario 11. Without them, scenario 11 is skipped |

The language check in scenario 12 flags any Vietnamese letter it finds on an English screen. Give the test users ASCII display names, or their names will trigger it.

## Run

```sh
npx playwright test                    # all scenarios, vi then en
npx playwright test --project=vi       # one language
npx playwright test specs/03-tracker.spec.ts
npx playwright show-report             # per-scenario pass/fail with traces
```

`workers` is 1. The specs share signed-in users, and production rate-limits OTP sends per email. Each user gets one OTP per worker run, and the signed-in state is reused after that.

## Scenario map

| # | Spec | Automated | Not automated yet |
|---|---|---|---|
| 1 | `01-signup.spec.ts` | Sign up with OTP in under 30 s (behind `SERVONE_SIGNUP=1`). An existing user creates the company in `/login/createWorkspace`, invites 2 people with account menu > "Invite to workspace" > invite link, and both join. The 5-minute budget is checked | Employees > Import from CSV invite path |
| 2 | `02-isolation.spec.ts` | Invitee only sees company A. B can't get a token for A (`selectWorkspace`), opening A by URL shows none of A's tasks, and B's search doesn't find them | Transactor-level `findAll` probes for cards, events, mail threads and blobs using A's ids. These need a platform client, not the browser |
| 3 | `03-tracker.spec.ts` | Project, Scrum setup, epic plus 5 stories at 3 points each, plan 3 into a sprint, start, drag 2 to Done, complete with roll-over, check burndown is shown and epic progress reads 6/15 | Burndown point values (only checked that the chart renders) |
| 4 | `04-plan-day.spec.ts` | Written against the plan's Lịch tabs (Của tôi, Nhóm) | Fails today: those tabs and drag-to-plan are not built |
| 5 | `05-google-calendar.spec.ts` | Settings > Integrations > Google Calendar > Connect opens Google OAuth | Google sign-in, events showing within 1 minute, two-way edits |
| 6 | `06-workload.spec.ts` | Written against Lịch > Nguồn lực | Fails today: the workload view is not built. Seeding over-booked hours is a TODO |
| 7 | `07-workflow.spec.ts` | "Tuyển dụng" from the Hiring template, a job, 2 stage moves on the stepper, the move shows in history | Owner and deadline per stage (not in the UI yet), stage-owner notification in app and by email, deadline in Lịch |
| 8 | `08-approval.spec.ts` | Leave request, approval from Inbox > "Waiting for my approval". A purchase job reaches "Awaiting approval", reject is blocked until a reason is entered, and the submitter sees the reason | Fields locking after approval. Leave in Lịch > Nhóm fails today (tab not built). The staff member needs a manager (approver) set in the org chart, or the leave dialog offers "Book leave" and the test fails |
| 9 | `09-meeting.spec.ts` | Meeting from Lịch with 2 guests and video, all three open it from the event, 2 action items become tasks | Camera and screen share (fake media devices only prove the call opens), joining from the notification, assigning owners to action items |
| 10 | `10-drive.spec.ts` | Create a drive, upload a folder (PDF + PNG), preview both in place, a task attachment under "Tệp đính kèm" | The "Tệp đính kèm" section is not built, so the last step fails today |
| 11 | `11-mail.spec.ts` | Zoho connect with an app password, a self-sent email arrives within 1 minute, a reply stays in the thread, "Tạo việc" opens a task with the subject | The full 30-day history sync, Gmail, a reply landing in a different recipient's inbox, disconnect removing the credentials |
| 12 | `12-language.spec.ts` | Login page, OTP mail and every MVP app in the run language. Then the user switches in account menu > Appearance > Language, and the screens are checked for "Huly", raw string ids and, in English, Vietnamese letters | The landing page (separate site), every dialog inside each app |

## Manual checks per release

- Meetings: camera and microphone work, screen share shows, and joining from the notification takes one click.
- Google Calendar: connect a real Google account, events appear within 1 minute, and edits go both ways.
- Mail: Gmail with an app password, a 30-day history sync, a reply in the recipient's own client, and disconnect.
- Language: open each dialog once per language.
- No "Huly" in page titles, the favicon or error pages (scenario 12 only checks the visible text of each app).
