FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/auth-service db:generate
RUN pnpm --filter "@teamspace-one/auth-service..." build

FROM node:20 AS runner
WORKDIR /app/services/auth
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/services/auth ./
EXPOSE 3002
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node dist/main"]
