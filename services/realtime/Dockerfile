FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/realtime-service db:generate
RUN pnpm --filter "@reactify/realtime-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/realtime ./services/realtime
EXPOSE 3005
CMD ["node", "services/realtime/dist/main"]
