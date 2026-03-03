import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useForm, useController, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import Layout from "../components/Layout";
import ErrorBoundary from "../components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { simulationFormSchema, SimulationFormValues, useCreateSimulation } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Info, Check, AlertTriangle } from "lucide-react";

// ─── Screen definitions ────────────────────────────────────────────────────

type ScreenMeta =
  | { kind: 'input';   phase: 1|2|3; phaseStep: number; phaseTotal: number; header: string; subtext: string }
  | { kind: 'summary'; phase: 1|2|3; header: string };

const SCREENS: ScreenMeta[] = [
  // ── Phase 1 — Structural Burn (5 input + 1 summary) ──────────────────
  { kind: 'input', phase: 1, phaseStep: 1, phaseTotal: 5,
    header: "Income Overview",
    subtext: "Your current income gives us context for the transition. It doesn't change the model — it helps frame how large a gap you're closing." },
  { kind: 'input', phase: 1, phaseStep: 2, phaseTotal: 5,
    header: "Required Loan Payments",
    subtext: "These are contractual minimums. Missing them causes credit damage or default. They cannot be skipped." },
  { kind: 'input', phase: 1, phaseStep: 3, phaseTotal: 5,
    header: "Household Living Costs",
    subtext: "What it costs your household to function each month — separate from loans and healthcare. Be honest, not optimistic." },
  { kind: 'input', phase: 1, phaseStep: 4, phaseTotal: 5,
    header: "Healthcare Transition",
    subtext: "Losing employer coverage usually adds $500–$1,500 per month. We estimate this based on your household size and your expected income." },
  { kind: 'input', phase: 1, phaseStep: 5, phaseTotal: 5,
    header: "Household Structure",
    subtext: "A partner's reliable income directly reduces how much your savings need to cover each month." },
  { kind: 'summary', phase: 1, header: "Your Structural Burn" },

  // ── Phase 2 — Liquidity Layers (4 input + 1 summary) ─────────────────
  { kind: 'input', phase: 2, phaseStep: 1, phaseTotal: 4,
    header: "Tier 1 — Fully Liquid Capital",
    subtext: "Cash you can access today with no penalties, no taxes, and no delay. This is your first line of defense." },
  { kind: 'input', phase: 2, phaseStep: 2, phaseTotal: 4,
    header: "Tier 2 — Semi-Liquid Capital",
    subtext: "Investments you can sell, but selling may trigger capital gains taxes and depends on market timing. Counted at 80% to reflect this." },
  { kind: 'input', phase: 2, phaseStep: 3, phaseTotal: 4,
    header: "Tier 3 — Retirement Accounts",
    subtext: "Accessible under hardship, but early withdrawal typically costs you income taxes plus a 10% penalty. These are a last resort — not primary runway." },
  { kind: 'input', phase: 2, phaseStep: 4, phaseTotal: 4,
    header: "Tier 3 — Illiquid Assets",
    subtext: "Home equity can be tapped through a sale or HELOC, but it's slow, costly, and uncertain. Counted at 30% to reflect the real friction." },
  { kind: 'summary', phase: 2, header: "Your Accessible Capital" },

  // ── Phase 3 — Income Plan (4 input + 1 review) ────────────────────────
  { kind: 'input', phase: 3, phaseStep: 1, phaseTotal: 4,
    header: "Business Structure",
    subtext: "Your operating model determines baseline monthly costs — these get added to your burn whether revenue comes in or not." },
  { kind: 'input', phase: 3, phaseStep: 2, phaseTotal: 4,
    header: "Expected Steady Revenue",
    subtext: "Your conservative stable-state target. Not what you hope for in month one — what you'd realistically sustain once things settle." },
  { kind: 'input', phase: 3, phaseStep: 3, phaseTotal: 4,
    header: "Ramp Timeline",
    subtext: "Most people underestimate how long revenue takes to stabilize. The model assumes 50% realization during ramp. Build in buffer." },
  { kind: 'input', phase: 3, phaseStep: 4, phaseTotal: 4,
    header: "Income Reliability",
    subtext: "Month-to-month income swings determine how quickly things can go wrong. Choose honestly." },
  { kind: 'summary', phase: 3, header: "Review Before Running" },
];

const PHASE_LABELS: Record<number, string> = {
  1: "Phase 1 — Structural Burn",
  2: "Phase 2 — Liquidity Layers",
  3: "Phase 3 — Income Plan",
};

