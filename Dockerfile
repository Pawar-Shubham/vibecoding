# Stage 1: Build (named bolt-ai-development)
FROM node:20.18.0 AS bolt-ai-development

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

RUN apt-get update && apt-get install -y iputils-ping dnsutils curl wget git
RUN git config --global --add safe.directory /app

# Setup pnpm & install dependencies
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile && \
    pnpm store prune

# Run fixes for peer dependencies and ensure react-colorful is present
RUN npm install --legacy-peer-deps \
    && npm install react-colorful@5.6.1 --legacy-peer-deps \
    && echo "Verifying @google/genai in development stage:" \
    && node -e "try { require('@google/genai'); console.log('@google/genai module found in dev stage'); } catch(e) { console.error('@google/genai module not found in dev stage:', e.message); }"

# Copy source and build
COPY . .
RUN pnpm run build

# Stage 2: Production runtime
FROM node:20.18.0-alpine AS bolt-ai-production
WORKDIR /app

# Install runtime pnpm
RUN npm install -g pnpm

# Copy build artifacts and dependencies
COPY --from=bolt-ai-development /app/package.json ./
COPY --from=bolt-ai-development /app/pnpm-lock.yaml ./
RUN pnpm config set node-linker hoisted && pnpm install --frozen-lockfile && \
    ls -la node_modules/@google/ && \
    echo "Verifying @google/genai installation..." && \
    node -e "try { require('@google/genai'); console.log('@google/genai module found'); } catch(e) { console.error('@google/genai module not found:', e.message); process.exit(1); }" && \
    echo "Node modules structure:" && ls -la node_modules/ | head -20

# Copy build output and necessary files
COPY --from=bolt-ai-development /app/build ./build
COPY --from=bolt-ai-development /app/app ./app
COPY --from=bolt-ai-development /app/public ./public
COPY --from=bolt-ai-development /app/load-context.ts ./
COPY --from=bolt-ai-development /app/vite.config.ts ./
COPY --from=bolt-ai-development /app/tsconfig.json ./

EXPOSE 3000
ENV NODE_ENV=production

CMD ["pnpm", "run", "start", "--port", "3000", "--host", "0.0.0.0"]
