FROM node:20-alpine AS base
WORKDIR /repo
COPY package*.json ./
COPY apps/web/package*.json apps/web/
COPY packages/shared-types/package*.json packages/shared-types/

FROM base AS development
WORKDIR /repo
RUN npm install
COPY . .
WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
