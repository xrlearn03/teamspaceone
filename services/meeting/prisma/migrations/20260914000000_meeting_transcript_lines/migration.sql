-- Live speech-to-text lines captured per participant during a call
CREATE TABLE "meeting_transcript_lines" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "speaker" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_transcript_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meeting_transcript_lines_meetingId_idx" ON "meeting_transcript_lines"("meetingId");
CREATE INDEX "meeting_transcript_lines_organisationId_idx" ON "meeting_transcript_lines"("organisationId");

ALTER TABLE "meeting_transcript_lines" ADD CONSTRAINT "meeting_transcript_lines_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
