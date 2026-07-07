# Synthex API image.
#
# Based on the official Playwright image (tag pinned to the installed playwright
# version) so headless Chromium + all its system libraries are present — this is
# what makes the scrape_url JS-heavy fallback actually work in production, instead
# of degrading to Cheerio on a bare Node runtime.
#
# Multi-stage: both stages use the SAME base so any native module ABI built in the
# builder is guaranteed compatible in the runtime stage.

# ---------- builder ----------
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS builder
WORKDIR /app

# Browsers are already baked into the base image — never re-download them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install deps first (cached until a manifest changes). Copy every workspace's
# package.json so `npm ci` can resolve the workspace graph.
COPY package.json package-lock.json ./
COPY src/package.json ./src/
COPY web/package.json ./web/
COPY shared/package.json ./shared/
RUN npm ci

# Build shared (type-only, noEmit) then the API (tsc -> dist/src).
COPY tsconfig.json ./
COPY shared ./shared
COPY src ./src
RUN npm run build --workspace=shared && npm run build --workspace=src

# Drop dev dependencies so only the runtime graph is carried forward.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Prod node_modules + compiled output. schema.sql is carried along so it can be
# applied via a one-off shell if desired. Chowned to pwuser (the non-root user
# baked into the Playwright base image) so the container runs unprivileged.
COPY --from=builder --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=builder --chown=pwuser:pwuser /app/package.json ./package.json
COPY --from=builder --chown=pwuser:pwuser /app/dist ./dist
COPY --from=builder --chown=pwuser:pwuser /app/src/db ./src/db

# npm does not hoist every prod dep of the `src` workspace to the root
# node_modules — some (e.g. `redis` and its @redis/* + yallist deps) stay nested
# under src/node_modules. The compiled entrypoint lives at dist/src/**, so Node
# resolves bare imports from dist/src/node_modules upward. Place the workspace's
# nested tree there so those imports resolve at runtime (root node_modules alone
# is not enough — the container crashes with ERR_MODULE_NOT_FOUND 'redis').
COPY --from=builder --chown=pwuser:pwuser /app/src/node_modules ./dist/src/node_modules

# Render injects PORT; index.ts falls back to 3000 locally.
EXPOSE 3000

# Drop root. pwuser ships with the Playwright image and owns a home dir Chromium
# can write its profile/temp into.
USER pwuser

# Runs the Express API AND the in-process BullMQ worker.
CMD ["node", "dist/src/index.js"]
