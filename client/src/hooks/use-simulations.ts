import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

export const simulationFormSchema = z.object({
  currentSalary: z.coerce.number().min(0).default(0),
  livingExpenses: z.coerce.number().min(1, "Required — enter your monthly lifestyle expenses"),
  totalDebt: z.coerce.number().min(0).default(0),
  monthlyDebtPayments: z.coerce.number().min(0).default(0),
  isDualIncome: z.boolean().default(false),
  partnerIncome: z.coerce.number().min(0).default(0),

  // Dependent-aware healthcare
  healthcareType: z.enum(['employer', 'cobra', 'aca', 'partner', 'none'], {
    required_error: "Please select a coverage type",
  }),
  adultsOnPlan: z.coerce.number().min(1).max(2).default(1),
  dependentChildren: z.coerce.number().min(0).default(0),
  currentPayrollHealthcare: z.coerce.number().min(0).default(0),
  healthcareCostOverride: z.coerce.number().min(0).nullable().optional(),

  // Liquidity
  cash: z.coerce.number().min(0).default(0),
  brokerage: z.coerce.number().min(0).default(0),
  roth: z.coerce.number().min(0).default(0),
  traditional: z.coerce.number().min(0).default(0),
  realEstate: z.coerce.number().min(0).default(0),

  // Business
  businessModelType: z.enum(['solo_bootstrap', 'contractor_heavy', 'agency_service', 'inventory_heavy', 'saas_product']),
  businessCostOverride: z.coerce.number().min(0).nullable().optional(),
  expectedRevenue: z.coerce.number().min(1, "Required"),
  volatilityPercent: z.coerce.number().min(10).max(40).default(15),
  rampDuration: z.coerce.number().min(0).default(0),
  breakevenMonths: z.coerce.number().min(0).default(0),
  taxReservePercent: z.coerce.number().min(10).max(40).default(25),
});

export type SimulationFormValues = z.infer<typeof simulationFormSchema>;

export interface SimulationResult {
  id: number;
  currentSalary: number;
  livingExpenses: number;
  totalDebt: number;
  monthlyDebtPayments: number;
  isDualIncome: boolean;
  partnerIncome: number;
  healthcareType: string;
  adultsOnPlan: number;
  dependentChildren: number;
  currentPayrollHealthcare: number;
  healthcareCostOverride: number | null;
  cash: number;
  brokerage: number;
  roth: number;
  traditional: number;
  realEstate: number;
  businessModelType: string;
  businessCostOverride: number | null;
  expectedRevenue: number;
  volatilityPercent: number;
  rampDuration: number;
  breakevenMonths: number;
  tmib: number;
  accessibleCapital: number;
  selfEmploymentTax: number;
  businessCostBaseline: number;
  estimatedHealthcarePlanCost: number;
  healthcareDelta: number;
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
  taxReservePercent: number;
  createdAt: string;
  // Payment fields
  paid: boolean;
  paidAt: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  purchaserEmail: string | null;
  purchaserName: string | null;
  // Public access token (UUID used in shareable URLs)
  accessToken: string | null;
}

export function useCreateSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SimulationFormValues): Promise<SimulationResult> => {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Simulation failed' }));
        throw new Error(error.message || 'Failed to create simulation');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/simulations', data.id], data);
    },
  });
}

export function useSimulation(token: string | null) {
  return useQuery({
    queryKey: ['/api/simulations', token],
    queryFn: async (): Promise<SimulationResult | null> => {
      if (!token) return null;
      const res = await fetch(`/api/simulations/${token}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch simulation');
      return res.json();
    },
    enabled: token !== null,
  });
}

export function useDownloadSimulationPdf() {
  return useMutation({
    mutationFn: async (numericId: number) => {
      const res = await fetch(`/api/simulations/${numericId}/pdf`);
      if (res.status === 402) {
        throw new Error('payment_required');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'PDF generation failed' }));
        throw new Error(err.message || 'PDF generation failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QuitReady_Report_${numericId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async (args: { simulationId: number; purchaserEmail?: string; purchaserName?: string }): Promise<{ url: string }> => {
      const res = await apiRequest('POST', '/api/stripe/create-checkout-session', args);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.error === 'already_paid') throw new Error('already_paid');
        throw new Error('Failed to create checkout session');
      }
      return res.json();
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}