// ─── Healthcare options ────────────────────────────────────────────────────
const HEALTHCARE_OPTIONS = [
  { value: 'partner', label: 'Covered by partner plan',  note: 'No additional cost' },
  { value: 'aca',     label: 'ACA marketplace',          note: 'Subsidized based on your post-quit income' },
  { value: 'cobra',   label: 'COBRA continuation',       note: 'Time-limited to 18 months, typically expensive' },
  { value: 'employer',label: 'Employer plan retained',   note: 'During severance or notice period' },
  { value: 'none',    label: 'Self-pay, no coverage',    note: 'All medical costs are fully out-of-pocket' },
];

// ─── Business model options ────────────────────────────────────────────────
type BusinessChoice = 'solo' | 'agency' | 'product' | 'custom';
const BUSINESS_CHOICES: {
  value: BusinessChoice; label: string; desc: string; cost: string; modelType: string; monthlyCost: number;
}[] = [
  { value: 'solo',    label: 'Solo bootstrap',          desc: 'Freelance, consulting, one-person',         cost: '$500/mo',   modelType: 'solo_bootstrap',  monthlyCost: 500 },
  { value: 'agency',  label: 'Lean agency / service',   desc: 'Small team, service delivery',             cost: '$3,000/mo', modelType: 'agency_service',  monthlyCost: 3000 },
  { value: 'product', label: 'Product / SaaS',          desc: 'Software, recurring revenue model',        cost: '$2,500/mo', modelType: 'saas_product',    monthlyCost: 2500 },
  { value: 'custom',  label: 'Custom',                  desc: 'I know my actual monthly operating cost',  cost: 'Enter below', modelType: 'solo_bootstrap', monthlyCost: 0 },
];

// ─── Income reliability presets ────────────────────────────────────────────
const RELIABILITY_PRESETS = [
  { val: 10, label: 'Stable retainers',        sub: 'Long-term contracts, predictable clients' },
  { val: 15, label: 'Mixed client work',        sub: 'Some recurring, some project-based' },
  { val: 20, label: 'Project-based billing',   sub: 'Milestone payments, variable contracts' },
  { val: 30, label: 'Early-stage / volatile',  sub: 'Unproven model, high uncertainty' },
];

// ─── Healthcare plan estimate (client-side, unsubsidized) ─────────────────
function estimatePlan(adults: number, children: number): number {
  let base: number;
  if (adults === 2 && children >= 1) base = 1500 + children * 300;
  else if (adults === 1 && children >= 1) base = 1200 + children * 250;
  else if (adults === 2) base = 1100;
  else base = 600;
  return Math.min(base, 3000);
}

