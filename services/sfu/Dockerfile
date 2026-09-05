# syntax=docker/dockerfile:1

# Build stage
FROM rust:1.98-bookworm AS builder

WORKDIR /usr/src/app

COPY services/sfu/Cargo.toml services/sfu/Cargo.lock ./
COPY services/sfu/src ./src

RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/src/app/target/release/teamspace-sfu /usr/local/bin/teamspace-sfu

EXPOSE 8443

CMD ["teamspace-sfu"]
