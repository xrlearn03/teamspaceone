FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/hrms-service db:generate
RUN pnpm --filter "@teamspace-one/hrms-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/hrms ./services/hrms
EXPOSE 3013
CMD ["sh", "-c", "node services/hrms/node_modules/prisma/build/index.js migrate deploy --schema services/hrms/prisma/schema.prisma && node services/hrms/dist/main"]