const SE_TAX_RATE = 0.28;
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// ─── Formatted money input ─────────────────────────────────────────────────
function MoneyInput({
  name, control, label, placeholder = "", note, autoFocus = false, optional = false,
}: {
  name: keyof SimulationFormValues; control: Control<SimulationFormValues>;
  label?: string; placeholder?: string; note?: string; autoFocus?: boolean; optional?: boolean;
}) {
  const { field, fieldState } = useController({ name, control });
  const [displayVal, setDisplayVal] = useState<string>(() => {
    const v = field.value as number;
    return v && v > 0 ? v.toLocaleString('en-US') : '';
  });
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = raw ? parseInt(raw, 10) : 0;
    field.onChange(num);
    setDisplayVal(raw ? parseInt(raw, 10).toLocaleString('en-US') : '');
  }, [field]);
  return (
    <div className="w-full max-w-sm">
      {label && (
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          {label}{optional && <span className="ml-2 text-xs opacity-50">optional</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40 font-medium select-none">$</span>
        <input type="text" inputMode="numeric" placeholder={placeholder} autoFocus={autoFocus}
          value={displayVal} onChange={handleChange} onBlur={field.onBlur}
          className="w-full pl-8 pr-4 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid={`input-${name}`} />
      </div>
      {note && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{note}</p>}
      {fieldState.error && <p className="text-xs text-destructive mt-1.5">{fieldState.error.message}</p>}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 10, label }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-muted-foreground mb-3">{label}</label>}
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className="w-10 h-10 rounded-md border border-border text-xl font-bold flex items-center justify-center disabled:opacity-30">−</button>
        <span className="text-2xl font-bold font-serif w-8 text-center text-foreground">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-10 h-10 rounded-md border border-border text-xl font-bold flex items-center justify-center disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

function BurnRow({ label, value, subtract = false, total = false, group = false }: {
  label: string; value: number; subtract?: boolean; total?: boolean; group?: boolean;
}) {
  if (value === 0 && !total && !group) return null;
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${group ? 'bg-muted/30 border-t border-border' : total ? 'bg-foreground/[0.05] border-t-2 border-border' : 'border-b border-border last:border-0'}`}>
      <span className={`text-sm ${total ? 'font-bold text-foreground' : group ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm font-semibold ${total ? 'text-xl font-bold font-serif text-foreground' : subtract ? 'text-green-700' : group ? 'text-foreground' : 'text-foreground'}`}>
        {group ? '' : subtract ? `(${fmt(value)})` : fmt(value)}
      </span>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────
export default function Simulator() {
  return <ErrorBoundary><SimulatorInner /></ErrorBoundary>;
}

function SimulatorInner() {
  const [, setLocation] = useLocation();
  const [screenIndex, setScreenIndex] = useState(0);
  const [businessChoice, setBusinessChoice] = useState<BusinessChoice | null>(null);
  const [showHealthcareOverride, setShowHealthcareOverride] = useState(false);
  const { toast } = useToast();
  const createSimulation = useCreateSimulation();

  const form = useForm<SimulationFormValues>({
    resolver: zodResolver(simulationFormSchema),
    defaultValues: {
      currentSalary: undefined as unknown as number,
      livingExpenses: undefined as unknown as number,
      totalDebt: 0,
      monthlyDebtPayments: 0,
      isDualIncome: false,
      partnerIncome: 0,
      healthcareType: undefined as unknown as 'aca',
      adultsOnPlan: 1,
      dependentChildren: 0,
      currentPayrollHealthcare: 0,
      healthcareCostOverride: null,
      cash: 0,
      brokerage: 0,
      roth: 0,
      traditional: 0,
      realEstate: 0,
      businessModelType: 'solo_bootstrap',
      businessCostOverride: null,
      expectedRevenue: undefined as unknown as number,
      volatilityPercent: 15,
      rampDuration: undefined as unknown as number,
      breakevenMonths: 0,
    },
    mode: "onChange",
  });

  const { control, watch, setValue, trigger } = form;
  const values = watch();
  const screen = SCREENS[screenIndex];

  // Healthcare derived
  const adultsOnPlan = values.adultsOnPlan ?? 1;
  const dependentChildren = values.dependentChildren ?? 0;
  const currentPayrollHealthcare = values.currentPayrollHealthcare ?? 0;
  const estimatedPlan = estimatePlan(adultsOnPlan, dependentChildren);
  const overridePlan = values.healthcareCostOverride;
  const effectivePlan = values.healthcareType === 'partner' ? 0
    : (overridePlan && overridePlan > 0) ? overridePlan : estimatedPlan;
  const healthcareDelta = Math.max(0, effectivePlan - currentPayrollHealthcare);

  // Business cost
  const bizCost = businessChoice
    ? (businessChoice === 'custom' && values.businessCostOverride && values.businessCostOverride > 0
        ? values.businessCostOverride
        : BUSINESS_CHOICES.find(b => b.value === businessChoice)?.monthlyCost ?? 500)
    : 500;

  const seTax = Math.round((values.expectedRevenue ?? 0) * SE_TAX_RATE);
  const partnerOffset = values.isDualIncome ? (values.partnerIncome ?? 0) : 0;
  const fixedObligations = (values.monthlyDebtPayments ?? 0) + (values.livingExpenses ?? 0);
  const transitionNet = healthcareDelta - partnerOffset;
  const structuralBurn = Math.max(0, fixedObligations + transitionNet);
  const totalBurn = Math.max(0, structuralBurn + seTax + bizCost);

  const accessibleCapital = Math.round(
    (values.cash ?? 0) +
    (values.brokerage ?? 0) * 0.80 +
    (values.roth ?? 0) * 1.00 +
    (values.traditional ?? 0) * 0.50 +
    (values.realEstate ?? 0) * 0.30
  );

  const tier1 = values.cash ?? 0;
  const tier2 = Math.round((values.brokerage ?? 0) * 0.80);
  const tier3 = Math.round((values.roth ?? 0) + (values.traditional ?? 0) * 0.50 + (values.realEstate ?? 0) * 0.30);
  const tier1And2 = tier1 + tier2;

  // Per-screen validation
  const screenValidation: Partial<Record<number, (keyof SimulationFormValues)[]>> = {
    2: ['livingExpenses'],
    3: ['healthcareType'],
    12: ['expectedRevenue'],
    13: ['rampDuration'],
  };

  const next = async () => {
    const fields = screenValidation[screenIndex] ?? [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    if (screenIndex === 11 && businessChoice === null) return;
    setScreenIndex(i => Math.min(i + 1, SCREENS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setScreenIndex(i => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = () => {
    createSimulation.mutate({
      ...values,
      currentSalary: values.currentSalary ?? 0,
      breakevenMonths: (values.rampDuration || 0) + 3,
    }, {
      onSuccess: (result) => setLocation(`/results/${result.id}`),
      onError: (err) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
    });
  };

  const progress = (screenIndex / (SCREENS.length - 1)) * 100;
  const isLastScreen = screenIndex === SCREENS.length - 1;
  const isSummary = screen.kind === 'summary';

  const continueLabel = isSummary
    ? (screenIndex === 5 ? 'Continue to Liquidity' : screenIndex === 10 ? 'Continue to Income Plan' : 'Continue')
    : 'Continue';

  return (
    <Layout>
      <div className="flex-1 flex flex-col bg-background">
        <div className="border-b border-border bg-muted/20">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {PHASE_LABELS[screen.phase]}
            </p>
            {screen.kind === 'input' && (
              <p className="text-xs text-muted-foreground" data-testid="text-step-counter">
                Step {screen.phaseStep} of {screen.phaseTotal}
              </p>
            )}
          </div>
          <div className="h-0.5 bg-border">
            <div className="h-full bg-foreground transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg">
            <AnimatePresence mode="wait">
              <motion.div key={screenIndex}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.22 }}>

                {/* ── Screen 0: Income Overview ───────────────────── */}
                {screenIndex === 0 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <MoneyInput name="currentSalary" control={control}
                      label="Current monthly take-home income"
                      placeholder="8,500" autoFocus optional
                      note="After-tax. Used only for context — it does not affect your burn calculations." />
                  </div>
                )}

                {/* ── Screen 1: Required Loan Payments ────────────── */}
                {screenIndex === 1 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="space-y-8">
                      <div>
                        <MoneyInput name="monthlyDebtPayments" control={control}
                          label="Total monthly required loan payments"
                          placeholder="1,800" autoFocus
                          note="Mortgage or rent-to-own, car loans, student loans, credit card minimums — required payments only." />
                        <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md max-w-sm">
                          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700">
                            If you pay a mortgage, enter it here. Do not include it in Living Costs on the next screen.
                          </p>
                        </div>
                      </div>
                      <div>
                        <MoneyInput name="totalDebt" control={control}
                          label="Total remaining loan balances" placeholder="0" optional />
                        <p className="text-xs text-muted-foreground mt-2 max-w-sm">This does not change your monthly burn. It informs leverage risk commentary only.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Screen 2: Household Living Costs ────────────── */}
                {screenIndex === 2 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="mb-6 flex items-start gap-2 p-3.5 bg-muted/30 border border-border rounded-md">
                      <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Include: food, utilities, insurance, childcare, transportation, subscriptions, entertainment, discretionary spending.
                        <strong className="text-foreground"> Do not include loan payments</strong> (those are on the previous screen)
                        <strong className="text-foreground"> or healthcare</strong> (that comes next).
                      </p>
                    </div>
                    <MoneyInput name="livingExpenses" control={control}
                      label="Total monthly household expenses (non-debt, non-healthcare)"
                      placeholder="4,500" autoFocus />
                  </div>
                )}

                {/* ── Screen 3: Healthcare Transition ─────────────── */}
                {screenIndex === 3 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        {HEALTHCARE_OPTIONS.map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setValue("healthcareType", opt.value as SimulationFormValues['healthcareType'], { shouldValidate: true })}
                            className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-md border transition-all ${values.healthcareType === opt.value ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                            data-testid={`option-healthcare-${opt.value}`}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.note}</p>
                            </div>
                            {values.healthcareType === opt.value && <Check className="w-4 h-4 shrink-0 ml-3" />}
                          </button>
                        ))}
                      </div>

                      {values.healthcareType && values.healthcareType !== 'partner' && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 pt-4 border-t border-border">
                          <div className="grid grid-cols-2 gap-6">
                            <Stepper label="Adults on plan" value={adultsOnPlan} min={1} max={2}
                              onChange={(v) => setValue("adultsOnPlan", v)} />
                            <Stepper label="Dependent children" value={dependentChildren} min={0} max={6}
                              onChange={(v) => setValue("dependentChildren", v)} />
                          </div>
                          <MoneyInput name="currentPayrollHealthcare" control={control}
                            label="Current monthly payroll deduction"
                            placeholder="0"
                            note="What you pay per paycheck — not the employer's total premium." />
                          <div className="p-4 rounded-md border border-border bg-muted/20">
                            <div className="flex justify-between mb-1.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {values.healthcareType === 'aca' ? 'Estimated independent plan cost' : 'Estimated plan cost'}
                              </p>
                              <p className="text-base font-bold font-serif text-foreground" data-testid="text-estimated-plan">{fmt(estimatedPlan)}/mo</p>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                              Based on {adultsOnPlan} adult{adultsOnPlan > 1 ? 's' : ''}{dependentChildren > 0 ? ` + ${dependentChildren} child${dependentChildren > 1 ? 'ren' : ''}` : ''}.
                              {values.healthcareType === 'aca' && ' ACA subsidy is calculated on the server using your expected revenue.'}
                            </p>
                            <div className="flex justify-between pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground">Additional monthly cost vs. today</p>
                              <p className="text-sm font-bold text-foreground" data-testid="text-healthcare-delta">{fmt(healthcareDelta)}/mo</p>
                            </div>
                          </div>
                          <button type="button"
                            onClick={() => { setShowHealthcareOverride(v => !v); if (showHealthcareOverride) setValue("healthcareCostOverride", null); }}
                            className="text-sm text-foreground underline underline-offset-2 opacity-60"
                            data-testid="button-healthcare-override">
                            {showHealthcareOverride ? 'Use estimated cost' : 'Override with your actual plan cost'}
                          </button>
                          {showHealthcareOverride && (
                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                              <MoneyInput name="healthcareCostOverride" control={control}
                                label="Your actual independent plan cost (monthly)"
                                placeholder="600" note="Enter the actual monthly premium from your research or enrollment." />
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {values.healthcareType === 'partner' && (
                        <div className="p-4 rounded-md border border-green-200 bg-green-50">
                          <p className="text-sm font-semibold text-green-700">Partner coverage eliminates healthcare cost change.</p>
                          <p className="text-xs text-green-700 mt-1">No additional healthcare cost will be added to your monthly burn.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Screen 4: Household Structure ──────────────── */}
                {screenIndex === 4 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="space-y-6">
                      <div className="flex gap-3">
                        <button type="button"
                          onClick={() => { setValue("isDualIncome", false); setValue("partnerIncome", 0); }}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${!values.isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-single-income">Single income</button>
                        <button type="button"
                          onClick={() => setValue("isDualIncome", true)}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${values.isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-dual-income-yes">Dual income</button>
                      </div>
                      {values.isDualIncome && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <MoneyInput name="partnerIncome" control={control}
                            label="Partner monthly take-home income"
                            placeholder="5,000" autoFocus
                            note="After-tax. Only what reliably flows toward shared household expenses." />
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Screen 5: Burn Summary ─────────────────────── */}
                {screenIndex === 5 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 1 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      This is the amount your savings must cover each month if employment income stops.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-4">
                      <BurnRow label="Required Fixed Obligations" value={0} group />
                      <BurnRow label="Required loan payments" value={values.monthlyDebtPayments ?? 0} />
                      <BurnRow label="Household living costs" value={values.livingExpenses ?? 0} />
                      <BurnRow label="Fixed subtotal" value={fixedObligations} group />
                      <BurnRow label="Transition Adjustments" value={0} group />
                      {healthcareDelta > 0 && <BurnRow label="Additional healthcare cost" value={healthcareDelta} />}
                      {partnerOffset > 0 && <BurnRow label="Partner income offset" value={partnerOffset} subtract />}
                      <BurnRow label="Monthly Structural Burn" value={structuralBurn} total />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Business costs and a tax reserve for self-employment will be added in Phase 3, based on your income plan.
                    </p>
                  </div>
                )}

                {/* ── Screen 6: Tier 1 — Cash ────────────────────── */}
                {screenIndex === 6 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <MoneyInput name="cash" control={control}
                      label="Cash, checking, savings, money market, HYSA"
                      placeholder="50,000" autoFocus note="Counted at 100% — no haircut applied." />
                  </div>
                )}

                {/* ── Screen 7: Tier 2 — Brokerage ─────────────── */}
                {screenIndex === 7 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <MoneyInput name="brokerage" control={control}
                      label="Taxable brokerage and investment accounts"
                      placeholder="0" autoFocus note="Counted at 80% — capital gains taxes and market timing risk applied." />
                  </div>
                )}

                {/* ── Screen 8: Tier 3 — Retirement ─────────────── */}
                {screenIndex === 8 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="mb-6 flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        These are not considered primary runway. Accessing them early typically triggers income tax plus a 10% early withdrawal penalty. The model uses them only as emergency extension capital.
                      </p>
                    </div>
                    <div className="space-y-7">
                      <MoneyInput name="roth" control={control}
                        label="Roth IRA — principal contributions only"
                        placeholder="0" autoFocus note="Counted at 100% — contributions (not earnings) can be withdrawn penalty-free." />
                      <MoneyInput name="traditional" control={control}
                        label="Traditional IRA / 401(k) balance"
                        placeholder="0" note="Counted at 50% — income tax and 10% early withdrawal penalty applied." />
                    </div>
                  </div>
                )}

                {/* ── Screen 9: Tier 3 — Home Equity ───────────── */}
                {screenIndex === 9 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <MoneyInput name="realEstate" control={control}
                      label="Estimated home equity" placeholder="0" autoFocus optional
                      note="Counted at 30% — illiquid, 6–10% transaction costs, market-dependent timing." />
                  </div>
                )}

                {/* ── Screen 10: Capital Summary ──────────────────── */}
                {screenIndex === 10 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 2 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      Your capital is organized by how quickly and cheaply you can access it. Depletion follows this order under stress.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-4">
                      {/* Tier 1 */}
                      <div className="px-5 py-2.5 bg-muted/20 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier 1 — Fully Liquid (Primary Runway)</p>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">Cash & HYSA (100%)</span>
                        <span className="text-sm font-semibold text-foreground">{fmt(tier1)}</span>
                      </div>
                      {/* Tier 2 */}
                      <div className="px-5 py-2.5 bg-muted/20 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier 2 — Semi-Liquid (Access with Trade-offs)</p>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">Brokerage (80%)</span>
                        <span className="text-sm font-semibold text-foreground">{fmt(tier2)}</span>
                      </div>
                      {/* Tier 3 */}
                      <div className="px-5 py-2.5 bg-muted/20 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tier 3 — Restricted / Last Resort</p>
                      </div>
                      {(values.roth ?? 0) > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                          <span className="text-sm text-muted-foreground">Roth contributions (100%)</span>
                          <span className="text-sm font-semibold text-foreground">{fmt(Math.round((values.roth ?? 0) * 1.00))}</span>
                        </div>
                      )}
                      {(values.traditional ?? 0) > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                          <span className="text-sm text-muted-foreground">Traditional IRA/401(k) (50%)</span>
                          <span className="text-sm font-semibold text-foreground">{fmt(Math.round((values.traditional ?? 0) * 0.50))}</span>
                        </div>
                      )}
                      {(values.realEstate ?? 0) > 0 && (
                        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                          <span className="text-sm text-muted-foreground">Home equity (30%)</span>
                          <span className="text-sm font-semibold text-foreground">{fmt(Math.round((values.realEstate ?? 0) * 0.30))}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-5 py-4 bg-foreground/[0.05] border-t border-border">
                        <span className="text-sm font-bold text-foreground">Total accessible capital</span>
                        <span className="text-xl font-bold font-serif text-foreground" data-testid="text-capital-preview">{fmt(accessibleCapital)}</span>
                      </div>
                    </div>
                    {tier3 > 0 && tier1And2 < totalBurn * 12 && (
                      <div className="flex items-start gap-2 p-3.5 bg-amber-50 border border-amber-200 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Your Tier 1 and Tier 2 capital may not cover 12 months of burn on its own. The model will show how much you'd rely on retirement assets.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Screen 11: Business Structure ───────────────── */}
                {screenIndex === 11 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="space-y-2 mb-5">
                      {BUSINESS_CHOICES.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => {
                            setBusinessChoice(opt.value);
                            setValue("businessModelType", opt.modelType as SimulationFormValues['businessModelType']);
                            if (opt.value !== 'custom') setValue("businessCostOverride", null);
                          }}
                          className={`w-full text-left flex items-center justify-between px-5 py-4 rounded-md border transition-all ${businessChoice === opt.value ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                          data-testid={`option-model-${opt.value}`}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground ml-3 shrink-0">{opt.cost}</span>
                        </button>
                      ))}
                    </div>
                    {businessChoice === 'custom' && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <MoneyInput name="businessCostOverride" control={control}
                          label="Monthly business operating cost"
                          placeholder="2,000"
                          note="Tools, software, contractors, workspace, marketing — recurring expenses." />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Screen 12: Expected Revenue ─────────────────── */}
                {screenIndex === 12 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <MoneyInput name="expectedRevenue" control={control}
                      label="Expected monthly revenue once stable"
                      placeholder="8,000" autoFocus
                      note="The model runs stress tests at −15% and −30% of this figure automatically." />
                  </div>
                )}

                {/* ── Screen 13: Ramp Timeline ─────────────────────── */}
                {screenIndex === 13 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="w-full max-w-sm">
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Months to reach stable revenue</label>
                      <div className="relative">
                        <input type="number" min="0" max="36" placeholder="6" autoFocus
                          value={values.rampDuration ?? ''}
                          onChange={(e) => setValue("rampDuration", parseInt(e.target.value) || 0, { shouldValidate: true })}
                          className="w-full px-4 pr-20 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid="input-rampDuration" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">months</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">During ramp, the model uses 50% revenue realization. Overestimating is safe — underestimating is not.</p>
                    </div>
                  </div>
                )}

                {/* ── Screen 14: Income Reliability ──────────────── */}
                {screenIndex === 14 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as {subtext:string}).subtext}</p>
                    <div className="space-y-2">
                      {RELIABILITY_PRESETS.map(p => (
                        <button key={p.val} type="button"
                          onClick={() => setValue("volatilityPercent", p.val, { shouldValidate: true })}
                          className={`w-full text-left flex items-center justify-between px-5 py-4 rounded-md border transition-all ${values.volatilityPercent === p.val ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                          data-testid={`preset-vol-${p.val}`}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{p.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{p.sub}</p>
                          </div>
                          <span className="text-sm font-bold text-muted-foreground ml-3 shrink-0">{p.val}%</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Screen 15: Review + Submit ──────────────────── */}
                {screenIndex === 15 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 3 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      Confirm your numbers before running the stress model. Your capital will be tested against this burn across four scenarios.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-5">
                      <div className="px-5 py-3 bg-muted/20 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Complete Monthly Burn</p>
                      </div>
                      <BurnRow label="Required loan payments" value={values.monthlyDebtPayments ?? 0} />
                      <BurnRow label="Household living costs" value={values.livingExpenses ?? 0} />
                      <BurnRow label="Healthcare cost change" value={healthcareDelta} />
                      <BurnRow label="Self-employment tax reserve (28%)" value={seTax} />
                      <BurnRow label="Business operating cost" value={bizCost} />
                      {partnerOffset > 0 && <BurnRow label="Partner income offset" value={partnerOffset} subtract />}
                      <BurnRow label="True Monthly Burn" value={totalBurn} total />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div className="p-3.5 bg-muted/30 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Accessible capital</p>
                        <p className="text-base font-bold font-serif text-foreground">{fmt(accessibleCapital)}</p>
                      </div>
                      <div className="p-3.5 bg-muted/30 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Ramp timeline</p>
                        <p className="text-base font-bold font-serif text-foreground">{values.rampDuration ?? 0} months</p>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            <div className="mt-10 flex items-center justify-between">
              <button type="button" onClick={back}
                className={`flex items-center gap-1.5 text-sm text-muted-foreground ${screenIndex === 0 ? 'invisible' : ''}`}
                data-testid="button-back">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              {!isLastScreen ? (
                <Button type="button" onClick={next}
                  disabled={screenIndex === 11 && businessChoice === null}
                  data-testid="button-next">{continueLabel}</Button>
              ) : (
                <Button type="button" disabled={createSimulation.isPending} onClick={onSubmit} data-testid="button-submit">
                  {createSimulation.isPending ? 'Running analysis...' : 'Run Stress Test'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
