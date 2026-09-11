FROM teamspace-one-base AS builder
WORKDIR /app

ARG NEXT_PUBLIC_GATEWAY_URL=https://app.teamspaceone.in
ARG NEXT_PUBLIC_REALTIME_URL=wss://realtime.teamspaceone.in
ARG NEXT_PUBLIC_SFU_URL=wss://sfu.teamspaceone.in
ARG NEXT_PUBLIC_ICE_SERVERS

ENV NEXT_PUBLIC_GATEWAY_URL=${NEXT_PUBLIC_GATEWAY_URL}
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}
ENV NEXT_PUBLIC_SFU_URL=${NEXT_PUBLIC_SFU_URL}
ENV NEXT_PUBLIC_ICE_SERVERS=${NEXT_PUBLIC_ICE_SERVERS}

RUN pnpm --filter @teamspace-one/desktop-next build

FROM node:20-alpine AS runner
WORKDIR /app/apps/desktop-next
ENV NODE_ENV=production
ENV PORT=3002

COPY --from=builder /app/apps/desktop-next/.next/standalone/apps/desktop-next ./
COPY --from=builder /app/apps/desktop-next/.next/static ./.next/static
COPY --from=builder /app/apps/desktop-next/public ./public

EXPOSE 3002
CMD ["node", "server.js"]
