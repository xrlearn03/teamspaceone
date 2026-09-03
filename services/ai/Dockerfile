FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/ai-service db:generate
RUN pnpm --filter "@reactify/ai-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/ai ./services/ai
EXPOSE 3012
CMD ["node", "services/ai/dist/main"]
