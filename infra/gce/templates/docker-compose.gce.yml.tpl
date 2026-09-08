# GCE production overlay for docker-compose.yml
# This file is written next to docker-compose.yml by the Terraform startup script.
services:
  api-gateway:
    extends:
      file: ./docker-compose.yml
      service: api-gateway
    environment:
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420}"

  realtime-service:
    extends:
      file: ./docker-compose.yml
      service: realtime-service
    environment:
      CORS_ORIGINS: "$${CORS_ORIGINS:-tauri://localhost,http://tauri.localhost,http://localhost:1420}"
