CREATE TABLE "payroll_tax_documents" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "declaredAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_tax_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reimbursement_claims" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expenseDate" DATE NOT NULL,
    "receiptFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reimbursement_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_tax_documents_organisationId_idx" ON "payroll_tax_documents"("organisationId");
CREATE INDEX "payroll_tax_documents_employeeId_financialYear_idx" ON "payroll_tax_documents"("employeeId", "financialYear");
CREATE INDEX "payroll_tax_documents_status_idx" ON "payroll_tax_documents"("status");
CREATE INDEX "reimbursement_claims_organisationId_idx" ON "reimbursement_claims"("organisationId");
CREATE INDEX "reimbursement_claims_employeeId_createdAt_idx" ON "reimbursement_claims"("employeeId", "createdAt");
CREATE INDEX "reimbursement_claims_status_idx" ON "reimbursement_claims"("status");

ALTER TABLE "payroll_tax_documents" ADD CONSTRAINT "payroll_tax_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reimbursement_claims" ADD CONSTRAINT "reimbursement_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
