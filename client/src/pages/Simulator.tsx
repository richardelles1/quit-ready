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
import { ChevronLeft, Info, Check } from "lucide-react";

// ─── Screen configuration ─────────────────────────────────────────────────

type ScreenMeta =
  | { kind: 'input'; phase: 1|2|3; phaseStep: number; phaseTotal: number; header: string; subtext: string }
  | { kind: 'summary'; phase: 1|2|3; header: string };

const SCREENS: ScreenMeta[] = [
  // Phase 1 — Structural Burn
  { kind: 'input', phase: 1, phaseStep: 1, phaseTotal: 4,
    header: "Required Debt Service",
    subtext: "These payments cannot be reduced without default. Enter your combined monthly minimum obligations." },
  { kind: 'input', phase: 1, phaseStep: 2, phaseTotal: 4,
    header: "Operating Cost of Living",
    subtext: "Your baseline monthly cost to exist — housing, food, utilities, insurance, childcare, discretionary. Exclude debt and healthcare." },
  { kind: 'input', phase: 1, phaseStep: 3, phaseTotal: 4,
    header: "Household Structure",
    subtext: "A partner's stable income directly reduces your monthly structural burn. Include it only if it's consistent and dependable." },
  { kind: 'input', phase: 1, phaseStep: 4, phaseTotal: 4,
    header: "Healthcare Transition Impact",
    subtext: "For most people, leaving employment adds $500–$1,500 per month in new coverage costs. We estimate this based on your household size." },
  { kind: 'summary', phase: 1, header: "Your Structural Burn" },

  // Phase 2 — Liquidity Layers
  { kind: 'input', phase: 2, phaseStep: 1, phaseTotal: 4,
    header: "Fully Liquid Capital",
    subtext: "Cash and HYSA — no penalty, no tax event, no delay. This is your most defensible capital." },
  { kind: 'input', phase: 2, phaseStep: 2, phaseTotal: 4,
    header: "Semi-Liquid Capital",
    subtext: "Taxable brokerage — accessible within days, but with capital gains exposure and market timing risk. Counted at 80%." },
  { kind: 'input', phase: 2, phaseStep: 3, phaseTotal: 4,
    header: "Retirement Access",
    subtext: "Accessible under duress, but with meaningful cost. Roth contributions count at 100%. Traditional accounts count at 50% after tax and penalty." },
  { kind: 'input', phase: 2, phaseStep: 4, phaseTotal: 4,
    header: "Illiquid Assets",
    subtext: "Home equity is counted at 30% — illiquid by nature, with substantial transaction costs and timing constraints." },
  { kind: 'summary', phase: 2, header: "Your Accessible Capital" },

  // Phase 3 — Income Plan
  { kind: 'input', phase: 3, phaseStep: 1, phaseTotal: 4,
    header: "Business Structure",
    subtext: "Your operating model determines baseline monthly cost. These costs are added to your burn regardless of revenue." },
  { kind: 'input', phase: 3, phaseStep: 2, phaseTotal: 4,
    header: "Expected Steady Revenue",
    subtext: "Your conservative stable-state target — not your launch month. The model applies stress scenarios automatically." },
  { kind: 'input', phase: 3, phaseStep: 3, phaseTotal: 4,
    header: "Ramp Timeline",
    subtext: "During ramp, the model assumes 50% revenue realization. If you think 3 months, model 6. Build in buffer." },
  { kind: 'input', phase: 3, phaseStep: 4, phaseTotal: 4,
    header: "Income Reliability",
    subtext: "This determines stress sensitivity across all four scenarios. Choose the profile that most honestly describes this income." },
  { kind: 'summary', phase: 3, header: "Review Before Running" },
];

const PHASE_LABELS: Record<number, string> = {
  1: "Phase 1 — Structural Burn",
  2: "Phase 2 — Liquidity Layers",
  3: "Phase 3 — Income Plan",
};

// ─── Healthcare options ───────────────────────────────────────────────────

const HEALTHCARE_OPTIONS = [
  { value: 'partner', label: 'Covered by partner plan',  note: 'No additional cost to you' },
  { value: 'aca',     label: 'ACA marketplace',          note: 'Income-dependent subsidies available' },
  { value: 'cobra',   label: 'COBRA continuation',       note: 'Time-limited to 18 months' },
  { value: 'employer',label: 'Employer plan retained',   note: 'During severance or notice period' },
  { value: 'none',    label: 'Self-pay (no coverage)',   note: 'All medical costs fully out-of-pocket' },
];

