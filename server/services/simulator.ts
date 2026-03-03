import { InsertSimulation } from "@shared/schema";

// ─── Healthcare risk labels (for qualitative output) ──────────────────────
export const HEALTHCARE_RISK_LABELS: Record<string, string> = {
  employer: 'Low — Retained employer coverage',
  cobra: 'Moderate — COBRA is time-limited (18 months)',
  aca: 'Moderate — ACA subsidy dependent on income level',
  partner: 'Low — Covered by partner plan',
  none: 'Severe — No coverage exposes all medical costs',
};

// ─── Dependent-aware healthcare plan cost estimate ─────────────────────────
export function estimateIndependentHealthcarePlan(adults: number, children: number): number {
  let base: number;
  if (adults === 2 && children >= 1) base = 1500 + (children * 300);
  else if (adults === 1 && children >= 1) base = 1200 + (children * 250);
  else if (adults === 2) base = 1100;
  else base = 600;
  return Math.min(base, 3000);
}

// ─── Business cost baselines by model type (monthly) ─────────────────────
export const BUSINESS_COST_BASELINES: Record<string, number> = {
  solo_bootstrap: 500,
  contractor_heavy: 2000,
  agency_service: 3000,
  inventory_heavy: 4500,
  saas_product: 2500,
};

// Self-employment tax rate (conservative, SE + federal estimate)
const SE_TAX_RATE = 0.28;

export function calculateSimulation(data: InsertSimulation) {

  // ─────────────────────────────────────────────
  // 1. HEALTHCARE DELTA (dependent-aware)
  // ─────────────────────────────────────────────
  const estimatedHealthcarePlanCost = estimateIndependentHealthcarePlan(
    data.adultsOnPlan ?? 1,
    data.dependentChildren ?? 0,
  );

  // If user provided an override, use that; otherwise use auto-estimate
  const independentPlanCost = (data.healthcareCostOverride != null && data.healthcareCostOverride > 0)
    ? data.healthcareCostOverride
    : estimatedHealthcarePlanCost;

  // Partner coverage = no healthcare cost delta
  const isPartnerCovered = data.healthcareType === 'partner';
  const effectiveIndependentCost = isPartnerCovered ? 0 : independentPlanCost;

  const healthcareDelta = Math.max(0, effectiveIndependentCost - (data.currentPayrollHealthcare ?? 0));
  const healthcareRisk = HEALTHCARE_RISK_LABELS[data.healthcareType] ?? 'Unknown';

  // healthcareMonthlyCost = the cost we add to burn (the delta)
  const healthcareMonthlyCost = healthcareDelta;

  // ─────────────────────────────────────────────
  // 2. BUSINESS COST
  // ─────────────────────────────────────────────
  const businessCostBaseline = data.businessCostOverride != null && data.businessCostOverride > 0
    ? data.businessCostOverride
    : (BUSINESS_COST_BASELINES[data.businessModelType] ?? 1000);

  // ─────────────────────────────────────────────
  // 3. SE TAX RESERVE
  // ─────────────────────────────────────────────
  const selfEmploymentTax = Math.round(data.expectedRevenue * SE_TAX_RATE);

  // ─────────────────────────────────────────────
  // 4. TRUE MONTHLY INDEPENDENCE BURN (TMIB)
  //    Lifestyle + Debt + Healthcare Delta + SE Tax + Business - Partner
  // ─────────────────────────────────────────────
  let tmib =
    data.livingExpenses +
    data.monthlyDebtPayments +
    healthcareDelta +
    selfEmploymentTax +
    businessCostBaseline;

  if (data.isDualIncome) {
    tmib -= data.partnerIncome;
  }

  tmib = Math.max(0, tmib);

  // ─────────────────────────────────────────────
  // 5. LIQUIDITY HAIRCUTS → ACCESSIBLE CAPITAL
  // ─────────────────────────────────────────────
  const accessibleCapital = Math.round(
    data.cash * 1.00 +
    data.brokerage * 0.80 +
    data.roth * 1.00 +
    data.traditional * 0.50 +
    data.realEstate * 0.30
  );

  // ─────────────────────────────────────────────
  // 6. RUNWAY CALCULATIONS (four stress scenarios)
  //    Revenue stress only — burn remains static
  // ─────────────────────────────────────────────
  function calcRunway(revMultiplier: number, rampMonths: number): number {
    if (tmib <= 0) return 999;
    let capital = accessibleCapital;
    const stableRev = data.expectedRevenue * revMultiplier;

    for (let m = 1; m <= 240; m++) {
      const rampProgress = rampMonths > 0 ? Math.min(m / rampMonths, 1) : 1;
      const rampFactor = m <= rampMonths ? 0.50 * rampProgress : 1.0;
      const monthlyRev = stableRev * rampFactor;

      // Volatility haircut on revenue side only — burn is never adjusted
      const volatilityHaircut = 1 - (data.volatilityPercent / 100);
      const effectiveRev = monthlyRev * volatilityHaircut;

      const netMonthlyDrain = tmib - effectiveRev;
      capital -= netMonthlyDrain;

      if (capital <= 0) return m;
    }
    return 999;
  }

  const baseRunway = calcRunway(1.0, data.rampDuration);
  const runway15Down = calcRunway(0.85, data.rampDuration);
  const runway30Down = calcRunway(0.70, data.rampDuration);
  const runwayRampDelay = calcRunway(1.0, data.rampDuration + 3);

  // Breakpoint = worst case across all scenarios
  const worstRunway = Math.min(baseRunway, runway15Down, runway30Down, runwayRampDelay);
  let breakpointMonth = worstRunway;
  let breakpointScenario = 'Base Case';
  if (runway30Down === worstRunway) breakpointScenario = '-30% Revenue Shock';
  else if (runwayRampDelay === worstRunway) breakpointScenario = 'Ramp Delay (+3 months)';
  else if (runway15Down === worstRunway) breakpointScenario = '-15% Revenue Shock';
  if (breakpointMonth >= 999) breakpointMonth = 999;

  // ─────────────────────────────────────────────
  // 7. DEBT EXPOSURE RATIO (totalDebt for risk context only, does not affect burn)
  // ─────────────────────────────────────────────
  const debtExposureRatio = accessibleCapital > 0
    ? Math.min(data.totalDebt / accessibleCapital, 9.99)
    : 9.99;

  // ─────────────────────────────────────────────
  // 8. STRUCTURAL BREAKPOINT SCORE (0–100)
  //    40% Runway | 25% Revenue | 20% Debt | 10% Healthcare | 5% Business Cost
  // ─────────────────────────────────────────────
  let runwayPts = 0;
  if (baseRunway < 6) runwayPts = Math.round((baseRunway / 6) * 10);
  else if (baseRunway < 12) runwayPts = 10 + Math.round(((baseRunway - 6) / 6) * 15);
  else if (baseRunway < 24) runwayPts = 25 + Math.round(((baseRunway - 12) / 12) * 10);
  else runwayPts = 35 + Math.min(5, Math.round((baseRunway - 24) / 12));
  runwayPts = Math.min(40, runwayPts);

  const rampScore = data.rampDuration <= 3 ? 0 : data.rampDuration <= 6 ? 0.5 : 1.0;
  const volScore = data.volatilityPercent >= 30 ? 0 : data.volatilityPercent >= 20 ? 0.4 : data.volatilityPercent >= 15 ? 0.7 : 1.0;
  const revPts = Math.round(25 * rampScore * volScore);

  let debtPts = 0;
  if (debtExposureRatio >= 0.70) debtPts = Math.round(20 * 0.1);
  else if (debtExposureRatio >= 0.40) debtPts = Math.round(20 * 0.4);
  else if (debtExposureRatio >= 0.20) debtPts = Math.round(20 * 0.7);
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
  };
}

