// Servone: Huly backend on Railway (project giving-curiosity / production).
// Usage: `cd dev/railway && npm i && railway link`, then `railway config plan` / `railway config apply`.
// Public domains were made with `railway domain --service <name> --port <port>` and are not managed here.
// Secrets come from gitignored files:
//   ../secret.txt            SERVER_SECRET shared by all services (openssl rand -hex 24)
//   ../creds.json            `railway bucket credentials --bucket blobs --json`
//   ../resend.txt            Resend API key (the SMTP password)
//   ../google-calendar.json  Google OAuth "Web application" client JSON (redirect URI https://<calendar domain>/signin/code)
//   ../vapid.json            `npx web-push generate-vapid-keys --json` (web push); the front's PUSH_PUBLIC_KEY must match
//   ../../.env.servone-cloud DB_CR_URL (CockroachDB Cloud connection string)
//   ../r2.json               Cloudflare R2 backup bucket { endpoint, accessKeyId, secretAccessKey, bucket }; absent, no backup service
// Every apply rewrites the sealed variables (they cannot be read back) and redeploys.
// Mirrors dev/docker-compose.yaml + servone-*.override.yaml minus cockroach (CRDB Cloud) and minio (Railway Bucket).
import { existsSync, readFileSync } from "node:fs";
import { defineRailway, database, image, github, preserve, project, service, volume, bucket, group } from "railway/iac";

const HULY = "s0.7.437";
// Version the stock s0.7.437 workspace service stamped on our workspaces (account DB workspace_status.version_*);
// the fork-built transactor must report the same one. Confirm before the first deploy.
const WORKSPACE_MODEL_VERSION = "0.7.426";
const REGION = "asia-southeast1-eqsg3a"; // Singapore — same as the CRDB Cloud cluster (aws ap-southeast-1)

const SECRET = readFileSync(new URL("../secret.txt", import.meta.url), "utf8").trim();
const DB_URL = readFileSync(new URL("../../.env.servone-cloud", import.meta.url), "utf8")
  .split("\n")
  .find((l) => l.startsWith("DB_CR_URL="))!
  .slice("DB_CR_URL=".length)
  .trim();
const creds = JSON.parse(readFileSync(new URL("../creds.json", import.meta.url), "utf8"));
const RESEND_KEY = readFileSync(new URL("../resend.txt", import.meta.url), "utf8").trim();
// Until the OAuth client exists the service still boots (its domain is needed to create the client); sign-in fails.
const GOOGLE_CALENDAR_FILE = new URL("../google-calendar.json", import.meta.url);
const GOOGLE_CALENDAR = existsSync(GOOGLE_CALENDAR_FILE) ? readFileSync(GOOGLE_CALENDAR_FILE, "utf8").trim() : "{}";
const vapid: { publicKey: string; privateKey: string } = JSON.parse(
  readFileSync(new URL("../vapid.json", import.meta.url), "utf8")
);
// Off-Railway on purpose: a backup in the same project dies with it.
const R2_FILE = new URL("../r2.json", import.meta.url);
const r2: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string } | undefined = existsSync(R2_FILE)
  ? JSON.parse(readFileSync(R2_FILE, "utf8"))
  : undefined;

const sealed = (value: string) => ({ value, isSealed: true });

// Deterministic from the service names below.
const ACCOUNT_INT = "http://account.railway.internal:3000";
const ACCOUNT_PUBLIC = "https://account.servone.app";
const DATALAKE_INT = "http://datalake.railway.internal:4030";
const MAIL_INT = "http://mail.railway.internal:8097";
const KVS_INT = "http://hulykvs.railway.internal:8094";
const HULYLAKE_INT = "http://hulylake.railway.internal:8096";
const COLLABORATOR_INT = "http://collaborator.railway.internal:3078";
const CALENDAR_INT = "http://calendar.railway.internal:8095";
const NOTIFICATION_INT = "http://notification.railway.internal:8091";
const SERVONE_INT = "http://servone-mcp.railway.internal:4073";
const QUEUE = "redpanda.railway.internal:9092";
// Services push here every few seconds; the admin Server Manager screen reads it (in memory, no history).
const VOLUME_ALERTS = { usage: { "80": {}, "95": {}, "100": {} } };
// Used for email links/redirects. `front` is not declared here: it runs our build (dev/railway/front-image,
// built by Railway from GitHub on push to develop); its variables were set with `railway add`.
// Public front domain: auth cookies only survive under servone.app, and MCP OAuth consent and CORS use this origin.
const FRONT_URL = "https://platform.servone.app";
const LIVEKIT_HOST = "https://servone-p887d5p6.livekit.cloud";
const LIVEKIT_API_KEY = "APISWkggKcaRhVq";

