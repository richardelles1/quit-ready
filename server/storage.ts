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
  markSimulationPaid(
    id: number,
    stripeSessionId: string,
    stripePaymentIntentId: string | null,
    email?: string,
    name?: string,
    rerunToken?: string
  ): Promise<void>;
  getSimulationByStripeSession(stripeSessionId: string): Promise<Simulation | undefined>;
  getSimulationByRerunToken(token: string): Promise<Simulation | undefined>;
  getSimulationByAccessToken(token: string): Promise<Simulation | undefined>;
  markRerunTokenUsed(id: number): Promise<void>;
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

  async markSimulationPaid(
    id: number,
    stripeSessionId: string,
    stripePaymentIntentId: string | null,
    email?: string,
    name?: string,
    rerunToken?: string
  ): Promise<void> {
    await db.update(simulations)
      .set({
        paid: true,
        paidAt: new Date(),
        stripeSessionId,
        stripePaymentIntentId: stripePaymentIntentId ?? null,
        purchaserEmail: email ?? null,
        purchaserName: name ?? null,
        rerunToken: rerunToken ?? null,
      })
      .where(eq(simulations.id, id));
  }

  async getSimulationByStripeSession(stripeSessionId: string): Promise<Simulation | undefined> {
    const [result] = await db.select().from(simulations)
      .where(eq(simulations.stripeSessionId, stripeSessionId));
    return result;
  }

  async getSimulationByRerunToken(token: string): Promise<Simulation | undefined> {
    const [result] = await db.select().from(simulations)
      .where(eq(simulations.rerunToken, token));
    return result;
  }

  async getSimulationByAccessToken(token: string): Promise<Simulation | undefined> {
    const [result] = await db.select().from(simulations)
      .where(eq(simulations.accessToken, token));
    return result;
  }

  async markRerunTokenUsed(id: number): Promise<void> {
    await db.update(simulations)
      .set({ rerunTokenUsed: true })
      .where(eq(simulations.id, id));
  }
}

export const storage = new DatabaseStorage();
