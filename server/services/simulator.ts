import { InsertSimulation } from "@shared/schema";

// ─── Healthcare risk labels ────────────────────────────────────────────────
export const HEALTHCARE_RISK_LABELS: Record<string, string> = {
  employer: 'Low — Retained employer coverage',
  cobra:    'Moderate — COBRA is time-limited to 18 months',
  aca:      'Moderate — ACA subsidy depends on post-quit income',
  partner:  'Low — Covered by partner plan',
  none:     'Severe — No coverage, all medical costs are out-of-pocket',
};

// ─── 2024 Federal Poverty Level (FPL) by household size ──────────────────
function calcFPL(householdSize: number): number {
  return 15060 + Math.max(0, householdSize - 1) * 5380;
}

// ─── Unsubsidized independent plan cost (household-size based) ────────────
export function estimateIndependentHealthcarePlan(adults: number, children: number): number {
  let base: number;
  if (adults === 2 && children >= 1) base = 1500 + (children * 300);
  else if (adults === 1 && children >= 1) base = 1200 + (children * 250);
  else if (adults === 2) base = 1100;
  else base = 600;
  return Math.min(base, 3000);
}

// ─── ACA income-aware subsidized premium ─────────────────────────────────
// Uses simplified ACA cap-rate logic based on FPL percentage.
// annualIncome = expectedRevenue * 12 (post-quit income estimate)
export function estimateACASubsidizedPremium(
  adults: number,
  children: number,
  annualIncome: number,
): number {
  const fullPremium = estimateIndependentHealthcarePlan(adults, children);
  const householdSize = adults + children;
  const fpl = calcFPL(householdSize);
  const fplPct = annualIncome > 0 ? annualIncome / fpl : 0;

  // Below 138% FPL → Medicaid eligible (effectively $0 premium for modeling)
  if (fplPct < 1.38) return 0;
  // Above 400% FPL → no subsidy, full unsubsidized premium
  if (fplPct >= 4.0) return fullPremium;

  // ACA caps the subscriber's premium as a % of annual income
  let capRate: number;
  if (fplPct < 1.5)  capRate = 0.02;
  else if (fplPct < 2.0)  capRate = 0.04;
  else if (fplPct < 2.5)  capRate = 0.06;
  else if (fplPct < 3.0)  capRate = 0.07;
  else capRate = 0.085;

  const monthlyCapped = (annualIncome * capRate) / 12;
  return Math.min(fullPremium, Math.max(0, monthlyCapped));
}

// ─── Business cost baselines by model type (monthly) ─────────────────────
export const BUSINESS_COST_BASELINES: Record<string, number> = {
  solo_bootstrap:   500,
  contractor_heavy: 2000,
  agency_service:   3000,
  inventory_heavy:  4500,
  saas_product:     2500,
};

const SE_TAX_RATE = 0.25; // fallback default

