# Builds from the monorepo root (see docker-compose.yml's context: .) so npm ci
# can see the workspace-wide package-lock.json - apps/api alone has no lockfile
# of its own, since this is an npm workspaces monorepo with a single root one.

# ---- Base ----
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS base
# Prisma's runtime shells out to `openssl` to detect which engine binary to
# load; this Alpine base has no openssl CLI at all (not just an old one), so
# without it Prisma silently guesses wrong and fails at startup, not at build
# time. See binaryTargets in prisma/schema.prisma for the matching half of
# this fix.
RUN apk add --no-cache openssl
WORKDIR /repo
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/shared-types/package*.json packages/shared-types/
COPY apps/api/prisma apps/api/prisma

# ---- Development ----
FROM base AS development
# --ignore-scripts blocks arbitrary install/postinstall scripts from any of
# the ~800 transitive deps; bcrypt is the one package that legitimately
# needs its own (fetches/builds its native binding), so rebuild just that
# one explicitly instead of trusting every package's install script.
RUN npm ci --ignore-scripts
RUN npm rebuild bcrypt
RUN npm run prisma:generate
COPY . .
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---- Build ----
FROM base AS build
RUN npm ci --ignore-scripts
RUN npm rebuild bcrypt
COPY . .
RUN npm run prisma:generate
RUN npm run build -w apps/api

# ---- Production ----
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS production
RUN apk add --no-cache openssl
WORKDIR /repo
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package*.json apps/api/
COPY packages/shared-types/package*.json packages/shared-types/
COPY apps/api/prisma apps/api/prisma
# prisma generate needs the (dev-only) prisma CLI; prune it out afterwards so
# the final image only keeps the generated @prisma/client output plus
# whatever production dependencies actually need to run.
RUN npm ci --ignore-scripts
RUN npm rebuild bcrypt
RUN npm run prisma:generate
RUN npm prune --omit=dev
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# node:alpine's built-in non-root "node" user - avoids running the actual
# server process as root. chown after all root-owned COPY/RUN steps above,
# then drop privileges for good right before the app starts.
RUN chown -R node:node /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
# nest-cli.json's sourceRoot ("src") means tsc preserves that prefix in
# outDir - the real entry point is dist/src/main.js, not dist/main.js.
CMD ["node", "dist/src/main"]
