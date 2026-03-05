import { pgTable, serial, integer, text, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),

  // Stability & Lifestyle
  currentSalary: integer("current_salary").notNull().default(0),
  livingExpenses: integer("living_expenses").notNull(),
  totalDebt: integer("total_debt").notNull().default(0),
  monthlyDebtPayments: integer("monthly_debt_payments").notNull().default(0),
  isDualIncome: boolean("is_dual_income").notNull().default(false),
  partnerIncome: integer("partner_income").notNull().default(0),

  // Healthcare inputs — dependent-aware model
  healthcareType: text("healthcare_type").notNull().default('aca'),
  adultsOnPlan: integer("adults_on_plan").notNull().default(1),
  dependentChildren: integer("dependent_children").notNull().default(0),
  currentPayrollHealthcare: integer("current_payroll_healthcare").notNull().default(0),
  healthcareCostOverride: integer("healthcare_cost_override"),

  // Liquidity Position
  cash: integer("cash").notNull().default(0),
  brokerage: integer("brokerage").notNull().default(0),
  roth: integer("roth").notNull().default(0),
  traditional: integer("traditional").notNull().default(0),
  realEstate: integer("real_estate").notNull().default(0),

  // Business Transition Model
  businessModelType: text("business_model_type").notNull().default('solo_bootstrap'),
  businessCostOverride: integer("business_cost_override"),
  expectedRevenue: integer("expected_revenue").notNull(),
  volatilityPercent: integer("volatility_percent").notNull().default(15),
  rampDuration: integer("ramp_duration").notNull().default(0),
  breakevenMonths: integer("breakeven_months").notNull().default(0),
  taxReservePercent: integer("tax_reserve_percent").notNull().default(25),

  // Computed Results
  tmib: integer("tmib").notNull().default(0),
  accessibleCapital: integer("accessible_capital").notNull().default(0),
  selfEmploymentTax: integer("self_employment_tax").notNull().default(0),
  businessCostBaseline: integer("business_cost_baseline").notNull().default(0),
  estimatedHealthcarePlanCost: integer("estimated_healthcare_plan_cost").notNull().default(0),
  healthcareDelta: integer("healthcare_delta").notNull().default(0),
  healthcareMonthlyCost: integer("healthcare_monthly_cost").notNull().default(0),
  baseRunway: integer("base_runway").notNull().default(0),
  runway15Down: integer("runway_15_down").notNull().default(0),
  runway30Down: integer("runway_30_down").notNull().default(0),
  runwayRampDelay: integer("runway_ramp_delay").notNull().default(0),
  structuralBreakpointScore: integer("structural_breakpoint_score").notNull().default(0),
  debtExposureRatio: real("debt_exposure_ratio").notNull().default(0),
  healthcareRisk: text("healthcare_risk").notNull().default(''),
  breakpointMonth: integer("breakpoint_month").notNull().default(999),
  breakpointScenario: text("breakpoint_scenario").notNull().default(''),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Payment fields
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  purchaserEmail: text("purchaser_email"),
  purchaserName: text("purchaser_name"),

  // Rerun discount token — single-use link for $4.99 repeat analysis
  rerunToken: text("rerun_token"),
  rerunTokenUsed: boolean("rerun_token_used").notNull().default(false),
});

export const insertSimulationSchema = createInsertSchema(simulations).omit({
  id: true,
  createdAt: true,
  tmib: true,
  accessibleCapital: true,
  selfEmploymentTax: true,
  businessCostBaseline: true,
  estimatedHealthcarePlanCost: true,
  healthcareDelta: true,
  baseRunway: true,
  runway15Down: true,
  runway30Down: true,
  runwayRampDelay: true,
  structuralBreakpointScore: true,
  debtExposureRatio: true,
  healthcareRisk: true,
  breakpointMonth: true,
  breakpointScenario: true,
  healthcareMonthlyCost: true,
  paid: true,
  paidAt: true,
  stripeSessionId: true,
  stripePaymentIntentId: true,
  purchaserEmail: true,
  purchaserName: true,
  rerunToken: true,
  rerunTokenUsed: true,
}).extend({
  healthcareType: z.enum(['employer', 'cobra', 'aca', 'partner', 'none']),
  businessModelType: z.enum(['solo_bootstrap', 'contractor_heavy', 'agency_service', 'inventory_heavy', 'saas_product']),
  volatilityPercent: z.coerce.number().min(10).max(40).default(15),
  businessCostOverride: z.coerce.number().min(0).optional().nullable(),
  healthcareCostOverride: z.coerce.number().min(0).optional().nullable(),
  adultsOnPlan: z.coerce.number().min(1).max(2).default(1),
  dependentChildren: z.coerce.number().min(0).default(0),
  currentPayrollHealthcare: z.coerce.number().min(0).default(0),
  totalDebt: z.coerce.number().min(0).default(0),
  monthlyDebtPayments: z.coerce.number().min(0).default(0),
  taxReservePercent: z.coerce.number().min(10).max(40).default(25),
});

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
