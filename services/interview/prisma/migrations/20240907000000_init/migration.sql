-- Interview service initial schema: outbox/inbox plumbing plus the
-- recruitment & interview domain (jobs, candidates, sessions, evaluations).

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "organisationId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT,
    "departmentName" TEXT,
    "hiringManagerId" TEXT,
    "recruiterId" TEXT,
    "description" TEXT,
    "requirements" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "resumeFileId" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateApplication" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobOpeningId" TEXT,
    "interviewType" TEXT NOT NULL DEFAULT 'video',
    "scheduledAt" TIMESTAMP(3),
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewParticipant" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'interviewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewEvaluation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "technicalScore" INTEGER,
    "communicationScore" INTEGER,
    "problemSolvingScore" INTEGER,
    "cultureFitScore" INTEGER,
    "overallScore" INTEGER,
    "recommendation" TEXT,
    "comments" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_eventId_key" ON "OutboxEvent"("eventId");
CREATE INDEX "OutboxEvent_publishedAt_idx" ON "OutboxEvent"("publishedAt");
CREATE INDEX "OutboxEvent_organisationId_idx" ON "OutboxEvent"("organisationId");

CREATE UNIQUE INDEX "InboxEvent_eventId_key" ON "InboxEvent"("eventId");
CREATE INDEX "InboxEvent_eventId_idx" ON "InboxEvent"("eventId");
CREATE INDEX "InboxEvent_organisationId_idx" ON "InboxEvent"("organisationId");

CREATE INDEX "JobOpening_organisationId_idx" ON "JobOpening"("organisationId");
CREATE INDEX "JobOpening_organisationId_status_idx" ON "JobOpening"("organisationId", "status");
CREATE INDEX "JobOpening_organisationId_recruiterId_idx" ON "JobOpening"("organisationId", "recruiterId");
CREATE INDEX "JobOpening_organisationId_hiringManagerId_idx" ON "JobOpening"("organisationId", "hiringManagerId");

CREATE UNIQUE INDEX "Candidate_organisationId_email_key" ON "Candidate"("organisationId", "email");
CREATE INDEX "Candidate_organisationId_idx" ON "Candidate"("organisationId");
CREATE INDEX "Candidate_organisationId_status_idx" ON "Candidate"("organisationId", "status");

CREATE UNIQUE INDEX "CandidateApplication_candidateId_jobOpeningId_key" ON "CandidateApplication"("candidateId", "jobOpeningId");
CREATE INDEX "CandidateApplication_organisationId_idx" ON "CandidateApplication"("organisationId");
CREATE INDEX "CandidateApplication_organisationId_stage_idx" ON "CandidateApplication"("organisationId", "stage");

CREATE INDEX "InterviewSession_organisationId_idx" ON "InterviewSession"("organisationId");
CREATE INDEX "InterviewSession_organisationId_scheduledAt_idx" ON "InterviewSession"("organisationId", "scheduledAt");
CREATE INDEX "InterviewSession_organisationId_status_idx" ON "InterviewSession"("organisationId", "status");

CREATE UNIQUE INDEX "InterviewParticipant_sessionId_userId_key" ON "InterviewParticipant"("sessionId", "userId");
CREATE INDEX "InterviewParticipant_organisationId_idx" ON "InterviewParticipant"("organisationId");
CREATE INDEX "InterviewParticipant_organisationId_userId_idx" ON "InterviewParticipant"("organisationId", "userId");

CREATE UNIQUE INDEX "InterviewEvaluation_sessionId_evaluatorId_key" ON "InterviewEvaluation"("sessionId", "evaluatorId");
CREATE INDEX "InterviewEvaluation_organisationId_idx" ON "InterviewEvaluation"("organisationId");
CREATE INDEX "InterviewEvaluation_organisationId_evaluatorId_status_idx" ON "InterviewEvaluation"("organisationId", "evaluatorId", "status");

ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateApplication" ADD CONSTRAINT "CandidateApplication_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterviewParticipant" ADD CONSTRAINT "InterviewParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewEvaluation" ADD CONSTRAINT "InterviewEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