// ─── Business model options ────────────────────────────────────────────────

type BusinessChoice = 'solo' | 'agency' | 'product' | 'custom';
const BUSINESS_CHOICES: {
  value: BusinessChoice; label: string; desc: string; cost: string;
  modelType: string; monthlyCost: number;
}[] = [
  { value: 'solo',    label: 'Solo bootstrap',         desc: 'Freelance, consulting, one-person operation',  cost: '$500/mo',   modelType: 'solo_bootstrap',  monthlyCost: 500 },
  { value: 'agency',  label: 'Lean agency / service',  desc: 'Small team, service delivery model',           cost: '$3,000/mo', modelType: 'agency_service',  monthlyCost: 3000 },
  { value: 'product', label: 'Product build',           desc: 'SaaS, software, recurring revenue model',     cost: '$2,500/mo', modelType: 'saas_product',    monthlyCost: 2500 },
  { value: 'custom',  label: 'Custom',                  desc: 'I know my actual monthly operating cost',     cost: 'Enter below', modelType: 'solo_bootstrap', monthlyCost: 0 },
];

// ─── Income reliability presets ────────────────────────────────────────────

const RELIABILITY_PRESETS = [
  { val: 10, label: 'Stable retainers',          sub: 'Long-term contracts, recurring clients' },
  { val: 15, label: 'Mixed client work',          sub: 'Some retainers, some project-based' },
  { val: 20, label: 'Project-based',              sub: 'Milestone billing, variable contracts' },
  { val: 30, label: 'Early-stage / volatile',     sub: 'Unproven model, high uncertainty' },
];

// ─── Healthcare plan estimator (mirrors server) ───────────────────────────

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
        <input
          type="text" inputMode="numeric"
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={displayVal}
          onChange={handleChange}
          onBlur={field.onBlur}
          className="w-full pl-8 pr-4 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid={`input-${name}`}
        />
      </div>
      {note && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{note}</p>}
      {fieldState.error && <p className="text-xs text-destructive mt-1.5">{fieldState.error.message}</p>}
    </div>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────

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

// ─── Burn line item ────────────────────────────────────────────────────────

