FROM node:20 AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . /app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @reactify/service-template db:generate
RUN pnpm --filter @reactify/service-template build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/_template ./services/_template
EXPOSE 3001
CMD ["node", "services/_template/dist/main"]
