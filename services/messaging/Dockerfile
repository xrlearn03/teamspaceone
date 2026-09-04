FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/messaging-service db:generate
RUN pnpm --filter "@teamspace-one/messaging-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/messaging ./services/messaging
EXPOSE 3004
CMD ["sh", "-c", "node services/messaging/node_modules/prisma/build/index.js migrate deploy --schema services/messaging/prisma/schema.prisma && node services/messaging/dist/main"]
