FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/ai-service db:generate
RUN pnpm --filter "@teamspace-one/ai-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/ai ./services/ai
EXPOSE 3012
CMD ["sh", "-c", "node services/ai/node_modules/prisma/build/index.js migrate deploy --schema services/ai/prisma/schema.prisma && node services/ai/dist/main"]
