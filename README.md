# Enterprise Collaboration Platform — Monorepo (Phase 4 Capstone)

Turborepo + npm workspaces monorepo containing the backend (NestJS/Prisma),
frontend (React/Vite), and a shared types package used by both.

```
ecp-platform/
  apps/
    api/                 # NestJS backend - see apps/api/README.md
    web/                 # React + Vite frontend
  packages/
    shared-types/         # TypeScript contracts shared between api and web
  turbo.json
  package.json            # npm workspaces root
```

`apps/api` implements the full core feature set: Auth (incl. password reset),
Organizations, Workspaces, Projects, Tasks, Comments, Attachments,
Notifications (WebSocket + email), Audit Logs, Redis caching, and BullMQ
background jobs — see `apps/api/README.md` for the full API surface and
`apps/api/docs/ARCHITECTURE.md` for the design. `apps/web` is a working thin
client against it (login/register/dashboard) meant to support the project
walkthrough demo. Remaining gaps (documentation polish, e2e coverage, bonus
features) are tracked in `apps/api/docs/PROJECT_PLAN.md`.

## Why a monorepo (Turborepo)

- **Shared types**: `packages/shared-types` is the single source of truth for
  request/response shapes. The frontend can never drift from a DTO field name
  or an enum value the backend actually uses.
- **Single install, single command**: `npm install` once at the root sets up
  both apps; `turbo run dev` starts them together with correct dependency
  ordering (shared-types is available before web or api need it).
- **Cached, parallelized tasks**: `turbo run build|lint|test` only re-runs
  what actually changed, and runs independent apps in parallel.

## Getting started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### 1. Install everything (root only — do not `npm install` inside apps/*)
```bash
npm install
```

### 2. Environment
```bash
cp apps/api/.env.example apps/api/.env
# fill in JWT_ACCESS_SECRET / JWT_REFRESH_SECRET with long random values
cp apps/web/.env.example apps/web/.env
```

### 3. Start infrastructure (Postgres + Redis)
```bash
docker compose up -d postgres redis
```

### 4. Database
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed   # optional demo data
```

### 5. Run both apps together
```bash
npm run dev
```
- API: `http://localhost:3000/api/v1` (Swagger: `http://localhost:3000/docs`)
- Web: `http://localhost:5173`

Or run just one:
```bash
npm run dev:api
npm run dev:web
```

Or run the entire stack (infra + both apps) in Docker:
```bash
docker compose up --build
```

### Tests / lint (across every workspace)
```bash
npm run lint
npm run test
npm run test:cov
npm run test:e2e   # apps/api only; requires DB reachable
```

## Adding a new shared type

Edit `packages/shared-types/src/index.ts`, export the new interface/enum, then
import it from either app as `@ecp/shared-types` — no build step required
in dev (Vite and ts-node both resolve it as TS source via the workspace link).

## Git workflow

Same branching model as before (`main` / `develop` / `feature/*` /
`bugfix/*`), just scope each branch name to the app it touches, e.g.
`feature/web-login-page`, `feature/api-projects-module`,
`feature/shared-types-workspace-contracts`. Full details in
`apps/api/docs/GIT_WORKFLOW.md` (applies repo-wide, not just to the API).
