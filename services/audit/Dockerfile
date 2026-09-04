FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/audit-service db:generate
RUN pnpm --filter "@teamspace-one/audit-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/audit ./services/audit
EXPOSE 3007
CMD ["node", "services/audit/dist/main"]
