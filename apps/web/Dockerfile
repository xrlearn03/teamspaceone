FROM teamspace-one-base AS builder
WORKDIR /app
RUN pnpm --filter @teamspace-one/web build

FROM nginx:alpine
WORKDIR /usr/share/nginx/html
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV WEB_DOMAIN=teamspaceone.in
EXPOSE 80
