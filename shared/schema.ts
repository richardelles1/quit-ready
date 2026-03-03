import { pgTable, serial, integer, text, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),

  // Section 1: Current Stability
  currentSalary: integer("current_salary").notNull(),
  livingExpenses: integer("living_expenses").notNull(),
  totalDebt: integer("total_debt").notNull(),
  monthlyDebtPayments: integer("monthly_debt_payments").notNull(),
  isDualIncome: boolean("is_dual_income").notNull().default(false),
  partnerIncome: integer("partner_income").notNull().default(0),
  healthcareType: text("healthcare_type").notNull(),

  // Section 2: Liquidity Position
  cash: integer("cash").notNull(),
  brokerage: integer("brokerage").notNull(),
  roth: integer("roth").notNull(),
  traditional: integer("traditional").notNull(),
  realEstate: integer("real_estate").notNull(),

  // Section 3: Business Transition Model
  businessModelType: text("business_model_type").notNull(),
  businessCostOverride: integer("business_cost_override"),
  expectedRevenue: integer("expected_revenue").notNull(),
  volatilityPercent: integer("volatility_percent").notNull().default(15),
  rampDuration: integer("ramp_duration").notNull(),
  breakevenMonths: integer("breakeven_months").notNull(),

  // Computed Results
  tmib: integer("tmib").notNull(),
  accessibleCapital: integer("accessible_capital").notNull(),
  selfEmploymentTax: integer("self_employment_tax").notNull(),
  businessCostBaseline: integer("business_cost_baseline").notNull(),
  baseRunway: integer("base_runway").notNull(),
  runway15Down: integer("runway_15_down").notNull(),
  runway30Down: integer("runway_30_down").notNull(),
  runwayRampDelay: integer("runway_ramp_delay").notNull(),
  structuralBreakpointScore: integer("structural_breakpoint_score").notNull(),
  debtExposureRatio: real("debt_exposure_ratio").notNull(),
  healthcareRisk: text("healthcare_risk").notNull(),
  breakpointMonth: integer("breakpoint_month").notNull(),
  breakpointScenario: text("breakpoint_scenario").notNull(),
  healthcareMonthlyCost: integer("healthcare_monthly_cost").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSimulationSchema = createInsertSchema(simulations).omit({
  id: true,
  createdAt: true,
  tmib: true,
  accessibleCapital: true,
  selfEmploymentTax: true,
  businessCostBaseline: true,
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
}).extend({
  healthcareType: z.enum(['employer', 'cobra', 'aca', 'partner', 'none']),
  businessModelType: z.enum(['solo_bootstrap', 'contractor_heavy', 'agency_service', 'inventory_heavy', 'saas_product']),
  volatilityPercent: z.coerce.number().min(10).max(40).default(15),
  businessCostOverride: z.coerce.number().min(0).optional().nullable(),
});

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
