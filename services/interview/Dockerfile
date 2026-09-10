FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/interview-service db:generate
RUN pnpm --filter "@teamspace-one/interview-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/interview ./services/interview
EXPOSE 3014
CMD ["sh", "-c", "node services/interview/node_modules/prisma/build/index.js migrate deploy --schema services/interview/prisma/schema.prisma && node services/interview/dist/main"]
