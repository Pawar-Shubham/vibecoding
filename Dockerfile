# Start from the same image
FROM node:20.18.0 AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile

COPY . .

# Build the production site
RUN pnpm run build

# -------------------------
# Now use a lightweight server
FROM nginx:alpine AS runner

# Copy build output to nginx HTML folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Remove default config and add custom (optional)
RUN rm /etc/nginx/conf.d/default.conf


EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]  
