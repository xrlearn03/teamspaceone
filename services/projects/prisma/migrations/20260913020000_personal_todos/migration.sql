-- CreateTable
CREATE TABLE "personal_todos" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "personal_todos_organisationId_userId_idx" ON "personal_todos"("organisationId", "userId");
