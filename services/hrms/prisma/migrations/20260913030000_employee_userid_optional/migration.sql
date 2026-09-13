-- Allow employees to exist without a linked workspace member account.
-- Postgres treats NULLs as distinct in unique indexes, so multiple
-- memberless employees per organisation remain allowed.
ALTER TABLE "employees" ALTER COLUMN "userId" DROP NOT NULL;
