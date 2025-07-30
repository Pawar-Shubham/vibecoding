### Stage: Development / Build ###
FROM node:20.18.0 AS builder

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

RUN apt-get update && apt-get install -y iputils-ping dnsutils curl wget git
RUN git config --global --add safe.directory /app

# Install pnpm and dependencies using lockfile
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    pnpm install --frozen-lockfile

# Copy full project and build
COPY . .
RUN pnpm run build

### Stage: Runtime ###
FROM node:20.18.0-alpine AS runtime

WORKDIR /app

RUN npm install -g pnpm

# Copy only production dependencies (optional optimization)
COPY --from=builder /app/node_modules /app/node_modules

# Copy build outputs
COPY --from=builder /app/build /app/build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "run", "start", "--port", "3000", "--host", "0.0.0.0"]
