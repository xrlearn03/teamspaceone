FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/file-storage-service db:generate
RUN pnpm --filter "@teamspace-one/file-storage-service..." build

FROM node:20 AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/file-storage ./services/file-storage
EXPOSE 3010
CMD ["sh", "-c", "node services/file-storage/node_modules/prisma/build/index.js migrate deploy --schema services/file-storage/prisma/schema.prisma && node services/file-storage/dist/main"]
