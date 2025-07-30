# -----------------------
# Stage 1: Base & Deps
# -----------------------
FROM node:20-slim AS base
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Only copy lockfile first for cache optimization
COPY pnpm-lock.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile

# Install production dependencies only
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# -----------------------
# Stage 2: Build
# -----------------------
FROM base AS build
WORKDIR /app

# Install dev dependencies and build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm run build

# -----------------------
# Stage 3: Final Runtime
# -----------------------
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=build /app/build /app/build
COPY --from=base /app/node_modules /app/node_modules
COPY package.json ./

EXPOSE 3000
CMD ["node", "./build/index.js"]
