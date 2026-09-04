FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/search-service db:generate
RUN pnpm --filter "@teamspace-one/search-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/search ./services/search
EXPOSE 3011
CMD ["node", "services/search/dist/main"]
