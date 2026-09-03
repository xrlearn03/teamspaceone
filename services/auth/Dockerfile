FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . /app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reactify/auth-service db:generate
RUN pnpm --filter "@reactify/auth-service..." build

FROM node:20-alpine AS runner
WORKDIR /app/services/auth
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/services/auth ./
EXPOSE 3002
CMD ["node", "dist/main"]
