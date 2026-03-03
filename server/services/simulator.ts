import { InsertSimulation } from "@shared/schema";

export function calculateSimulationScores(data: InsertSimulation) {
  // ----------------------------------------
  // LIQUIDITY WEIGHTING
  // ----------------------------------------
  const weightedNetWorth = 
    (data.cash * 1.00) +
    (data.brokerage * 0.90) +
    (data.roth * 0.70) +
    (data.traditional * 0.60) +
    (data.realEstate * 0.40);

  // ----------------------------------------
  // TRUE MONTHLY INDEPENDENCE BURN
  // ----------------------------------------
  let trueMonthlyBurn = data.livingExpenses + data.healthcareCost + data.businessCosts + data.taxReserve;
  
  if (data.isDualIncome) {
    trueMonthlyBurn -= data.partnerIncome;
  }
  
  if (trueMonthlyBurn < 0) {
    trueMonthlyBurn = 0;
  }

  // ----------------------------------------
  // ADJUSTED RUNWAY (MONTHS)
  // ----------------------------------------
  // Prevent division by zero
  const adjustedRunway = trueMonthlyBurn > 0 ? weightedNetWorth / trueMonthlyBurn : 999;

  // ----------------------------------------
  // RUNWAY SCORING (Axis 1 - 35 pts)
  // ----------------------------------------
  let liquidityScore = 0;
  if (adjustedRunway < 3) liquidityScore = 5; // 0-10
  else if (adjustedRunway < 6) liquidityScore = 15; // 10-20
  else if (adjustedRunway < 9) liquidityScore = 24; // 20-28
  else if (adjustedRunway < 12) liquidityScore = 30; // 28-33
  else liquidityScore = 35; // 33-35

  // ----------------------------------------
  // REVENUE MODELING (Axis 2 - 25 pts)
  // ----------------------------------------
  let revenueScore = 15; // Base 15
  
  // Break-even Month
  let breakEvenMonth = 999;
  for (let m = 1; m <= 60; m++) {
    // simplified ramp assumption: linear
    const currentRev = data.rampDuration > 0 ? Math.min(data.expectedRevenue, (data.expectedRevenue / data.rampDuration) * m) : data.expectedRevenue;
    if (currentRev >= trueMonthlyBurn) {
      breakEvenMonth = m;
      break;
    }
  }

  if (breakEvenMonth < 3) revenueScore -= 5;
  if (data.rampDuration < 3 && adjustedRunway < 6) revenueScore -= 10;
  if (data.revenueType === 'recurring') revenueScore += 5;
  if (data.rampDuration >= 6) revenueScore += 5;
  if (data.volatilityPercent > 15 && adjustedRunway < 6) revenueScore -= 5;
  
  // clamp
  revenueScore = Math.max(0, Math.min(25, revenueScore));

  // ----------------------------------------
  // FIXED COST PRESSURE (Axis 3 - 15 pts)
  // ----------------------------------------
  let fixedCostScore = 15;
  const fixedCostRatio = weightedNetWorth > 0 ? trueMonthlyBurn / weightedNetWorth : 1;
  if (fixedCostRatio > 0.15) {
    fixedCostScore = 5;
  }

  // ----------------------------------------
  // HEALTHCARE EXPOSURE (Axis 4 - 10 pts)
  // ----------------------------------------
  let healthcareScore = 0;
  if (data.healthcareType === 'partner') healthcareScore = 10;
  else if (data.healthcareType === 'aca') healthcareScore = 7;
  else if (data.healthcareType === 'private') healthcareScore = 4;
  else if (data.healthcareType === 'none') healthcareScore = 0;

  // ----------------------------------------
  // SAFETY BUFFER MARGIN (Axis 5 - 10 pts)
  // ----------------------------------------
  let bufferScore = 0;
  const remainingRunway = adjustedRunway - breakEvenMonth;
  if (remainingRunway <= 0) bufferScore = 1;
  else if (remainingRunway <= 2) bufferScore = 5;
  else bufferScore = 10;

  // ----------------------------------------
  // TAX MODELING (Axis 6 - 5 pts)
  // ----------------------------------------
  let taxScore = 0;
  const estimatedGrossIncome = data.expectedRevenue; 
  // Very simplified tax logic since we don't have gross input directly
  const taxRatio = estimatedGrossIncome > 0 ? data.taxReserve / estimatedGrossIncome : 0;
  if (taxRatio >= 0.15 && taxRatio <= 0.30) {
    taxScore = 5;
  } else if (taxRatio < 0.10) {
    taxScore = 1;
  } else {
    taxScore = 3;
  }

  // ----------------------------------------
  // TOTAL SCORE
  // ----------------------------------------
  let readinessIndex = liquidityScore + revenueScore + fixedCostScore + healthcareScore + bufferScore + taxScore;

  // Override rules
  if (adjustedRunway >= 60) {
    readinessIndex = Math.max(readinessIndex, 85);
  }
  if (weightedNetWorth >= 100 * trueMonthlyBurn && trueMonthlyBurn > 0) {
    readinessIndex = Math.max(readinessIndex, 95);
  }

  // Clamp 0-100
  readinessIndex = Math.max(0, Math.min(100, readinessIndex));

  // ----------------------------------------
  // SECONDARY INDICATOR
  // ----------------------------------------
  let executionStability = "Moderate";
  if (data.revenueType === 'recurring' && data.rampDuration >= 6 && data.volatilityPercent <= 15) {
    executionStability = "Strong";
  } else if (data.rampDuration < 3 || data.volatilityPercent >= 20 || data.revenueType === 'one-time') {
    executionStability = "Fragile";
  }

  return {
    readinessIndex,
    liquidityScore,
    revenueScore,
    fixedCostScore,
    healthcareScore,
    bufferScore,
    taxScore,
    executionStability,
    weightedNetWorth,
    trueMonthlyBurn,
    adjustedRunway
  };
}
