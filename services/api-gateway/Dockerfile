FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter "@teamspace-one/api-gateway..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/api-gateway ./services/api-gateway
EXPOSE 3000
CMD ["node", "services/api-gateway/dist/main"]
