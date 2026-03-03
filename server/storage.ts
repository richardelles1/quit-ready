import { InsertSimulation, Simulation, simulations } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  createSimulation(simulation: InsertSimulation & { 
    readinessIndex: number;
    liquidityScore: number;
    revenueScore: number;
    fixedCostScore: number;
    healthcareScore: number;
    bufferScore: number;
    taxScore: number;
    executionStability: string;
  }): Promise<Simulation>;
  getSimulation(id: number): Promise<Simulation | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createSimulation(simulation: InsertSimulation & { 
    readinessIndex: number;
    liquidityScore: number;
    revenueScore: number;
    fixedCostScore: number;
    healthcareScore: number;
    bufferScore: number;
    taxScore: number;
    executionStability: string;
  }): Promise<Simulation> {
    const [result] = await db.insert(simulations).values(simulation).returning();
    return result;
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [result] = await db.select().from(simulations).where(eq(simulations.id, id));
    return result;
  }
}

export const storage = new DatabaseStorage();
