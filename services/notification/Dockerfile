FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/notification-service db:generate
RUN pnpm --filter "@reactify/notification-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/notification ./services/notification
EXPOSE 3008
CMD ["node", "services/notification/dist/main"]
