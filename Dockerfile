# Build: installiert Abhängigkeiten (lädt per postinstall remotely-save) und baut dist/.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tools/eslint/package.json ./tools/eslint/
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY . .
# Die Plugins dürfen wegen ihrer Lizenz nicht ins Image, der Container lädt sie beim Start.
RUN pnpm build && rm -rf dist/bundled-plugins

# Laufzeit: nur Node, dist/ und der Server – keine node_modules nötig.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 PLUGIN_DIR=dist/bundled-plugins
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts/fetch-plugins.mjs ./scripts/
RUN mkdir dist/bundled-plugins && chown node dist/bundled-plugins
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Schlägt der Download fehl, startet die App trotzdem – nur ohne die mitgelieferten Plugins.
CMD ["sh", "-c", "node scripts/fetch-plugins.mjs || echo 'fetch-plugins fehlgeschlagen, starte ohne mitgelieferte Plugins' >&2; exec node server/prod.ts"]
