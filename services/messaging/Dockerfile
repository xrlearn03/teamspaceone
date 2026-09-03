FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/messaging-service db:generate
RUN pnpm --filter "@reactify/messaging-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/messaging ./services/messaging
EXPOSE 3004
CMD ["node", "services/messaging/dist/main"]
