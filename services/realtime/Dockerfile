FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/realtime-service db:generate
RUN pnpm --filter "@teamspace-one/realtime-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/realtime ./services/realtime
EXPOSE 3005
CMD ["sh", "-c", "node services/realtime/node_modules/prisma/build/index.js migrate deploy --schema services/realtime/prisma/schema.prisma && node services/realtime/dist/main"]
