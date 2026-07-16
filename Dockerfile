# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@11

# Install dependencies first so this layer is cached across code changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Drop devDependencies (typescript, tsx, @types/*) from node_modules
RUN pnpm prune --prod

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
