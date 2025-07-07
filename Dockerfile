FROM node:20.18.0 AS bolt-ai-development

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app

RUN apt-get update && apt-get install -y curl wget git

RUN git config --global --add safe.directory /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm config set node-linker hoisted && \
    CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["pnpm", "run", "deploy", "--port", "3000", "--host", "0.0.0.0"]
