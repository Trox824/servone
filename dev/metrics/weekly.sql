-- Weekly onboarding metrics (docs/onboarding/design.md section 8). Run against the CockroachDB that holds both
-- the account schema (global_account.*) and the workspace tables (tx, ...), e.g.:
--   cockroach sql --url "$DB_URL" -f dev/metrics/weekly.sql
-- Workspace tables have one row per document with a "workspaceId" column; fields that are not columns live in data JSONB.
-- tx."modifiedBy" is the account social_id._id as text; seeded and system writes use 'core:account:System', so the join to
-- social_id drops them and only people's actions count. Edit the INTERVAL in each cohort CTE to change the window.
-- Not in the database: email invites (only link invites leave a global_account.invite row) and "Hide setup" (browser storage).

-- 1. Funnel: sign-up, workspace, invite, accepted, team activation. Read the largest drop in drop_pct.
WITH
cohort AS (
  SELECT uuid, created_on, created_by
  FROM global_account.workspace
  WHERE created_on >= (extract(epoch FROM now() - INTERVAL '28 days') * 1000)::INT8
),
actions AS (
  SELECT t."workspaceId" AS workspace_uuid, s.person_uuid AS account_uuid, t."modifiedOn" AS at, t.data->>'objectClass' AS object_class
  FROM tx t
  JOIN global_account.social_id s ON s._id::TEXT = t."modifiedBy"
  WHERE t._class = 'core:class:TxCreateDoc'
    AND t.data->>'objectClass' IN ('tracker:class:Issue', 'chunter:class:ChatMessage', 'calendar:class:Event', 'hr:class:Request')
),
members AS (
  SELECT workspace_uuid, count(*) AS member_count
  FROM global_account.workspace_members
  GROUP BY workspace_uuid
),
weekly_doers AS (
  SELECT c.uuid, floor((a.at - c.created_on) / 604800000)::INT AS week, count(DISTINCT a.account_uuid) AS doers
  FROM cohort c
  JOIN actions a ON a.workspace_uuid = c.uuid AND a.at >= c.created_on AND a.at < c.created_on + 1209600000
  GROUP BY c.uuid, week
),
activated AS (
  SELECT DISTINCT d.uuid
  FROM weekly_doers d
  JOIN members m ON m.workspace_uuid = d.uuid
  WHERE d.doers >= 2 AND m.member_count >= 3
),
stages AS (
  SELECT 1 AS step, 'signed_up' AS stage,
         (SELECT count(DISTINCT person_uuid) FROM global_account.social_id
          WHERE created_on >= (extract(epoch FROM now() - INTERVAL '28 days') * 1000)::INT8) AS n
  UNION ALL SELECT 2, 'workspace_created', count(*) FROM cohort
  UNION ALL SELECT 3, 'invite_link_made', count(DISTINCT i.workspace_uuid) FROM cohort c JOIN global_account.invite i ON i.workspace_uuid = c.uuid
  UNION ALL SELECT 4, 'teammate_joined', count(*) FROM cohort c JOIN members m ON m.workspace_uuid = c.uuid WHERE m.member_count >= 2
  UNION ALL SELECT 5, 'team_activated', count(*) FROM activated
)
SELECT step, stage, n,
       round(100 * (1 - n::DECIMAL / NULLIF(lag(n) OVER (ORDER BY step), 0)), 1) AS drop_pct
FROM stages
ORDER BY step;