function BurnLine({ label, value, subtract = false, total = false }: {
  label: string; value: number; subtract?: boolean; total?: boolean;
}) {
  if (value === 0 && !total) return null;
  return (
    <div className={`flex items-center justify-between px-5 py-3.5 ${total ? 'bg-foreground/[0.04] border-t border-border' : 'border-b border-border last:border-0'}`}>
      <span className={`${total ? 'text-sm font-bold text-foreground' : 'text-sm text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm font-semibold ${total ? 'text-xl font-bold font-serif text-foreground' : subtract ? 'text-green-700' : 'text-foreground'}`}>
        {subtract ? `(${fmt(value)})` : fmt(value)}
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
      currentSalary: 0,
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

  // Healthcare derived values
  const adultsOnPlan = values.adultsOnPlan ?? 1;
  const dependentChildren = values.dependentChildren ?? 0;
  const currentPayrollHealthcare = values.currentPayrollHealthcare ?? 0;
  const estimatedPlan = estimatePlan(adultsOnPlan, dependentChildren);
  const overridePlan = values.healthcareCostOverride;
  const effectiveIndependentCost = (overridePlan && overridePlan > 0) ? overridePlan : estimatedPlan;
  const effectivePlan = values.healthcareType === 'partner' ? 0 : effectiveIndependentCost;
  const healthcareDelta = Math.max(0, effectivePlan - currentPayrollHealthcare);

  // Burn components
  const biz = businessChoice
    ? (businessChoice === 'custom' && values.businessCostOverride && values.businessCostOverride > 0
        ? values.businessCostOverride
        : BUSINESS_CHOICES.find(b => b.value === businessChoice)?.monthlyCost ?? 500)
    : 500;
  const seTax = Math.round((values.expectedRevenue ?? 0) * SE_TAX_RATE);
  const structuralBurn = Math.max(0,
    (values.monthlyDebtPayments ?? 0) + (values.livingExpenses ?? 0) + healthcareDelta - (values.isDualIncome ? (values.partnerIncome ?? 0) : 0)
  );
  const totalBurn = Math.max(0, structuralBurn + seTax + biz);

  // Capital with haircuts
  const accessibleCapital = Math.round(
    (values.cash ?? 0) * 1.00 +
    (values.brokerage ?? 0) * 0.80 +
    (values.roth ?? 0) * 1.00 +
    (values.traditional ?? 0) * 0.50 +
    (values.realEstate ?? 0) * 0.30
  );

  // Validation fields per screen
  const screenValidation: Partial<Record<number, (keyof SimulationFormValues)[]>> = {
    1: ['livingExpenses'],
    3: ['healthcareType'],
    10: [],
    11: ['expectedRevenue'],
    12: ['rampDuration'],
  };

  const next = async () => {
    const fields = screenValidation[screenIndex] ?? [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    if (screenIndex === 10 && businessChoice === null) return;
    setScreenIndex(i => Math.min(i + 1, SCREENS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setScreenIndex(i => Math.max(i - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = () => {
    const data = values;
    createSimulation.mutate({
      ...data,
      currentSalary: 0,
      breakevenMonths: (data.rampDuration || 0) + 3,
    }, {
      onSuccess: (result) => setLocation(`/results/${result.id}`),
      onError: (err) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
    });
  };

  // Progress (out of 12 input screens: 0-3, 5-8, 10-13)
  const INPUT_SCREEN_INDICES = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 13];
  const completedInputs = INPUT_SCREEN_INDICES.filter(i => i < screenIndex).length;
  const progress = (screenIndex / (SCREENS.length - 1)) * 100;

  const isSummary = screen.kind === 'summary';
  const isLastScreen = screenIndex === SCREENS.length - 1;

  return (
    <Layout>
      <div className="flex-1 flex flex-col bg-background">
        {/* Phase label bar */}
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
          {/* Progress bar */}
          <div className="h-0.5 bg-border">
            <div className="h-full bg-foreground transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg">

            <AnimatePresence mode="wait">
              <motion.div key={screenIndex}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22, ease: "easeOut" }}>

                {/* ── Screen: debt (0) ──────────────────────────────── */}
                {screenIndex === 0 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <div className="space-y-8">
                      <MoneyInput name="monthlyDebtPayments" control={control}
                        label="Combined monthly debt payments"
                        placeholder="1,800" autoFocus
                        note="Mortgage, student loans, car, credit cards — all required monthly minimums combined." />
                      <div>
                        <MoneyInput name="totalDebt" control={control}
                          label="Total outstanding debt balance" placeholder="0" optional />
                        <div className="mt-3 flex items-start gap-2 p-3 bg-muted/30 rounded-md border border-border max-w-sm">
                          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground">This does not affect monthly burn. It informs leverage and structural risk commentary only.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Screen: living cost (1) ──────────────────────── */}
                {screenIndex === 1 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <MoneyInput name="livingExpenses" control={control}
                      label="Monthly operating expenses"
                      placeholder="4,500" autoFocus
                      note="Exclude debt payments and healthcare — those are captured separately." />
                  </div>
                )}

                {/* ── Screen: household (2) ─────────────────────────── */}
                {screenIndex === 2 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <div className="space-y-6">
                      <div className="flex gap-3">
                        <button type="button"
                          onClick={() => { setValue("isDualIncome", false); setValue("partnerIncome", 0); }}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${!values.isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-single-income">
                          Single income
                        </button>
                        <button type="button"
                          onClick={() => setValue("isDualIncome", true)}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${values.isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-dual-income-yes">
                          Dual income
                        </button>
                      </div>
                      {values.isDualIncome && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                          <MoneyInput name="partnerIncome" control={control}
                            label="Partner net monthly income (after tax)"
                            placeholder="5,000" autoFocus
                            note="Only include what reliably flows toward shared household expenses." />
                        </motion.div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Screen: healthcare (3) ──────────────────────── */}
                {screenIndex === 3 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
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
                            note="What you pay now per paycheck — not the full employer premium." />
                          <div className="p-4 rounded-md border border-border bg-muted/20">
                            <div className="flex justify-between mb-1.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estimated independent plan cost</p>
                              <p className="text-base font-bold font-serif text-foreground" data-testid="text-estimated-plan">{fmt(estimatedPlan)}/mo</p>
                            </div>
                            <p className="text-xs text-muted-foreground mb-3">
                              {adultsOnPlan} adult{adultsOnPlan > 1 ? 's' : ''}{dependentChildren > 0 ? `, ${dependentChildren} child${dependentChildren > 1 ? 'ren' : ''}` : ''} on an independent plan.
                            </p>
                            <div className="flex justify-between pt-3 border-t border-border">
                              <p className="text-xs text-muted-foreground">Healthcare delta added to burn</p>
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
                                placeholder="600" note="Enter the monthly premium you would pay on your independent plan." />
                            </motion.div>
                          )}
                        </motion.div>
                      )}

                      {values.healthcareType === 'partner' && (
                        <div className="p-4 rounded-md border border-green-200 bg-green-50">
                          <p className="text-sm font-semibold text-green-700">Partner coverage eliminates the healthcare delta.</p>
                          <p className="text-xs text-green-700 mt-1">No healthcare cost will be added to your monthly structural burn.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Screen: burn summary (4) ─────────────────────── */}
                {screenIndex === 4 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 1 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">Your Structural Burn</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      This is your monthly structural burn — the cost your capital must cover from fixed obligations. Business costs and tax reserve are added in Phase 3.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-6">
                      <BurnLine label="Monthly debt service" value={values.monthlyDebtPayments ?? 0} />
                      <BurnLine label="Operating cost of living" value={values.livingExpenses ?? 0} />
                      <BurnLine label="Healthcare delta" value={healthcareDelta} />
                      {values.isDualIncome && values.partnerIncome > 0 && (
                        <BurnLine label="Partner income offset" value={values.partnerIncome ?? 0} subtract />
                      )}
                      <BurnLine label="Monthly Structural Burn" value={structuralBurn} total />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Continue to map your liquidity stack — the capital that covers this burn.
                    </p>
                  </div>
                )}

                {/* ── Screen: cash (5) ─────────────────────────────── */}
                {screenIndex === 5 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <MoneyInput name="cash" control={control}
                      label="Cash and HYSA balance"
                      placeholder="50,000" autoFocus note="Counted at 100% — fully liquid, no penalty, no tax event." />
                  </div>
                )}

                {/* ── Screen: brokerage (6) ────────────────────────── */}
                {screenIndex === 6 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <MoneyInput name="brokerage" control={control}
                      label="Taxable brokerage balance"
                      placeholder="0" autoFocus note="Counted at 80% — capital gains exposure and market timing risk applied." />
                  </div>
                )}

                {/* ── Screen: retirement (7) ───────────────────────── */}
                {screenIndex === 7 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <div className="space-y-7">
                      <MoneyInput name="roth" control={control}
                        label="Roth IRA — contributions portion"
                        placeholder="0" autoFocus note="Counted at 100% — principal contributions only, penalty-free." />
                      <MoneyInput name="traditional" control={control}
                        label="Traditional IRA / 401(k) balance"
                        placeholder="0" note="Counted at 50% — income tax liability and 10% early withdrawal penalty applied." />
                    </div>
                  </div>
                )}

                {/* ── Screen: home equity (8) ──────────────────────── */}
                {screenIndex === 8 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <MoneyInput name="realEstate" control={control}
                      label="Estimated home equity"
                      placeholder="0" autoFocus note="Counted at 30% — illiquid, transaction costs 6–10%, and timing risk." optional />
                  </div>
                )}

                {/* ── Screen: capital summary (9) ──────────────────── */}
                {screenIndex === 9 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 2 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">Your Accessible Capital</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      Haircuts reflect taxes, penalties, transaction costs, and timing risk. These are the conservative values the model will stress-test.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-3">
                      {[
                        { label: 'Cash & HYSA', raw: values.cash ?? 0, rate: 1.00, pct: '100%' },
                        { label: 'Brokerage (taxable)', raw: values.brokerage ?? 0, rate: 0.80, pct: '80%' },
                        { label: 'Roth IRA contributions', raw: values.roth ?? 0, rate: 1.00, pct: '100%' },
                        { label: 'Traditional IRA / 401(k)', raw: values.traditional ?? 0, rate: 0.50, pct: '50%' },
                        { label: 'Home equity', raw: values.realEstate ?? 0, rate: 0.30, pct: '30%' },
                      ].filter(r => r.raw > 0).map(r => (
                        <div key={r.label} className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-0">
                          <div>
                            <span className="text-sm text-muted-foreground">{r.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground/60">{r.pct}</span>
                          </div>
                          <span className="text-sm font-semibold text-foreground">{fmt(Math.round(r.raw * r.rate))}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-5 py-4 bg-foreground/[0.04] border-t border-border">
                        <span className="text-sm font-bold text-foreground">Total accessible capital</span>
                        <span className="text-xl font-bold font-serif text-foreground" data-testid="text-capital-preview">{fmt(accessibleCapital)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Liquidity is depleted in this order under stress: cash first, then brokerage, then retirement, then real estate.</p>
                  </div>
                )}

                {/* ── Screen: business model (10) ──────────────────── */}
                {screenIndex === 10 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
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
                          note="Tooling, software, contractors, workspace, marketing — recurring expenses." />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Screen: revenue (11) ─────────────────────────── */}
                {screenIndex === 11 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <MoneyInput name="expectedRevenue" control={control}
                      label="Expected monthly revenue once stable"
                      placeholder="8,000" autoFocus
                      note="The model runs this at -15% and -30% contraction scenarios automatically." />
                  </div>
                )}

                {/* ── Screen: ramp (12) ────────────────────────────── */}
                {screenIndex === 12 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
                    <div className="w-full max-w-sm">
                      <label className="block text-sm font-medium text-muted-foreground mb-2">Months until revenue stabilizes</label>
                      <div className="relative">
                        <input type="number" min="0" max="36" placeholder="6" autoFocus
                          value={values.rampDuration ?? ''}
                          onChange={(e) => setValue("rampDuration", parseInt(e.target.value) || 0, { shouldValidate: true })}
                          className="w-full px-4 pr-20 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid="input-rampDuration" />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">months</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">During ramp, the model applies 50% revenue realization. Add buffer.</p>
                    </div>
                  </div>
                )}

                {/* ── Screen: reliability (13) ─────────────────────── */}
                {screenIndex === 13 && (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">{screen.header}</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">{(screen as { subtext: string }).subtext}</p>
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

                {/* ── Screen: burn preview + submit (14) ──────────── */}
                {screenIndex === 14 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Phase 3 Complete</p>
                    <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">Review Before Running</h1>
                    <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                      Verify your complete monthly burn before running the stress model. Your accessible capital will be tested against this burn across four scenarios.
                    </p>
                    <div className="border border-border rounded-md overflow-hidden mb-6">
                      <div className="px-5 py-3 bg-muted/20 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Complete Monthly Burn Breakdown</p>
                      </div>
                      <BurnLine label="Monthly debt service" value={values.monthlyDebtPayments ?? 0} />
                      <BurnLine label="Operating cost of living" value={values.livingExpenses ?? 0} />
                      <BurnLine label="Healthcare delta" value={healthcareDelta} />
                      <BurnLine label="SE tax reserve (28%)" value={seTax} />
                      <BurnLine label="Business operating cost" value={biz} />
                      {values.isDualIncome && (values.partnerIncome ?? 0) > 0 && (
                        <BurnLine label="Partner income offset" value={values.partnerIncome ?? 0} subtract />
                      )}
                      <BurnLine label="True Monthly Burn" value={totalBurn} total />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="p-3.5 bg-muted/30 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Accessible capital</p>
                        <p className="text-base font-bold font-serif text-foreground">{fmt(accessibleCapital)}</p>
                      </div>
                      <div className="p-3.5 bg-muted/30 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground mb-1">Months until ramp complete</p>
                        <p className="text-base font-bold font-serif text-foreground">{values.rampDuration ?? 0} months</p>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="mt-10 flex items-center justify-between">
              <button type="button" onClick={back}
                className={`flex items-center gap-1.5 text-sm text-muted-foreground ${screenIndex === 0 ? 'invisible' : ''}`}
                data-testid="button-back">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              {!isLastScreen ? (
                <Button type="button" onClick={next}
                  disabled={screenIndex === 10 && businessChoice === null}
                  data-testid="button-next">
                  {isSummary ? (screenIndex === 4 ? 'Continue to Liquidity' : screenIndex === 9 ? 'Continue to Income Plan' : 'Continue') : 'Continue'}
                </Button>
              ) : (
                <Button type="button"
                  disabled={createSimulation.isPending}
                  onClick={onSubmit}
                  data-testid="button-submit">
                  {createSimulation.isPending ? 'Running stress test...' : 'Run Stress Test'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
