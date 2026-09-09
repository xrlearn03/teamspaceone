CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_tokens_userId_platform_token_key" ON "device_tokens"("userId", "platform", "token");
CREATE INDEX "device_tokens_organisationId_idx" ON "device_tokens"("organisationId");
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");
