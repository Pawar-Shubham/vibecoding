
FROM node:20.18.0 AS bolt-ai-development

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app


RUN git config --global --add safe.directory /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile

COPY . .

ENV RUNNING_IN_DOCKER=true \
    VITE_LOG_LEVEL=debug

EXPOSE 5173

CMD ["pnpm", "run", "deploy", "--host", "0.0.0.0"]