// ─── Deterministic narrative ──────────────────────────────────────────────
export function generateNarrative(sim: {
  breakpointMonth: number;
  breakpointScenario: string;
  baseRunway: number;
  runway30Down: number;
  tmib: number;
  accessibleCapital: number;
  debtExposureRatio: number;
  structuralBreakpointScore: number;
}): string {
  const { breakpointMonth, breakpointScenario, baseRunway, runway30Down, tmib, accessibleCapital, debtExposureRatio } = sim;

  if (breakpointMonth >= 999) {
    return `Based on your selected assumptions, your capital position sustains the transition through all modeled stress scenarios. Liquidity is structurally sufficient. Continued monitoring of revenue realization and debt obligations is advisable.`;
  }

  let failureCause = 'capital depletion';
  if (debtExposureRatio > 0.70) {
    failureCause = 'debt stress compounded by capital depletion';
  } else if (tmib > accessibleCapital * 0.12) {
    failureCause = 'burn rate exceeding accessible capital reserves';
  }

  return `Based on your selected assumptions, your plan reaches a structural breakpoint in Month ${breakpointMonth} under the ${breakpointScenario} scenario. The primary failure mechanism is ${failureCause}. Base-case runway extends to Month ${baseRunway >= 999 ? '24+' : baseRunway}. Under a -30% revenue reduction, runway compresses to Month ${runway30Down >= 999 ? '24+' : runway30Down}.`;
}
