# Install and build on the build machine's own platform: the output is plain
# JavaScript and WebAssembly, so one build serves every architecture and the
# final stage only copies files.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
# pnpm comes from corepack, pinned by package.json's packageManager field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY services/og/package.json services/og/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY services/og/ .
COPY frontend/instance-config.json /app/chronicle-frontend/instance-config.json
COPY frontend/chronicle/public/c/images/loadingscreens /app/chronicle-frontend/chronicle/public/c/images/loadingscreens
ENV CHRONICLE_FRONTEND_DIR=/app/chronicle-frontend NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV CHRONICLE_FRONTEND_DIR=/app/chronicle-frontend NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/chronicle-frontend ./chronicle-frontend
USER node
EXPOSE 3000
CMD ["node", "server.js"]
