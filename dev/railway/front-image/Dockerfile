# Built by Railway from the repo root on every push to develop (RAILWAY_DOCKERFILE_PATH on the front service).
FROM node:22-bookworm AS build
WORKDIR /repo
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=8192
# Railway's build context has no .git, and Rush refuses to use its build cache without one.
ENV RUSH_BUILD_CACHE_ENABLED=0
RUN node common/scripts/install-run-rush.js install
RUN node common/scripts/install-run-rush.js build --to @hcengineering/prod
# PostHog project key is public (it ships to every browser); empty turns PostHog off.
ARG POSTHOG_KEY=""
ARG POSTHOG_HOST="https://eu.i.posthog.com"
RUN cd dev/prod && POSTHOG_KEY=$POSTHOG_KEY POSTHOG_HOST=$POSTHOG_HOST node ../../common/scripts/install-run-rushx.js package
# No config.json: the front server generates it from the service env.
RUN mkdir /out && cp -R dev/prod/dist/. /out/ && cp -R dev/prod/public/. /out/ && rm -f /out/config.json
# Read by packages/servone-ui/.../webhooks/api.ts (webhooks and AI clients settings); empty turns that feature off.
ARG SERVONE_WEBHOOKS_URL=""
ARG SERVONE_MCP_URL=""
ARG SENTRY_DSN=""
ARG RAILWAY_GIT_COMMIT_SHA=""
ARG RAILWAY_ENVIRONMENT_NAME=""
RUN node -e 'const e = process.env; require("fs").writeFileSync("/out/servone-config.json", JSON.stringify({ SERVONE_WEBHOOKS_URL: e.SERVONE_WEBHOOKS_URL, SERVONE_MCP_URL: e.SERVONE_MCP_URL, SENTRY_DSN: e.SENTRY_DSN || undefined, SENTRY_RELEASE: e.RAILWAY_GIT_COMMIT_SHA || undefined, SENTRY_ENVIRONMENT: e.RAILWAY_ENVIRONMENT_NAME || undefined }))'

# Same tag as the Railway backend.
FROM hardcoreeng/front:s0.7.437
RUN rm -rf /app/dist \
  && grep -q '(h,{serveStatic:{cacheControl:!0,' /app/bundle.js \
  && sed -i 's/(h,{serveStatic:{cacheControl:!0,/(h,{enableBrotli:!0,orderPreference:["br"],serveStatic:{cacheControl:!0,/' /app/bundle.js
COPY --from=build /out/ /app/dist/
