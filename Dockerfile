# TripTape API — production image (Render today, ECS/EC2 later: same image).
# FFmpeg is installed here because tape uploads are transcoded on the server.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only, exactly as locked; no install scripts from deps.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY db ./db
# Run as the unprivileged "node" user; it may only write to the temp upload dir.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 5001
# tini forwards SIGTERM so the server shuts down cleanly on each deploy.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