-- 2. Setup activation (leading): on day 1 the creator made a task and used a second module. Target 40% of new workspaces.
WITH
cohort AS (
  SELECT uuid, created_on, created_by
  FROM global_account.workspace
  WHERE created_on >= (extract(epoch FROM now() - INTERVAL '28 days') * 1000)::INT8
),
creator_day_one AS (
  SELECT c.uuid,
         bool_or(t.data->>'objectClass' = 'tracker:class:Issue') AS made_task,
         count(DISTINCT split_part(t.data->>'objectClass', ':', 1)) AS modules_used
  FROM cohort c
  JOIN global_account.social_id s ON s.person_uuid = c.created_by
  JOIN tx t ON t."workspaceId" = c.uuid AND t."modifiedBy" = s._id::TEXT
           AND t._class = 'core:class:TxCreateDoc'
           AND t."modifiedOn" >= c.created_on AND t."modifiedOn" < c.created_on + 86400000
           AND t.data->>'objectClass' IN ('tracker:class:Issue', 'chunter:class:ChatMessage', 'calendar:class:Event', 'hr:class:Request', 'document:class:Document')
  GROUP BY c.uuid
)
SELECT (SELECT count(*) FROM cohort) AS new_workspaces,
       count(*) FILTER (WHERE made_task AND modules_used >= 2) AS setup_activated,
       round(100 * count(*) FILTER (WHERE made_task AND modules_used >= 2)::DECIMAL / NULLIF((SELECT count(*) FROM cohort), 0), 1) AS setup_activation_pct
FROM creator_day_one;

-- 3. Team activation (north star): 3 or more members, and 2 or more of them did a core action in the same week
-- within 14 days of creation. Weeks are counted from the creation time (days 0-6, then 7-13), not rolling. Target 25%.
WITH
cohort AS (
  SELECT uuid, created_on
  FROM global_account.workspace
  WHERE created_on >= (extract(epoch FROM now() - INTERVAL '28 days') * 1000)::INT8
    AND created_on <= (extract(epoch FROM now() - INTERVAL '14 days') * 1000)::INT8
),
weekly_doers AS (
  SELECT c.uuid, floor((t."modifiedOn" - c.created_on) / 604800000)::INT AS week, count(DISTINCT s.person_uuid) AS doers
  FROM cohort c
  JOIN tx t ON t."workspaceId" = c.uuid AND t._class = 'core:class:TxCreateDoc'
           AND t.data->>'objectClass' IN ('tracker:class:Issue', 'chunter:class:ChatMessage', 'calendar:class:Event', 'hr:class:Request')
           AND t."modifiedOn" >= c.created_on AND t."modifiedOn" < c.created_on + 1209600000
  JOIN global_account.social_id s ON s._id::TEXT = t."modifiedBy"
  GROUP BY c.uuid, week
),
big_teams AS (
  SELECT workspace_uuid FROM global_account.workspace_members GROUP BY workspace_uuid HAVING count(*) >= 3
)
SELECT count(*) AS mature_workspaces,
       count(*) FILTER (WHERE c.uuid IN (SELECT d.uuid FROM weekly_doers d WHERE d.doers >= 2) AND c.uuid IN (SELECT workspace_uuid FROM big_teams)) AS team_activated,
       round(100 * count(*) FILTER (WHERE c.uuid IN (SELECT d.uuid FROM weekly_doers d WHERE d.doers >= 2) AND c.uuid IN (SELECT workspace_uuid FROM big_teams))::DECIMAL / NULLIF(count(*), 0), 1) AS team_activation_pct
FROM cohort c;

-- 4. Week-4 active: workspaces with 3 or more people doing a core action between day 21 and day 28 after creation.
-- Target: at least 5 workspaces.
WITH
cohort AS (
  SELECT uuid, created_on
  FROM global_account.workspace
  WHERE created_on <= (extract(epoch FROM now() - INTERVAL '28 days') * 1000)::INT8
    AND created_on >= (extract(epoch FROM now() - INTERVAL '90 days') * 1000)::INT8
),
week_four AS (
  SELECT c.uuid, count(DISTINCT s.person_uuid) AS active_people
  FROM cohort c
  JOIN tx t ON t."workspaceId" = c.uuid AND t._class = 'core:class:TxCreateDoc'
           AND t.data->>'objectClass' IN ('tracker:class:Issue', 'chunter:class:ChatMessage', 'calendar:class:Event', 'hr:class:Request')
           AND t."modifiedOn" >= c.created_on + 1814400000 AND t."modifiedOn" < c.created_on + 2419200000
  JOIN global_account.social_id s ON s._id::TEXT = t."modifiedBy"
  GROUP BY c.uuid
)
SELECT (SELECT count(*) FROM cohort) AS workspaces_past_week_four,
       count(*) FILTER (WHERE active_people >= 3) AS week_four_active
FROM week_four;
