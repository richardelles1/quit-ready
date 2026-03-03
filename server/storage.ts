import { InsertSimulation, Simulation, simulations } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

type SimulationComputedFields = {
  tmib: number;
  accessibleCapital: number;
  selfEmploymentTax: number;
  businessCostBaseline: number;
  healthcareMonthlyCost: number;
  baseRunway: number;
  runway15Down: number;
  runway30Down: number;
  runwayRampDelay: number;
  structuralBreakpointScore: number;
  debtExposureRatio: number;
  healthcareRisk: string;
  breakpointMonth: number;
  breakpointScenario: string;
};

export interface IStorage {
  createSimulation(data: InsertSimulation & SimulationComputedFields): Promise<Simulation>;
  getSimulation(id: number): Promise<Simulation | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createSimulation(data: InsertSimulation & SimulationComputedFields): Promise<Simulation> {
    const [result] = await db.insert(simulations).values(data).returning();
    return result;
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [result] = await db.select().from(simulations).where(eq(simulations.id, id));
    return result;
  }
}

export const storage = new DatabaseStorage();
