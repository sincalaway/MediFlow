# MediFlow Web 版镜像（默认 PostgreSQL；构建参数 DB_PROVIDER=sqlite 可构建 SQLite 版）
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.34.9
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
RUN pnpm install --frozen-lockfile --filter @mediflow/server... --filter @mediflow/web...
COPY . .
ARG DB_PROVIDER=postgresql
RUN if [ "$DB_PROVIDER" = "postgresql" ]; then pnpm --filter @mediflow/server prisma:pg; else pnpm --filter @mediflow/server prisma:generate; fi
RUN pnpm --filter @mediflow/web build && pnpm --filter @mediflow/server build \
  && node apps/server/scripts/runtime-deps.mjs /out \
  && cp apps/server/dist/index.cjs /out/ && cp -r apps/web/dist /out/web

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    WEB_ROOT=/app/web \
    DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.cjs"]
