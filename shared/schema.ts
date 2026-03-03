import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const simulations = pgTable("simulations", {
  id: serial("id").primaryKey(),
  
  // Liquidity
  cash: integer("cash").notNull(),
  brokerage: integer("brokerage").notNull(),
  roth: integer("roth").notNull(),
  traditional: integer("traditional").notNull(),
  realEstate: integer("real_estate").notNull(),
  
  // True Monthly Independence Burn
  livingExpenses: integer("living_expenses").notNull(),
  healthcareCost: integer("healthcare_cost").notNull(),
  businessCosts: integer("business_costs").notNull(),
  taxReserve: integer("tax_reserve").notNull(),
  isDualIncome: boolean("is_dual_income").notNull().default(false),
  partnerIncome: integer("partner_income").notNull().default(0),
  
  // Revenue Modeling
  expectedRevenue: integer("expected_revenue").notNull(),
  rampDuration: integer("ramp_duration").notNull(),
  revenueType: text("revenue_type").notNull(), 
  volatilityPercent: integer("volatility_percent").notNull().default(15),
  
  // Healthcare Exposure
  healthcareType: text("healthcare_type").notNull(), 
  
  // Results
  readinessIndex: integer("readiness_index").notNull(),
  liquidityScore: integer("liquidity_score").notNull(),
  revenueScore: integer("revenue_score").notNull(),
  fixedCostScore: integer("fixed_cost_score").notNull(),
  healthcareScore: integer("healthcare_score").notNull(),
  bufferScore: integer("buffer_score").notNull(),
  taxScore: integer("tax_score").notNull(),
  executionStability: text("execution_stability").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSimulationSchema = createInsertSchema(simulations).omit({
  id: true,
  createdAt: true,
  readinessIndex: true,
  liquidityScore: true,
  revenueScore: true,
  fixedCostScore: true,
  healthcareScore: true,
  bufferScore: true,
  taxScore: true,
  executionStability: true,
}).extend({
  revenueType: z.enum(['recurring', 'one-time']),
  healthcareType: z.enum(['partner', 'aca', 'private', 'none']),
  volatilityPercent: z.number().min(10).max(20).default(15)
});

export type Simulation = typeof simulations.$inferSelect;
export type InsertSimulation = z.infer<typeof insertSimulationSchema>;
