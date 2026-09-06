FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/organisation-service db:generate
RUN pnpm --filter "@teamspace-one/organisation-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/organisation ./services/organisation
EXPOSE 3003
CMD ["sh", "-c", "node services/organisation/node_modules/prisma/build/index.js migrate deploy --schema services/organisation/prisma/schema.prisma && node services/organisation/dist/main"]
