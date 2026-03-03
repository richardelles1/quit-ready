import { InsertSimulation } from "@shared/schema";

// Healthcare monthly cost estimates (US conservative averages)
export const HEALTHCARE_COSTS: Record<string, number> = {
  employer: 0,
  cobra: 850,
  aca: 600,
  partner: 0,
  none: 250, // conservative minimum estimate for out-of-pocket
};

export const HEALTHCARE_RISK_LABELS: Record<string, string> = {
  employer: 'Low — Retained employer coverage',
  cobra: 'Moderate — COBRA is time-limited (18 months)',
  aca: 'Moderate — ACA subsidy dependent on income level',
  partner: 'Low — Covered by partner plan',
  none: 'Severe — No coverage exposes all medical costs',
};

// Business cost baselines by model type (monthly)
export const BUSINESS_COST_BASELINES: Record<string, number> = {
  solo_bootstrap: 500,
  contractor_heavy: 2000,
  agency_service: 3000,
  inventory_heavy: 4500,
  saas_product: 2500,
};

// Self-employment tax rate (conservative, includes SE + federal estimate)
const SE_TAX_RATE = 0.28;

export function calculateSimulation(data: InsertSimulation) {
  // ─────────────────────────────────────────────
  // 1. HEALTHCARE & BUSINESS COST DERIVATIONS
  // ─────────────────────────────────────────────
  const healthcareMonthlyCost = HEALTHCARE_COSTS[data.healthcareType] ?? 600;
  const healthcareRisk = HEALTHCARE_RISK_LABELS[data.healthcareType] ?? 'Unknown';
  const businessCostBaseline = data.businessCostOverride != null && data.businessCostOverride > 0
    ? data.businessCostOverride
    : (BUSINESS_COST_BASELINES[data.businessModelType] ?? 1000);

  // Self-employment tax: applied to expected revenue (monthly estimate)
  const selfEmploymentTax = Math.round(data.expectedRevenue * SE_TAX_RATE);

  // ─────────────────────────────────────────────
  // 2. TRUE MONTHLY INDEPENDENCE BURN (TMIB)
  // ─────────────────────────────────────────────
  let tmib =
    data.livingExpenses +
    healthcareMonthlyCost +
    data.monthlyDebtPayments +
    selfEmploymentTax +
    businessCostBaseline;

  if (data.isDualIncome) {
    tmib -= data.partnerIncome;
  }

  tmib = Math.max(0, tmib);

  // ─────────────────────────────────────────────
  // 3. LIQUIDITY HAIRCUTS → ACCESSIBLE CAPITAL
  // ─────────────────────────────────────────────
  const accessibleCapital = Math.round(
    data.cash * 1.00 +
    data.brokerage * 0.80 +
    data.roth * 1.00 +
    data.traditional * 0.50 +
    data.realEstate * 0.30
  );

  // ─────────────────────────────────────────────
  // 4. RUNWAY CALCULATIONS (all four scenarios)
  // ─────────────────────────────────────────────

  // Helper: calculate runway in months given a revenue multiplier and ramp duration
  function calcRunway(revMultiplier: number, rampMonths: number): number {
    if (tmib <= 0) return 999;
    let capital = accessibleCapital;
    const stableRev = data.expectedRevenue * revMultiplier;

    for (let m = 1; m <= 240; m++) {
      // During ramp: revenue is 50% realized (per spec), linearly scaling up
      const rampProgress = rampMonths > 0 ? Math.min(m / rampMonths, 1) : 1;
      const rampFactor = m <= rampMonths ? 0.50 * rampProgress : 1.0;
      const monthlyRev = stableRev * rampFactor;

      // Apply volatility haircut to revenue
      const volatilityHaircut = 1 - (data.volatilityPercent / 100);
      const effectiveRev = monthlyRev * volatilityHaircut;

      const netMonthlyDrain = tmib - effectiveRev;
      capital -= netMonthlyDrain;

      if (capital <= 0) return m;
    }

    return 999; // Never runs out within 20 years
  }

  const baseRunway = calcRunway(1.0, data.rampDuration);
  const runway15Down = calcRunway(0.85, data.rampDuration);
  const runway30Down = calcRunway(0.70, data.rampDuration);
  const runwayRampDelay = calcRunway(1.0, data.rampDuration + 3);

  // Breakpoint = worst case scenario
  const worstRunway = Math.min(baseRunway, runway15Down, runway30Down, runwayRampDelay);

  let breakpointMonth = worstRunway;
  let breakpointScenario = 'Base Case';
  if (runway30Down === worstRunway) breakpointScenario = '-30% Revenue Shock';
  else if (runwayRampDelay === worstRunway) breakpointScenario = 'Ramp Delay (+3 months)';
  else if (runway15Down === worstRunway) breakpointScenario = '-15% Revenue Shock';

  // Cap display at 999 meaning "stable"
  if (breakpointMonth >= 999) breakpointMonth = 999;

  // ─────────────────────────────────────────────
  // 5. DEBT EXPOSURE RATIO
  // ─────────────────────────────────────────────
  const debtExposureRatio = accessibleCapital > 0
    ? Math.min(data.totalDebt / accessibleCapital, 9.99)
    : 9.99;

  const debtFlagged = debtExposureRatio > 0.70;

  // ─────────────────────────────────────────────
  // 6. STRUCTURAL BREAKPOINT SCORE (0–100)
  //    40% Runway | 25% Revenue | 20% Debt | 10% Healthcare | 5% Business Cost
  // ─────────────────────────────────────────────

  // 40pts: Runway strength (using base runway)
  let runwayPts = 0;
  if (baseRunway < 6) runwayPts = Math.round((baseRunway / 6) * 10);
  else if (baseRunway < 12) runwayPts = 10 + Math.round(((baseRunway - 6) / 6) * 15);
  else if (baseRunway < 24) runwayPts = 25 + Math.round(((baseRunway - 12) / 12) * 10);
  else runwayPts = 35 + Math.min(5, Math.round((baseRunway - 24) / 12));
  runwayPts = Math.min(40, runwayPts);

  // 25pts: Revenue fragility
  let revPts = 0;
  const rampScore = data.rampDuration <= 3 ? 0 : data.rampDuration <= 6 ? 0.5 : 1.0;
  const volScore = data.volatilityPercent >= 30 ? 0 : data.volatilityPercent >= 20 ? 0.4 : data.volatilityPercent >= 15 ? 0.7 : 1.0;
  revPts = Math.round(25 * rampScore * volScore);

  // 20pts: Debt exposure
  let debtPts = 0;
  if (debtExposureRatio >= 0.70) debtPts = Math.round(20 * 0.1);
  else if (debtExposureRatio >= 0.40) debtPts = Math.round(20 * 0.4);
  else if (debtExposureRatio >= 0.20) debtPts = Math.round(20 * 0.7);
  else debtPts = 20;

  // 10pts: Healthcare risk
  const healthcarePtsMap: Record<string, number> = {
    partner: 10, employer: 8, aca: 6, cobra: 4, none: 0,
  };
  const healthcarePts = healthcarePtsMap[data.healthcareType] ?? 0;

  // 5pts: Business cost density (ratio of business cost to expected revenue)
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
    debtFlagged,
  };
}

// Generate deterministic narrative for executive summary
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
