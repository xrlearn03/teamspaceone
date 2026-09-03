FROM reactify-base AS builder
WORKDIR /app
RUN pnpm --filter @reactify/organisation-service db:generate
RUN pnpm --filter "@reactify/organisation-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/organisation ./services/organisation
EXPOSE 3003
CMD ["node", "services/organisation/dist/main"]
