# syntax=docker/dockerfile:1

# Builds the widget and the server, then runs the compiled server with plain
# Node. Only the production dependencies end up in the final image.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/embed/package.json ./packages/embed/
RUN npm ci

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/embed/package.json ./packages/embed/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/apps ./apps
COPY --from=builder /app/packages ./packages
# The server runs as the unprivileged "node" user and has to write to the
# moderation queue, so the data directory belongs to it.
COPY --chown=node:node data ./data
COPY public ./public
COPY docs ./docs

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["npm", "start"]