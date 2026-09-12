-- Guest participants joining via public meeting links
ALTER TABLE "meeting_participants" ADD COLUMN "guestName" TEXT;
ALTER TABLE "meeting_participants" ADD COLUMN "guestEmail" TEXT;