export default defineRailway(() => {
  const blobs = bucket("blobs", { region: "sin" });

  const redpandaData = volume("redpanda-data", { region: REGION, sizeMB: 5000, allowOnlineResize: true, alerts: VOLUME_ALERTS });

  const redpanda = service("redpanda", {
    source: image("docker.redpanda.com/redpandadata/redpanda:v24.3.6"),
    // Upstream compose command, advertised on the private domain, no external listener. Railway's start command
    // replaces the image entrypoint, so call rpk directly (bare `redpanda` rejects rpk-only flags like --mode).
    start:
      "rpk redpanda start --mode dev-container --smp 1 --memory 512M --reserve-memory 0M --overprovisioned " +
      "--kafka-addr internal://0.0.0.0:9092 --advertise-kafka-addr internal://redpanda.railway.internal:9092 " +
      "--pandaproxy-addr internal://0.0.0.0:8082 --advertise-pandaproxy-addr internal://redpanda.railway.internal:8082 " +
      "--schema-registry-addr internal://0.0.0.0:8081 " +
      "--rpc-addr 0.0.0.0:33145 --advertise-rpc-addr redpanda.railway.internal:33145 " +
      "--default-log-level=info",
    env: {
      // The image runs as uid 101; Railway volumes mount root-owned.
      RAILWAY_RUN_UID: "0",
    },
    volumeMounts: { "/var/lib/redpanda/data": redpandaData },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  const datalake = service("datalake", {
    source: image(`hardcoreeng/datalake:${HULY}`),
    env: {
      PORT: "4030",
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      DB_URL: sealed(DB_URL),
      // Format: see services/datalake/pod-datalake/src/config.ts parseBucketConfig.
      BUCKETS: sealed(
        `${creds.bucketName},eu|${creds.endpoint}?accessKey=${creds.accessKeyId}&secretKey=${creds.secretAccessKey}&region=${creds.region}`
      ),
      QUEUE_CONFIG: QUEUE,
      REGION: "cockroach",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Built from this fork: the s0.7.437 image predates API tokens, which servone's MCP OAuth issues.
  const account = service("account", {
    source: github("Trox824/servone", { branch: "develop" }),
    env: {
      RAILWAY_DOCKERFILE_PATH: "dev/railway/service-image/Dockerfile",
      SERVONE_PACKAGE: "@hcengineering/pod-account",
      SERVONE_FOLDER: "pods/account",
      ACCOUNT_PORT: "3000",
      PORT: "3000",
      PRODUCT_NAME: "Servone",
      SERVER_SECRET: sealed(SECRET),
      DB_URL: sealed(DB_URL),
      ACCOUNTS_URL: ACCOUNT_PUBLIC,
      // Handed to the browser, so it must be the public WSS endpoint.
      TRANSACTOR_URL: "wss://${{transactor.RAILWAY_PUBLIC_DOMAIN}};;cockroach,",
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
      QUEUE_CONFIG: QUEUE,
      REGION_INFO: "cockroach|CockroachDB",
      FRONT_URL,
      MAIL_URL: MAIL_INT,
      ADMIN_EMAILS: preserve(),
      WORKSPACE_LIMIT_PER_USER: "10000",
      LAST_NAME_FIRST: "true",
      MAILBOX_DOMAINS: "gmail.com",
      MAILBOX_MAX_COUNT_PER_ACCOUNT: "2",
      CORS_ORIGINS: FRONT_URL,
      BRANDING_PATH: "/usr/src/app/branding.json",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS", healthcheckPath: "/providers" },
  });

  // Built from this fork so the approval guard (@servone/approvals) runs inside it.
  // Rollback: `railway service source connect --image hardcoreeng/transactor:s0.7.437` on the transactor service.
  const transactor = service("transactor", {
    source: github("Trox824/servone", { branch: "develop" }),
    env: {
      RAILWAY_DOCKERFILE_PATH: "dev/railway/service-image/Dockerfile",
      SERVONE_PACKAGE: "@hcengineering/pod-server",
      SERVONE_FOLDER: "pods/server",
      SERVONE_BASE: "hardcoreeng/base:v20250916",
      // Baked into the bundle; a transactor whose version differs from a workspace's answers every connect with "upgrading".
      MODEL_VERSION: WORKSPACE_MODEL_VERSION,
      // The front refuses a transactor whose hello version differs from its own.
      VERSION: "0.7.437",
      // Railway probes healthcheckPath on PORT; the Dockerfile image declares no EXPOSE.
      PORT: "3332",
      SERVER_PORT: "3332",
      SERVER_SECRET: sealed(SECRET),
      DB_URL: sealed(DB_URL),
      ACCOUNTS_URL: ACCOUNT_INT,
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
      QUEUE_CONFIG: QUEUE,
      REGION: "cockroach",
      FRONT_URL,
      // Browser-facing blob URL template (public datalake domain).
      FILES_URL: "https://${{datalake.RAILWAY_PUBLIC_DOMAIN}}/blob/:workspace/:blobId/:filename",
      // List search, Cmd+K, @mentions and MCP search_workspace; unreachable, every search quietly returns nothing.
      FULLTEXT_URL: "http://fulltext.railway.internal:4702",
      MAIL_URL: MAIL_INT,
      // The gate drops pushes for muted channels, pauses and off hours, then forwards to NOTIFICATION_INT.
      WEB_PUSH_URL: SERVONE_INT,
      MAIL_AUTH_TOKEN: "${{servone-mcp.MAIL_AUTH_TOKEN}}",
      // Event triggers post organizer changes here so they reach Google.
      CALENDAR_URL: CALENDAR_INT,
      ENABLE_COMPRESSION: "true",
      COMMUNICATION_API_ENABLED: "true",
      // Unset, the communication server falls back to http://huly.local:8096 and every description save fails.
      HULYLAKE_URL: HULYLAKE_INT,
      LAST_NAME_FIRST: "true",
      METRICS_CONSOLE: "false",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS", healthcheckPath: "/api/v1/health" },
  });

  // pod-mail speaks SMTP/SES only, so Resend goes via its SMTP relay (user "resend", password = API key).
  // SOURCE must be on a domain verified in Resend (servone.app).
  const mail = service("mail", {
    source: image(`hardcoreeng/mail:${HULY}`),
    env: {
      PORT: "8097",
      SOURCE: "Servone <no-reply@servone.app>",
      SMTP_HOST: "smtp.resend.com",
      // Railway Hobby blocks outbound 465/587; 2465 is Resend's alternate implicit-TLS port.
      SMTP_PORT: "2465",
      SMTP_TLS_MODE: "secure",
      SMTP_USERNAME: "resend",
      SMTP_PASSWORD: sealed(RESEND_KEY),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  const collaborator = service("collaborator", {
    source: image(`hardcoreeng/collaborator:${HULY}`),
    env: {
      COLLABORATOR_PORT: "3078",
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Key-value store for service state; calendar keeps Google tokens and sync cursors here.
  const hulykvs = service("servone-kvs", {
    source: image(`hardcoreeng/hulykvs:${HULY}`),
    env: {
      // No TLS in hulykvs 0.3.2, so it shares the in-project CockroachDB (own schema) instead of CRDB Cloud.
      HULY_DB_CONNECTION: "postgresql://root@hulylake-db.railway.internal:26257/defaultdb?sslmode=disable",
      HULY_TOKEN_SECRET: sealed(SECRET),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // hulylake speaks CockroachDB SQL (`set search_path to $1`) over NoTls, so neither Postgres nor CRDB Cloud works.
  const hulylakeDbData = volume("hulylake-db-volume", { region: REGION, sizeMB: 5000, allowOnlineResize: true, alerts: VOLUME_ALERTS });
  const hulylakeDb = service("servone-lake-db", {
    source: image("cockroachdb/cockroach:v24.3.36"),
    start:
      "cockroach start-single-node --insecure --listen-addr=[::]:26257 --http-addr=[::]:8080 " +
      "--store=/cockroach/cockroach-data --cache=128MiB --max-sql-memory=128MiB --max-go-memory=1GiB",
    volumeMounts: { "/cockroach/cockroach-data": hulylakeDbData },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Message-group storage for the communication API; objects share the blobs bucket with datalake.
  const hulylake = service("servone-lake", {
    source: image(`hardcoreeng/hulylake:${HULY}`),
    env: {
      PORT: "8096",
      HULY_TOKEN_SECRET: sealed(SECRET),
      HULY_DB_CONNECTION: "postgresql://root@hulylake-db.railway.internal:26257/defaultdb?sslmode=disable",
      HULY_S3_BUCKET: creds.bucketName,
      AWS_ENDPOINT_URL: creds.endpoint,
      AWS_ACCESS_KEY_ID: sealed(creds.accessKeyId),
      AWS_SECRET_ACCESS_KEY: sealed(creds.secretAccessKey),
      AWS_REGION: creds.region,
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Two-way Google Calendar sync (services/calendar/pod-calendar). Google pushes changes to WATCH_URL, so it needs
  // a public domain; the front's CALENDAR_URL points at the same domain.
  const calendar = service("calendar", {
    source: github("Trox824/servone", { branch: "develop" }),
    env: {
      RAILWAY_DOCKERFILE_PATH: "dev/railway/service-image/Dockerfile",
      SERVONE_PACKAGE: "@hcengineering/pod-calendar",
      SERVONE_FOLDER: "services/calendar/pod-calendar",
      VERSION: "0.7.437",
      PORT: "8095",
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      KVS_URL: KVS_INT,
      Credentials: sealed(GOOGLE_CALENDAR),
      WATCH_URL: "https://${{calendar.RAILWAY_PUBLIC_DOMAIN}}/push",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Stock web push sender behind the push gate in servone-mcp.
  const notification = service("notification", {
    source: image(`hardcoreeng/notification:${HULY}`),
    env: {
      PORT: "8091",
      SOURCE: "Servone <no-reply@servone.app>",
      PUSH_SUBJECT: "mailto:no-reply@servone.app",
      PUSH_PUBLIC_KEY: vapid.publicKey,
      PUSH_PRIVATE_KEY: sealed(vapid.privateKey),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Index store for fulltext; the fulltext client is @elastic/elasticsearch 7.x, so not OpenSearch.
  const elasticData = volume("elastic-data", { region: REGION, sizeMB: 5000, allowOnlineResize: true, alerts: VOLUME_ALERTS });
  const elastic = service("elastic", {
    source: image("elasticsearch:7.14.2"),
    // Railway volumes mount root-owned and Elasticsearch refuses to run as root: chown as root, then the stock
    // entrypoint drops to uid 1000.
    start:
      "/bin/bash -c 'chown -R 1000:0 /usr/share/elasticsearch/data && " +
      "exec /bin/tini -- /usr/local/bin/docker-entrypoint.sh eswrapper'",
    env: {
      RAILWAY_RUN_UID: "0",
      "discovery.type": "single-node",
      "xpack.security.enabled": "false",
      ES_JAVA_OPTS: "-Xms1g -Xmx1g",
    },
    volumeMounts: { "/usr/share/elasticsearch/data": elasticData },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Indexes from the tx queue only from the moment it starts: run dev/servone-fulltext-reindex.mjs once after the first deploy.
  const fulltext = service("fulltext", {
    source: image(`hardcoreeng/fulltext:${HULY}`),
    env: {
      PORT: "4702",
      SERVER_SECRET: sealed(SECRET),
      DB_URL: sealed(DB_URL),
      REGION: "cockroach",
      QUEUE_CONFIG: QUEUE,
      ACCOUNTS_URL: ACCOUNT_INT,
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
      HULYLAKE_URL: HULYLAKE_INT,
      COMMUNICATION_API_ENABLED: "true",
      FULLTEXT_DB_URL: "http://elastic.railway.internal:9200",
      ELASTIC_INDEX_NAME: "servone_index",
      // Must be defined; blank skips attachment text extraction (no rekoni).
      REKONI_URL: "",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Calendar Event reminders (used by chat "Remind me") and Studio date rules: transactor or process service
  // schedules on the queue, time-machine fires, events-processor or the process service acts.
  const timeMachine = service("time-machine", {
    source: image(`hardcoreeng/worker:${HULY}`),
    env: { DB_URL: sealed(DB_URL), QUEUE_CONFIG: QUEUE, QUEUE_REGION: "cockroach" },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });
  const eventsProcessor = service("events-processor", {
    source: image(`hardcoreeng/events-processor:${HULY}`),
    env: {
      SERVICE_ID: "events-processor",
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      QUEUE_CONFIG: QUEUE,
      QUEUE_REGION: "cockroach",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Runs Studio automations: the transactor queues card and todo events, this service moves each record through its rule.
  const processService = service("process", {
    source: image(`hardcoreeng/process:${HULY}`),
    env: {
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      // CreateCard copies a description through the collaborator.
      COLLABORATOR_URL: COLLABORATOR_INT,
      QUEUE_CONFIG: QUEUE,
      QUEUE_REGION: "cockroach",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Env both Servone services read at startup (services/servone/src/config.ts requires all of it in either role).
  const servoneEnv = {
    RAILWAY_DOCKERFILE_PATH: "dev/railway/service-image/Dockerfile",
    SERVONE_PACKAGE: "@servone/services",
    SERVONE_FOLDER: "services/servone",
    PORT: "4073",
    SECRET: sealed(SECRET),
    ACCOUNTS_URL: ACCOUNT_INT,
    CALENDAR_URL: CALENDAR_INT,
    HULYKVS_URL: KVS_INT,
    COLLABORATOR_URL: COLLABORATOR_INT,
    FRONT_URL,
    PUBLIC_URL: "https://${{servone-mcp.RAILWAY_PUBLIC_DOMAIN}}",
    NOTIFICATION_URL: NOTIFICATION_INT,
    MAIL_URL: MAIL_INT,
    BUG_REPORT_TO: "support@servone.app",
    RESEND_API_KEY: sealed(RESEND_KEY),
    QUEUE_CONFIG: QUEUE,
    QUEUE_REGION: "cockroach",
    STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
    SENTRY_DSN: preserve(),
    POSTHOG_KEY: preserve(),
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://eu.i.posthog.com/i",
    OTEL_EXPORTER_OTLP_HEADERS: preserve(),
    OTEL_LOGGER_ENABLED: "true",
    OTEL_TRACES_SAMPLER: "always_off",
    OTEL_ENVIRONMENT: "production",
  };

  // All Servone backend modules (services/servone): MCP + OAuth, webhooks, notify scheduler, push gate, dept channels.
  // Keeps the servone-mcp name and domain: connected MCP clients hold its URL as the OAuth issuer.
  // One replica: webhook rate limits and MCP sessions are in memory, and the scheduler polls every minute.
  const servone = service("servone-mcp", {
    source: github("Trox824/servone", { branch: "develop" }),
    env: {
      ...servoneEnv,
      // Tracker webhook secret keys (`k1:<base64 of 32 bytes>`), set with `railway variables`. Unset: tracker hooks are off.
      TRACKER_HOOKS_KEYS: preserve(),
      // /web-push is on the public domain, so the gate requires this bearer token; the transactor sends the same one.
      MAIL_AUTH_TOKEN: "${{secret(48)}}",
      // Studio assistant key, set with `railway variables`; declared so apply keeps it. Unset: the assistant says not configured.
      ANTHROPIC_API_KEY: preserve(),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS", healthcheckPath: "/health" },
  });

  // Hourly incremental backup of every workspace (documents + blobs) into R2. Does not cover the account DB
  // (CRDB Cloud daily managed backup) or hulylake-db (message groups).
  const backup = r2 ? [service("backup", {
    source: image(`hardcoreeng/backup:${HULY}`),
    env: {
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      ACCOUNTS_DB_URL: sealed(DB_URL),
      DB_URL: sealed(DB_URL),
      REGION: "cockroach",
      QUEUE_CONFIG: QUEUE,
      BUCKET_NAME: "backups",
      STORAGE: sealed(
        `s3|${r2.endpoint}?accessKey=${r2.accessKeyId}&secretKey=${r2.secretAccessKey}&region=auto&rootBucket=${r2.bucket}`
      ),
      WORKSPACE_STORAGE: `datalake|${DATALAKE_INT}`,
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  })] : [];

  // Stock image, so it writes the stock s0.7.437 model; must move to a fork build together with the transactor.
  // Without it new workspaces stay in "creating" forever.
  const workspace = service("workspace", {
    source: image(`hardcoreeng/workspace:${HULY}`),
    env: {
      // "all" = create + upgrade; the backup service above covers backups.
      WS_OPERATION: "all",
      REGION: "cockroach",
      SERVER_SECRET: sealed(SECRET),
      QUEUE_CONFIG: QUEUE,
      DB_URL: sealed(DB_URL),
      ACCOUNTS_DB_URL: sealed(DB_URL),
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
      ACCOUNTS_URL: ACCOUNT_INT,
      MAIL_URL: MAIL_INT,
      // Nonexistent on purpose: the stock image ships Huly's demo projects in ./init-scripts.
      INIT_REPO_DIR: "/servone-no-init",
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // Start command set by hand (`redis-server --bind * -::* --protected-mode no`): the private network is IPv6-only
  // and protected mode refuses non-loopback clients when there is no password. Database nodes cannot declare it.
  const redis = database("redis", "redis", { image: "redis:8.0.2-alpine3.21", region: REGION });
  // Public domain made by hand; the browser connects with a bearer token.
  const hulypulse = service("servone-pulse", {
    source: image(`hardcoreeng/hulypulse:${HULY}`),
    env: { HULY_REDIS_URLS: "redis://redis.railway.internal:6379", HULY_BIND_PORT: "8099", HULY_TOKEN_SECRET: sealed(SECRET) },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });
  // Video calls (Cuộc họp). Media runs on LiveKit Cloud project "Servone" (free Build plan); this only mints room tokens.
  // Public domain made by hand; the browser calls /getToken with a bearer token. LIVEKIT_API_SECRET is set by hand.
  const love = service("love", {
    source: image(`hardcoreeng/love:${HULY}`),
    env: {
      PORT: "8096",
      SECRET: sealed(SECRET),
      ACCOUNTS_URL: ACCOUNT_INT,
      STORAGE_CONFIG: `datalake|${DATALAKE_INT}`,
      STORAGE_PROVIDER_NAME: "datalake",
      LIVEKIT_HOST: LIVEKIT_HOST,
      LIVEKIT_API_KEY: LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET: preserve(),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  // The front refuses to start without GMAIL_URL, REKONI_URL and TELEGRAM_URL, though none of those apps run here.
  // Declared only so apply does not delete it; its variables are owned by `railway variables`, see dev/railway/front-image.
  const FRONT_VARS = ["ACCOUNTS_URL", "ACCOUNTS_URL_INTERNAL", "BRANDING_URL", "CALENDAR_URL", "COLLABORATOR_URL",
    "COMMUNICATION_API_ENABLED", "DATALAKE_URL", "GMAIL_URL", "REKONI_URL", "TELEGRAM_URL", "DISABLED_FEATURES", "EXCLUDED_APPLICATIONS_FOR_ANONYMOUS", "FILES_URL",
    "LAST_NAME_FIRST", "MODEL_VERSION", "PASSWORD_STRICTNESS", "RAILWAY_DOCKERFILE_PATH",
    "PORT", "SERVER_PORT", "SERVER_SECRET", "STORAGE_CONFIG", "UPLOAD_URL", "VERSION",
    // Set with `railway variables`: PUSH_PUBLIC_KEY = vapid.json publicKey; SERVONE_WEBHOOKS_URL and SERVONE_MCP_URL = the servone-mcp domain (build args).
    // POSTHOG_KEY = the PostHog EU project token (build arg, dev/prod/src/posthog.ts).
    // PULSE_URL = the public hulypulse domain.
    "PUSH_PUBLIC_KEY", "SERVONE_WEBHOOKS_URL", "SERVONE_MCP_URL", "POSTHOG_KEY", "PULSE_URL",
    // LOVE_ENDPOINT = the public love domain; LIVEKIT_WS = LIVEKIT_HOST with wss://.
    "LOVE_ENDPOINT", "LIVEKIT_WS",
    "SENTRY_DSN"];
  const front = service("front", {
    source: github("Trox824/servone", { branch: "develop" }),
    env: Object.fromEntries(FRONT_VARS.map((name) => [name, preserve()])),
    replicas: { [REGION]: 1 },
    deploy: { healthcheckPath: "/" },
  });

  const watch = service("servone-watch", {
    source: github("Trox824/servone", { branch: "develop", rootDirectory: "dev/servone-watch" }),
    build: { watchPatterns: ["/dev/servone-watch/**"] },
    env: {
      WATCH_RAILWAY_TOKEN: preserve(),
      RESEND_API_KEY: sealed(RESEND_KEY),
      ALERT_EMAIL: preserve(),
    },
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "ALWAYS" },
  });

  return project("giving-curiosity", {
    resources: [
      blobs,
      ...group("core", [front, account, transactor, collaborator, datalake, workspace, fulltext]),
      ...group("data", [redpandaData, redpanda, hulylakeDbData, hulylakeDb, elasticData, elastic, redis, hulylake, hulykvs]),
      ...group("workers", [processService, eventsProcessor, timeMachine, notification, mail]),
      ...group("features", [hulypulse, calendar, love]),
      ...group("ops", [...backup, watch]),
      ...group("servone", [servone]),
    ],
  });
});
