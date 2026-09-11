NODE_ENV=production
LOG_LEVEL=info
GATEWAY_PORT=3000
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=postgres
REDIS_PASSWORD=${redis_password}
NATS_USER=teamspace
NATS_PASSWORD=${nats_password}
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=${s3_access_key}
S3_SECRET_KEY=${s3_secret_key}
S3_BUCKET=teamspace-one
S3_REGION=us-east-1
%{ if domain != "" }
S3_PUBLIC_BASE_URL=https://s3.${domain}/teamspace-one
%{ else }
S3_PUBLIC_BASE_URL=http://${external_ip}:9000/teamspace-one
%{ endif }
SFU_TOKEN_SECRET=${sfu_token_secret}
SFU_UDP_MUX_PORT=10000
SFU_NAT_1TO1_IPS=${external_ip}
SFU_TOKEN_TTL_SECONDS=14400
INTERNAL_API_KEY=${internal_api_key}
JWT_SECRET=${jwt_secret}
OPENAI_API_KEY=${openai_api_key}
AI_PROVIDER=openai
AI_BASE_URL=
AI_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_SERVICE_URL=http://ai-service:3012
FILE_STORAGE_SERVICE_URL=http://file-storage-service:3010
%{ if domain != "" }
APP_URL=https://${domain}
%{ else }
APP_URL=http://${external_ip}:3000
%{ endif }
WEB_DOMAIN=${domain}
%{ if domain != "" }
CORS_ORIGINS=tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173,https://${domain},https://app.${domain},https://api.${domain},https://realtime.${domain},https://sfu.${domain}
%{ else }
CORS_ORIGINS=tauri://localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173,http://${external_ip}:3000
%{ endif }
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=teamspace-one
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=2000
FILE_HLS_ENABLED=false
STORAGE_QUOTA_PER_USER_BYTES=2147483648
SMTP_HOST=${smtp_host}
SMTP_PORT=${smtp_port}
SMTP_SECURE=${smtp_secure}
SMTP_USER=${smtp_user}
SMTP_PASS=${smtp_pass}
SMTP_FROM=${smtp_from}
ORGANISATION_EMAIL_ENCRYPTION_KEY=${organisation_email_encryption_key}
