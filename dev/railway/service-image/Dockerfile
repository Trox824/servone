# Built by Railway from the repo root for each Servone service (RAILWAY_DOCKERFILE_PATH on the service).
# SERVONE_PACKAGE / SERVONE_FOLDER come from the service's variables, which Railway passes as build args.
# The transactor sets SERVONE_BASE to the non-slim base (its bundle leaves native modules external) and
# MODEL_VERSION to the version its existing workspaces are at, and VERSION to the front's version.
ARG SERVONE_BASE=hardcoreeng/base-slim:v20250916
FROM node:22-bookworm AS build
ARG SERVONE_PACKAGE
ARG SERVONE_FOLDER
ARG MODEL_VERSION
ARG VERSION
WORKDIR /repo
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=8192
# Railway's build context has no .git, and Rush refuses to use its build cache without one.
ENV RUSH_BUILD_CACHE_ENABLED=0
RUN node common/scripts/install-run-rush.js install
RUN node common/scripts/install-run-rush.js build --to ${SERVONE_PACKAGE}
# Whole bundle folder: the transactor also needs its model.json next to bundle.js.
RUN cd ${SERVONE_FOLDER} && node ../../common/scripts/install-run-rushx.js bundle && cp -r bundle /bundle

FROM ${SERVONE_BASE}
WORKDIR /usr/src/app
COPY --from=build /bundle ./
COPY dev/railway/service-image/branding.json ./branding.json
CMD [ "node", "bundle.js" ]
