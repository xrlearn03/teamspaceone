-- Enable pgvector for the AI database
CREATE EXTENSION IF NOT EXISTS vector;

-- AI knowledge store with pgvector embeddings
CREATE TABLE IF NOT EXISTS "ai_documents" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "title" TEXT,
  "text" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "vector" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_documents_organisation_resource" ON "ai_documents" ("organisationId", "resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "ai_documents_organisation_idx" ON "ai_documents" ("organisationId");
CREATE INDEX IF NOT EXISTS "ai_documents_workspace_idx" ON "ai_documents" ("workspaceId");
CREATE INDEX IF NOT EXISTS "ai_documents_resource_type_idx" ON "ai_documents" ("resourceType");

-- Workspace Q&A history
CREATE TABLE IF NOT EXISTS "ai_questions" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "actorId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "context" JSONB NOT NULL,
  "answer" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_questions_organisation_idx" ON "ai_questions" ("organisationId");
CREATE INDEX IF NOT EXISTS "ai_questions_workspace_idx" ON "ai_questions" ("workspaceId");

-- AI extracted tasks
CREATE TABLE IF NOT EXISTS "ai_extracted_tasks" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueDate" TIMESTAMP(3),
  "assigneeHint" TEXT,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_extracted_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_extracted_tasks_organisation_idx" ON "ai_extracted_tasks" ("organisationId");
CREATE INDEX IF NOT EXISTS "ai_extracted_tasks_source_idx" ON "ai_extracted_tasks" ("sourceType", "sourceId");

-- AI extracted decisions
CREATE TABLE IF NOT EXISTS "ai_decisions" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorId" TEXT,
  "decision" TEXT NOT NULL,
  "stakeholders" JSONB,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_decisions_organisation_idx" ON "ai_decisions" ("organisationId");

-- AI action confirmations
CREATE TABLE IF NOT EXISTS "ai_action_confirmations" (
  "id" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "actorId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "ai_action_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_action_confirmations_organisation_idx" ON "ai_action_confirmations" ("organisationId");
