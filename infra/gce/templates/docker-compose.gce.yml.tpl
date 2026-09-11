# GCE production overlay for docker-compose.yml
# This file is written next to docker-compose.yml by the Terraform startup script.
services:
  api-gateway:
    extends:
      file: ./docker-compose.yml
      service: api-gateway
    environment:
%{ if domain != "" }
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:3002,http://localhost:5173,https://${domain},https://webapp.${domain},https://app.${domain},https://api.${domain},https://realtime.${domain},https://sfu.${domain}}"
%{ else }
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173,http://${external_ip}:3000}"
%{ endif }
%{ if domain != "" }
    ports: !override []
%{ endif }

  realtime-service:
    extends:
      file: ./docker-compose.yml
      service: realtime-service
    environment:
%{ if domain != "" }
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:3002,http://localhost:5173,https://${domain},https://webapp.${domain},https://app.${domain},https://api.${domain},https://realtime.${domain},https://sfu.${domain}}"
%{ else }
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173,http://${external_ip}:3000}"
%{ endif }
%{ if domain != "" }
    ports: !override []
%{ endif }

  web:
    extends:
      file: ./docker-compose.yml
      service: web
    environment:
      WEB_DOMAIN: ${domain != "" ? domain : external_ip}
    volumes:
      - /data/downloads:/usr/share/nginx/html/downloads
%{ if domain != "" }
    ports: !override []
%{ endif }

  desktop-next:
    extends:
      file: ./docker-compose.yml
      service: desktop-next
    build:
      args:
        NEXT_PUBLIC_GATEWAY_URL: ${domain != "" ? "https://app.${domain}" : "http://${external_ip}:3000"}
        NEXT_PUBLIC_REALTIME_URL: ${domain != "" ? "wss://realtime.${domain}" : "ws://${external_ip}:3005"}
        NEXT_PUBLIC_SFU_URL: ${domain != "" ? "wss://sfu.${domain}" : "ws://${external_ip}:8443"}
        NEXT_PUBLIC_ICE_SERVERS:
%{ if domain != "" }
    ports: !override []
%{ endif }

%{ if domain != "" }
  sfu:
    extends:
      file: ./docker-compose.yml
      service: sfu
    ports: !override
      - '10000:10000/udp'

  minio:
    extends:
      file: ./docker-compose.yml
      service: minio
    ports: !override []

  caddy:
    image: caddy:2
    container_name: teamspace-one-caddy
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - default

volumes:
  caddy-data:
  caddy-config:
%{ endif }
