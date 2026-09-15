export interface IndiaSalary {
  base?: number;
  hra?: number;
  specialAllowance?: number;
  otherAllowances?: number;
  currency?: string;
  pfEnabled?: boolean;
  esiEnabled?: boolean;
  professionalTax?: number;
  annualTaxableDeductions?: number;
}

export interface IndiaPayrollPolicy {
  employeePfRate: number;
  employerPfRate: number;
  pfMonthlyWageCeiling: number;
  employeeEsiRate: number;
  employerEsiRate: number;
  esiMonthlyGrossCeiling: number;
  standardDeductionAnnual: number;
  rebateTaxableIncomeLimit: number;
  rebateMaximum: number;
  cessRate: number;
  taxSlabs: Array<{ upTo: number | null; rate: number }>;
}

const money = (value: number) => Math.round(Math.max(value, 0) * 100) / 100;

export const INDIA_NEW_REGIME_SLABS: IndiaPayrollPolicy['taxSlabs'] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: null, rate: 0.3 },
];

export function calculateAnnualIncomeTax(taxableIncome: number, policy: IndiaPayrollPolicy): number {
  const income = Math.max(taxableIncome, 0);
  let tax = 0;
  let lower = 0;
  for (const slab of policy.taxSlabs) {
    const upper = slab.upTo ?? income;
    const taxable = Math.max(0, Math.min(income, upper) - lower);
    tax += taxable * slab.rate;
    lower = upper;
    if (income <= upper) break;
  }
  if (income <= policy.rebateTaxableIncomeLimit) tax = Math.max(0, tax - policy.rebateMaximum);
  return money(tax * (1 + policy.cessRate));
}

export function calculateIndiaPayslip(salary: IndiaSalary, policy: IndiaPayrollPolicy, payableRatio = 1) {
  const ratio = Math.max(0, Math.min(payableRatio, 1));
  const base = money((salary.base ?? 0) * ratio);
  const hra = money((salary.hra ?? 0) * ratio);
  const specialAllowance = money((salary.specialAllowance ?? 0) * ratio);
  const otherAllowances = money((salary.otherAllowances ?? 0) * ratio);
  const grossPay = money(base + hra + specialAllowance + otherAllowances);
  const employeePf = salary.pfEnabled === false ? 0 : money(Math.min(base, policy.pfMonthlyWageCeiling) * policy.employeePfRate);
  const employerPf = salary.pfEnabled === false ? 0 : money(Math.min(base, policy.pfMonthlyWageCeiling) * policy.employerPfRate);
  const esiEligible = salary.esiEnabled !== false && grossPay <= policy.esiMonthlyGrossCeiling;
  const employeeEsi = esiEligible ? money(grossPay * policy.employeeEsiRate) : 0;
  const employerEsi = esiEligible ? money(grossPay * policy.employerEsiRate) : 0;
  const professionalTax = money((salary.professionalTax ?? 0) * ratio);
  const annualTaxableIncome = Math.max(grossPay * 12 - policy.standardDeductionAnnual - (salary.annualTaxableDeductions ?? 0), 0);
  const tds = money(calculateAnnualIncomeTax(annualTaxableIncome, policy) / 12);
  const totalDeductions = money(employeePf + employeeEsi + professionalTax + tds);
  return {
    earnings: { base, hra, specialAllowance, otherAllowances },
    deductions: { employeePf, employeeEsi, professionalTax, tds },
    employerContributions: { employerPf, employerEsi },
    grossPay,
    netPay: money(grossPay - totalDeductions),
    annualTaxableIncome: money(annualTaxableIncome),
  };
}
