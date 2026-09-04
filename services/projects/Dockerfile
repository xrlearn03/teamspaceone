FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/projects-service db:generate
RUN pnpm --filter "@teamspace-one/projects-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/projects ./services/projects
EXPOSE 3006
CMD ["sh", "-c", "node services/projects/node_modules/prisma/build/index.js migrate deploy --schema services/projects/prisma/schema.prisma && node services/projects/dist/main"]
