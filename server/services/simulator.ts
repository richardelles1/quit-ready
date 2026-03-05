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

  // runwayPts (0–35): capital depth in months
  let runwayPts = 0;
  if (baseRunway < 6)        runwayPts = Math.round((baseRunway / 6) * 12);
  else if (baseRunway < 12)  runwayPts = 12 + Math.round(((baseRunway - 6) / 6) * 10);
  else if (baseRunway < 24)  runwayPts = 22 + Math.round(((baseRunway - 12) / 12) * 8);
  else runwayPts = 30 + Math.min(5, Math.round((baseRunway - 24) / 12));
  runwayPts = Math.min(35, runwayPts);

  // coveragePts (0–30): income-to-TMIB coverage ratio — primary structural signal
  const coverageRatio = tmib > 0 ? data.expectedRevenue / tmib : 1.0;
  let coveragePts = 0;
  if (coverageRatio >= 1.0)       coveragePts = 30;  // break-even or surplus
  else if (coverageRatio >= 0.85) coveragePts = 24;  // 85–99%
  else if (coverageRatio >= 0.70) coveragePts = 18;  // 70–84%
  else if (coverageRatio >= 0.50) coveragePts = 10;  // 50–69%
  else                            coveragePts = 0;   // <50%: critical gap

  // debtPts (0–15): debt-to-accessible-capital ratio
  let debtPts = 0;
  if (debtExposureRatio >= 0.70)      debtPts = 2;
  else if (debtExposureRatio >= 0.40) debtPts = 6;
  else if (debtExposureRatio >= 0.20) debtPts = 10;
  else                                debtPts = 15;

  // healthcarePts (0–10): continuity of coverage
  const healthcarePtsMap: Record<string, number> = {
    partner: 10, employer: 8, aca: 6, cobra: 4, none: 0,
  };
  const healthcarePts = healthcarePtsMap[data.healthcareType] ?? 0;

  // stabilityPts (0–10): shorter ramp + lower volatility = better (fixed: was previously inverted)
  const rampScore = data.rampDuration <= 3 ? 1.0
    : data.rampDuration <= 6 ? 0.6
    : data.rampDuration <= 9 ? 0.3
    : 0;
  const volScore = data.volatilityPercent < 15 ? 1.0
    : data.volatilityPercent < 20 ? 0.7
    : data.volatilityPercent < 30 ? 0.4
    : 0;
  const stabilityPts = Math.round(10 * rampScore * volScore);

  let structuralBreakpointScore = Math.min(100, runwayPts + coveragePts + debtPts + healthcarePts + stabilityPts);

  // Hard ceilings: structural signals that soft factors cannot override
  if (baseRunway < 3) structuralBreakpointScore = Math.min(structuralBreakpointScore, 35);
  if (coverageRatio < 0.50) structuralBreakpointScore = Math.min(structuralBreakpointScore, 45);

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
