-- CreateTable
CREATE TABLE "payroll_policies" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "employeePfRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "employerPfRate" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "pfMonthlyWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 15000,
    "employeeEsiRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0075,
    "employerEsiRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0325,
    "esiMonthlyGrossCeiling" DOUBLE PRECISION NOT NULL DEFAULT 21000,
    "standardDeductionAnnual" DOUBLE PRECISION NOT NULL DEFAULT 75000,
    "rebateTaxableIncomeLimit" DOUBLE PRECISION NOT NULL DEFAULT 1200000,
    "rebateMaximum" DOUBLE PRECISION NOT NULL DEFAULT 60000,
    "cessRate" DOUBLE PRECISION NOT NULL DEFAULT 0.04,
    "taxSlabs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_policies_organisationId_key" ON "payroll_policies"("organisationId");
