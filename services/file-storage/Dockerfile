FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/file-storage-service db:generate
RUN pnpm --filter "@teamspace-one/file-storage-service..." build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/file-storage ./services/file-storage
EXPOSE 3010
CMD ["node", "services/file-storage/dist/main"]
