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
FROM node:20.18.0 AS bolt-ai-production
WORKDIR /app

# Install runtime pnpm
RUN npm install -g pnpm

# Copy package files and reinstall dependencies
COPY --from=bolt-ai-development /app/package.json ./
COPY --from=bolt-ai-development /app/pnpm-lock.yaml ./

# Clear any existing node_modules and reinstall everything fresh
RUN rm -rf node_modules package-lock.json && \
    npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    pnpm install --frozen-lockfile && \
    npm install --legacy-peer-deps && \
    npm install react-colorful@5.6.1 --legacy-peer-deps && \
    npm install html2canvas@1.4.1 --legacy-peer-deps && \
    npm install framer-motion@10.16.4 --legacy-peer-deps

# Verify critical dependencies with more detailed output
RUN echo "=== DEPENDENCY VERIFICATION ===" && \
    echo "1. Checking node_modules contents..." && \
    ls -la node_modules/ | grep -E "(react-colorful|@google|html2canvas|framer-motion)" && \
    echo "" && \
    echo "2. Checking react-colorful specifically..." && \
    ls -la node_modules/react-colorful/ 2>/dev/null || echo "react-colorful not found in node_modules" && \
    echo "react-colorful package.json:" && \
    cat node_modules/react-colorful/package.json 2>/dev/null | head -10 || echo "react-colorful package.json not found" && \
    echo "" && \
    echo "3. Checking html2canvas specifically..." && \
    ls -la node_modules/html2canvas/ 2>/dev/null || echo "html2canvas not found in node_modules" && \
    echo "html2canvas package.json:" && \
    cat node_modules/html2canvas/package.json 2>/dev/null | head -10 || echo "html2canvas package.json not found" && \
    echo "" && \
    echo "4. Checking framer-motion specifically..." && \
    ls -la node_modules/framer-motion/ 2>/dev/null || echo "framer-motion not found in node_modules" && \
    echo "" && \
    echo "5. Verifying @google/genai installation..." && \
    node -e "try { require('@google/genai'); console.log('@google/genai module found'); } catch(e) { console.error('@google/genai module not found:', e.message); process.exit(1); }" && \
    echo "6. Verifying react-colorful installation..." && \
    node -e "try { require('react-colorful'); console.log('react-colorful module found'); } catch(e) { console.error('react-colorful module not found:', e.message); process.exit(1); }" && \
    echo "7. Verifying html2canvas installation..." && \
    node -e "try { require('html2canvas'); console.log('html2canvas module found'); } catch(e) { console.error('html2canvas module not found:', e.message); process.exit(1); }" && \
    echo "8. Verifying framer-motion installation..." && \
    node -e "try { require('framer-motion'); console.log('framer-motion module found'); } catch(e) { console.error('framer-motion module not found:', e.message); process.exit(1); }" && \
    echo "" && \
    echo "9. Node modules structure (first 30 entries):" && \
    ls -la node_modules/ | head -30 && \
    echo "" && \
    echo "10. Checking for any missing peer dependencies..." && \
    npm ls react-colorful html2canvas framer-motion @google/genai 2>&1 || echo "Some packages may have peer dependency warnings"

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
