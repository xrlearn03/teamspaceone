-- Per-organisation SMTP credentials. The password is encrypted at the application layer.
-- Idempotent: safe to re-run after a partially applied attempt.
CREATE TABLE IF NOT EXISTS "organisation_email_providers" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "user" TEXT,
    "encrypted_pass" TEXT,
    "from" TEXT NOT NULL DEFAULT 'no-reply@teamspaceone.in',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_email_providers_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organisation_email_providers_organisationId_key'
    ) THEN
        ALTER TABLE "organisation_email_providers"
        ADD CONSTRAINT "organisation_email_providers_organisationId_key" UNIQUE ("organisationId");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organisation_email_providers_organisationId_fkey'
    ) THEN
        ALTER TABLE "organisation_email_providers"
        ADD CONSTRAINT "organisation_email_providers_organisationId_fkey"
        FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
