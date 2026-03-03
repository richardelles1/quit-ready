import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
// Assuming the backend has these schemas in shared/routes
// If they don't exactly match the import paths, we define the expected types here based on the prompt's schema

// Re-creating the schema types locally to ensure absolute type safety for the form
export const simulationFormSchema = z.object({
  cash: z.coerce.number().min(0, "Must be 0 or greater"),
  brokerage: z.coerce.number().min(0, "Must be 0 or greater"),
  roth: z.coerce.number().min(0, "Must be 0 or greater"),
  traditional: z.coerce.number().min(0, "Must be 0 or greater"),
  realEstate: z.coerce.number().min(0, "Must be 0 or greater"),
  livingExpenses: z.coerce.number().min(0, "Must be 0 or greater"),
  healthcareCost: z.coerce.number().min(0, "Must be 0 or greater"),
  businessCosts: z.coerce.number().min(0, "Must be 0 or greater"),
  taxReserve: z.coerce.number().min(0, "Must be 0 or greater"),
  isDualIncome: z.boolean().default(false),
  partnerIncome: z.coerce.number().min(0).default(0),
  expectedRevenue: z.coerce.number().min(0, "Must be 0 or greater"),
  rampDuration: z.coerce.number().min(0, "Must be 0 or greater"),
  revenueType: z.enum(['recurring', 'one-time']),
  volatilityPercent: z.coerce.number().min(10, "Minimum 10%").max(20, "Maximum 20%").default(15),
  healthcareType: z.enum(['partner', 'aca', 'private', 'none']),
});

export type SimulationFormValues = z.infer<typeof simulationFormSchema>;

export interface SimulationResult {
  id: number;
  cash: number;
  brokerage: number;
  roth: number;
  traditional: number;
  realEstate: number;
  livingExpenses: number;
  healthcareCost: number;
  businessCosts: number;
  taxReserve: number;
  isDualIncome: boolean;
  partnerIncome: number;
  expectedRevenue: number;
  rampDuration: number;
  revenueType: string;
  volatilityPercent: number;
  healthcareType: string;
  readinessIndex: number;
  liquidityScore: number;
  revenueScore: number;
  fixedCostScore: number;
  healthcareScore: number;
  bufferScore: number;
  taxScore: number;
  executionStability: string;
  createdAt: string;
}

export function useCreateSimulation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: SimulationFormValues) => {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Failed to create simulation' }));
        throw new Error(error.message || 'Failed to create simulation');
      }
      
      return (await res.json()) as SimulationResult;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/simulations', data.id], data);
    }
  });
}

export function useSimulation(id: number | null) {
  return useQuery({
    queryKey: ['/api/simulations', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/simulations/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch simulation');
      return (await res.json()) as SimulationResult;
    },
    enabled: id !== null,
  });
}

export function useDownloadSimulationPdf() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/simulations/${id}/pdf`);
      if (!res.ok) throw new Error('Failed to generate PDF');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quitready-simulation-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  });
}
