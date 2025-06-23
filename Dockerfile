# Stage 1: Build optimized static files
FROM node:20.18.0 AS builder

WORKDIR /app

# Fix Git warning inside container
RUN git config --global --add safe.directory /app

# Copy dependency files and install
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile

# Copy the rest of the app
COPY . .

# Build the production site (creates /app/dist)
RUN pnpm run build

# Stage 2: Serve using lightweight NGINX server
FROM nginx:alpine AS runner

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Remove default NGINX config (if replacing)
RUN rm /etc/nginx/conf.d/default.conf || true

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
