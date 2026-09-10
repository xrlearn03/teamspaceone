ALTER TABLE "invitations" ADD COLUMN "userId" TEXT;
CREATE INDEX "invitations_userId_idx" ON "invitations"("userId");