// ─── Main calculation engine ───────────────────────────────────────────────
export function calculateSimulation(data: InsertSimulation) {

  // 1. HEALTHCARE — income-aware ACA subsidy or flat estimate
  const estimatedHealthcarePlanCost = estimateIndependentHealthcarePlan(
    data.adultsOnPlan ?? 1,
    data.dependentChildren ?? 0,
  );

  let independentPlanCost: number;
  if (data.healthcareCostOverride != null && data.healthcareCostOverride > 0) {
    independentPlanCost = data.healthcareCostOverride;
  } else if (data.healthcareType === 'aca') {
    // Apply income-aware subsidy using expected post-quit revenue
    const annualPostQuitIncome = data.expectedRevenue * 12;
    independentPlanCost = estimateACASubsidizedPremium(
      data.adultsOnPlan ?? 1,
      data.dependentChildren ?? 0,
      annualPostQuitIncome,
    );
  } else {
    independentPlanCost = estimatedHealthcarePlanCost;
  }

  const isPartnerCovered = data.healthcareType === 'partner';
  const effectiveIndependentCost = isPartnerCovered ? 0 : independentPlanCost;
  const healthcareDelta = Math.max(0, effectiveIndependentCost - (data.currentPayrollHealthcare ?? 0));
  const healthcareMonthlyCost = healthcareDelta;
  const healthcareRisk = HEALTHCARE_RISK_LABELS[data.healthcareType] ?? 'Unknown';

  // 2. BUSINESS COST
  const businessCostBaseline = (data.businessCostOverride != null && data.businessCostOverride > 0)
    ? data.businessCostOverride
    : (BUSINESS_COST_BASELINES[data.businessModelType] ?? 1000);

  // 3. SE TAX RESERVE — use user-supplied rate or default to 25%
  const seRate = (data.taxReservePercent != null && data.taxReservePercent > 0)
    ? data.taxReservePercent / 100
    : SE_TAX_RATE;
  const selfEmploymentTax = Math.round(data.expectedRevenue * seRate);

  // 4. TRUE MONTHLY INDEPENDENCE BURN (TMIB)
  let tmib =
    data.livingExpenses +
    data.monthlyDebtPayments +
    healthcareDelta +
    selfEmploymentTax +
    businessCostBaseline;

  if (data.isDualIncome) tmib -= data.partnerIncome;
  tmib = Math.max(0, tmib);

  // 5. LIQUIDITY HAIRCUTS — Tier 1 / Tier 2 / Tier 3
  const tier1 = data.cash;                               // fully liquid
  const tier2 = Math.round(data.brokerage * 0.80);       // semi-liquid
  const tier3Roth = Math.round(data.roth * 1.00);        // retirement (contributions)
  const tier3Trad = Math.round(data.traditional * 0.50); // retirement (taxed + penalty)
  const tier3RE   = Math.round(data.realEstate * 0.30);  // illiquid

  const accessibleCapital = tier1 + tier2 + tier3Roth + tier3Trad + tier3RE;

  // 6. RUNWAY — four stress scenarios
  function calcRunway(revMultiplier: number, rampMonths: number): number {
    if (tmib <= 0) return 999;
    let capital = accessibleCapital;
    const stableRev = data.expectedRevenue * revMultiplier;

    for (let m = 1; m <= 240; m++) {
      const rampProgress = rampMonths > 0 ? Math.min(m / rampMonths, 1) : 1;
      const rampFactor = m <= rampMonths ? 0.50 * rampProgress : 1.0;
      const monthlyRev = stableRev * rampFactor;
      const volatilityHaircut = 1 - (data.volatilityPercent / 100);
      const effectiveRev = monthlyRev * volatilityHaircut;
      capital -= (tmib - effectiveRev);
      if (capital <= 0) return m;
    }
    return 999;
  }

  const baseRunway    = calcRunway(1.00, data.rampDuration);
  const runway15Down  = calcRunway(0.85, data.rampDuration);
  const runway30Down  = calcRunway(0.70, data.rampDuration);
  const runwayRampDelay = calcRunway(1.00, data.rampDuration + 3);

  const worstRunway = Math.min(baseRunway, runway15Down, runway30Down, runwayRampDelay);
  let breakpointMonth = worstRunway >= 999 ? 999 : worstRunway;
  let breakpointScenario = 'Base Case';
  if (runway30Down === worstRunway) breakpointScenario = 'Severe income contraction (−30%)';
  else if (runwayRampDelay === worstRunway) breakpointScenario = 'Ramp delay (+3 months)';
  else if (runway15Down === worstRunway) breakpointScenario = 'Moderate income contraction (−15%)';

  // 7. DEBT EXPOSURE RATIO (context only, does not affect burn)
  const debtExposureRatio = accessibleCapital > 0
    ? Math.min(data.totalDebt / accessibleCapital, 9.99)
    : 9.99;

  // 8. STRUCTURAL BREAKPOINT SCORE (0–100)
  let runwayPts = 0;
  if (baseRunway < 6)        runwayPts = Math.round((baseRunway / 6) * 10);
  else if (baseRunway < 12)  runwayPts = 10 + Math.round(((baseRunway - 6) / 6) * 15);
  else if (baseRunway < 24)  runwayPts = 25 + Math.round(((baseRunway - 12) / 12) * 10);
  else runwayPts = 35 + Math.min(5, Math.round((baseRunway - 24) / 12));
  runwayPts = Math.min(40, runwayPts);

  const rampScore = data.rampDuration <= 3 ? 0 : data.rampDuration <= 6 ? 0.5 : 1.0;
  const volScore = data.volatilityPercent >= 30 ? 0 : data.volatilityPercent >= 20 ? 0.4 : data.volatilityPercent >= 15 ? 0.7 : 1.0;
  const revPts = Math.round(25 * rampScore * volScore);

  let debtPts = 0;
  if (debtExposureRatio >= 0.70)      debtPts = 2;
  else if (debtExposureRatio >= 0.40) debtPts = 8;
  else if (debtExposureRatio >= 0.20) debtPts = 14;
  else debtPts = 20;

  const healthcarePtsMap: Record<string, number> = {
    partner: 10, employer: 8, aca: 6, cobra: 4, none: 0,
  };
  const healthcarePts = healthcarePtsMap[data.healthcareType] ?? 0;

  let bizPts = 5;
  if (data.expectedRevenue > 0) {
    const density = businessCostBaseline / data.expectedRevenue;
    if (density >= 0.50) bizPts = 1;
    else if (density >= 0.25) bizPts = 3;
    else bizPts = 5;
  }

  const structuralBreakpointScore = Math.min(100, runwayPts + revPts + debtPts + healthcarePts + bizPts);

  return {
    tmib,
    accessibleCapital,
    selfEmploymentTax,
    businessCostBaseline,
    estimatedHealthcarePlanCost,
    healthcareDelta,
    healthcareMonthlyCost,
    baseRunway,
    runway15Down,
    runway30Down,
    runwayRampDelay,
    structuralBreakpointScore,
    debtExposureRatio,
    healthcareRisk,
    breakpointMonth,
    breakpointScenario,
    debtFlagged: debtExposureRatio > 0.70,
    // Tier breakdown for PDF/report
    tier1Capital: tier1,
    tier2Capital: tier2,
    tier3Capital: tier3Roth + tier3Trad + tier3RE,
  };
}
