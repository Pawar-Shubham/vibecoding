# Stage 1: Build (named bolt-ai-development)
FROM node:20.18.0 AS bolt-ai-development

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

RUN apt-get update && apt-get install -y iputils-ping dnsutils curl wget git
RUN git config --global --add safe.directory /app

# Setup pnpm & install dependencies
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm config set node-linker hoisted && pnpm install --frozen-lockfile

# Run fixes for peer dependencies and ensure react-colorful is present
RUN npm install --legacy-peer-deps \
    && npm install react-colorful@5.6.1 --legacy-peer-deps

# Copy source and build
COPY . .
RUN pnpm run build

# Stage 2: Production runtime
FROM node:20.18.0-alpine AS bolt-ai-production
WORKDIR /app

# Install runtime pnpm
RUN npm install -g pnpm

# Copy build artifacts and production dependencies
COPY --from=bolt-ai-development /app/package.json ./
COPY --from=bolt-ai-development /app/pnpm-lock.yaml ./
RUN pnpm config set node-linker hoisted && pnpm install --prod --frozen-lockfile

# Copy only the build output (replace path if different)
COPY --from=bolt-ai-development /app/build ./build

EXPOSE 3000
ENV NODE_ENV=production

CMD ["pnpm", "run", "start", "--port", "3000", "--host", "0.0.0.0"]
