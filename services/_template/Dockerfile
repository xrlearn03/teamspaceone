FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/service-template db:generate
RUN pnpm --filter "@teamspace-one/service-template..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/_template ./services/_template
EXPOSE 3001
CMD ["node", "services/_template/dist/main"]
