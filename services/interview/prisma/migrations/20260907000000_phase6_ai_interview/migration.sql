-- Phase 6: AI screening, AI interview orchestration, templates and hiring decisions.

-- Extend existing evaluations to distinguish AI-generated content and human review state.
ALTER TABLE "InterviewEvaluation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'human';
ALTER TABLE "InterviewEvaluation" ADD COLUMN "aiMetadata" JSONB;
ALTER TABLE "InterviewEvaluation" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "InterviewEvaluation" ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE TABLE "interview_templates" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobOpeningId" TEXT,
    "description" TEXT,
    "config" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "category" TEXT,
    "question" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "screening_results" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "matchScore" INTEGER,
    "skillsFound" JSONB,
    "missingRequirements" JSONB,
    "summary" TEXT,
    "confidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ai_generated',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "model" TEXT,
    "promptVersion" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_answers" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hiring_decisions" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT,
    "decidedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hiring_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "interview_questions_templateId_sortOrder_key" ON "interview_questions"("templateId", "sortOrder");
CREATE UNIQUE INDEX "screening_results_applicationId_key" ON "screening_results"("applicationId");
CREATE UNIQUE INDEX "hiring_decisions_applicationId_key" ON "hiring_decisions"("applicationId");

CREATE INDEX "interview_templates_organisationId_idx" ON "interview_templates"("organisationId");
CREATE INDEX "interview_templates_jobOpeningId_idx" ON "interview_templates"("jobOpeningId");
CREATE INDEX "interview_questions_organisationId_idx" ON "interview_questions"("organisationId");
CREATE INDEX "interview_questions_templateId_idx" ON "interview_questions"("templateId");
CREATE INDEX "interview_questions_templateId_sortOrder_idx" ON "interview_questions"("templateId", "sortOrder");
CREATE INDEX "screening_results_organisationId_idx" ON "screening_results"("organisationId");
CREATE INDEX "screening_results_organisationId_applicationId_idx" ON "screening_results"("organisationId", "applicationId");
CREATE INDEX "interview_answers_organisationId_idx" ON "interview_answers"("organisationId");
CREATE INDEX "interview_answers_sessionId_idx" ON "interview_answers"("sessionId");
CREATE INDEX "interview_answers_sessionId_sortOrder_idx" ON "interview_answers"("sessionId", "sortOrder");
CREATE INDEX "hiring_decisions_organisationId_idx" ON "hiring_decisions"("organisationId");
CREATE INDEX "hiring_decisions_applicationId_idx" ON "hiring_decisions"("applicationId");

ALTER TABLE "interview_templates" ADD CONSTRAINT "interview_templates_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interview_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hiring_decisions" ADD CONSTRAINT "hiring_decisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CandidateApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
