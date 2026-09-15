FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS base
WORKDIR /repo
COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY packages/shared-types/package*.json packages/shared-types/

FROM base AS development
WORKDIR /repo
RUN npm ci
COPY . .
WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
