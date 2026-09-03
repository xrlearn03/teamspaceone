FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . /app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reactify/auth-service db:generate
RUN pnpm --filter @reactify/auth-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/auth/dist ./dist
COPY --from=builder /app/services/auth/prisma ./prisma
COPY --from=builder /app/services/auth/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3002
CMD ["node", "dist/src/main"]
