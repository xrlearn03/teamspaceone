FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/projects-service db:generate
RUN pnpm --filter "@reactify/projects-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/projects ./services/projects
EXPOSE 3006
CMD ["node", "services/projects/dist/main"]
