FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/meeting-service db:generate
RUN pnpm --filter "@teamspace-one/meeting-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/meeting ./services/meeting
EXPOSE 3009
CMD ["node", "services/meeting/dist/main"]
