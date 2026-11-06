FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0

RUN mkdir -p /workspace/hausverwaltung \
    && chown node:node /workspace /workspace/hausverwaltung
WORKDIR /workspace/hausverwaltung
USER node
