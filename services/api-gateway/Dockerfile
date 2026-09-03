FROM node:20 AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . /app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reactify/api-gateway build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/api-gateway ./services/api-gateway
EXPOSE 3000
CMD ["node", "services/api-gateway/dist/src/main"]
