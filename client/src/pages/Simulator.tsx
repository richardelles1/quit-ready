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

// ─── Step config ───────────────────────────────────────────────────────────
const TOTAL_STEPS = 11;

const STEP_META: Record<number, { header: string; framing: string }> = {
  1:  { header: "Let's start with your lifestyle costs.",
        framing: "Enter everything you spend monthly that is not debt or healthcare — rent, food, utilities, insurance, childcare, subscriptions, discretionary." },
  2:  { header: "Now, your household structure.",
        framing: "A partner's stable income directly reduces your monthly independence burn. Include it only if it's consistent and dependable." },
  3:  { header: "Monthly debt obligations.",
        framing: "These are payments that continue regardless of your employment status. Your total balance is optional — it's used only for structural risk context, not burn." },
  4:  { header: "Healthcare is usually the biggest delta.",
        framing: "We'll estimate your independent plan cost based on your household size and what you currently pay. You can override the estimate." },
  5:  { header: "Now: the capital you can actually reach.",
        framing: "Fully liquid — no penalty, no tax event. Include checking, savings, money market, and high-yield savings." },
  6:  { header: "Let's include what you could tap if needed.",
        framing: "These assets carry conservative haircuts to account for taxes, penalties, and timing risk." },
  7:  { header: "Now let's model what comes next.",
        framing: "Your business structure determines baseline operating costs, which feed directly into your burn rate." },
  8:  { header: "Let's pressure-test your revenue.",
        framing: "Use a conservative stable-state target. The simulator stress-tests this at -15% and -30% scenarios automatically." },
  9:  { header: "Most transitions take longer than planned.",
        framing: "During ramp, the model applies a 50% revenue realization factor. Add buffer — if you think 3 months, model 6." },
  10: { header: "How reliable is this income?",
        framing: "Retainers and contracts: 10–15%. Mixed client work: 15–20%. Project-based or early-stage: 20–30%." },
  11: { header: "Review your burn before running the model.",
        framing: "This is your True Monthly Independence Burn — the amount your capital must cover each month. Review it before submitting." },
};

const HEALTHCARE_OPTIONS = [
  { value: 'partner', label: 'Covered by partner plan', note: 'No additional cost to you' },
  { value: 'aca',     label: 'ACA marketplace',         note: 'Income-dependent subsidies available' },
  { value: 'cobra',   label: 'COBRA continuation',      note: 'Time-limited to 18 months' },
  { value: 'employer',label: 'Employer plan retained',  note: 'During severance or notice period' },
  { value: 'none',    label: 'No coverage (self-pay)',  note: 'All medical costs out-of-pocket' },
];

type BusinessChoice = 'solo' | 'agency' | 'product' | 'custom';
const BUSINESS_CHOICES: { value: BusinessChoice; label: string; desc: string; cost: string; modelType: string; monthlyCost: number }[] = [
  { value: 'solo',    label: 'Solo bootstrap',       desc: 'Freelance, consulting, one-person',       cost: '$500/mo',   modelType: 'solo_bootstrap',  monthlyCost: 500 },
  { value: 'agency',  label: 'Lean agency / service', desc: 'Small team, service delivery',           cost: '$3,000/mo', modelType: 'agency_service',  monthlyCost: 3000 },
  { value: 'product', label: 'Product build',         desc: 'SaaS, software, recurring revenue',      cost: '$2,500/mo', modelType: 'saas_product',    monthlyCost: 2500 },
  { value: 'custom',  label: 'Custom',                desc: 'I know my monthly operating cost',       cost: 'Enter below', modelType: 'solo_bootstrap', monthlyCost: 0 },
];

const SE_TAX_RATE = 0.28;

// ─── Healthcare estimate (mirrors server logic) ────────────────────────────
function estimatePlan(adults: number, children: number): number {
  let base: number;
  if (adults === 2 && children >= 1) base = 1500 + children * 300;
  else if (adults === 1 && children >= 1) base = 1200 + children * 250;
  else if (adults === 2) base = 1100;
  else base = 600;
  return Math.min(base, 3000);
}

// ─── Formatted money input ─────────────────────────────────────────────────
function MoneyInput({
  name, control, label, placeholder = "", note, autoFocus = false, optional = false,
}: {
  name: keyof SimulationFormValues;
  control: Control<SimulationFormValues>;
  label?: string;
  placeholder?: string;
  note?: string;
  autoFocus?: boolean;
  optional?: boolean;
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
          {label}
          {optional && <span className="ml-2 text-xs opacity-60">optional</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/50 font-medium select-none">$</span>
        <input
          type="text"
          inputMode="numeric"
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

// ─── Stepper button ────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0, max = 10, label }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; label?: string;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-muted-foreground mb-3">{label}</label>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-10 h-10 rounded-md border border-border text-xl font-bold flex items-center justify-center disabled:opacity-30"
        >−</button>
        <span className="text-2xl font-bold font-serif w-8 text-center text-foreground">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-10 h-10 rounded-md border border-border text-xl font-bold flex items-center justify-center disabled:opacity-30"
        >+</button>
      </div>
    </div>
  );
}

// ─── Burn summary helper ───────────────────────────────────────────────────
function computeClientBurn(values: SimulationFormValues, businessChoice: BusinessChoice | null): {
  lifestyle: number; debt: number; healthcareDelta: number; seTax: number;
  businessCost: number; partnerOffset: number; tmib: number;
  estimatedPlan: number;
} {
  const { livingExpenses, monthlyDebtPayments, isDualIncome, partnerIncome,
    healthcareType, adultsOnPlan, dependentChildren, currentPayrollHealthcare,
    healthcareCostOverride, expectedRevenue, businessCostOverride } = values;

  const estimatedPlan = estimatePlan(adultsOnPlan ?? 1, dependentChildren ?? 0);
  const independentPlan = (healthcareCostOverride && healthcareCostOverride > 0)
    ? healthcareCostOverride
    : estimatedPlan;
  const effectivePlan = healthcareType === 'partner' ? 0 : independentPlan;
  const healthcareDelta = Math.max(0, effectivePlan - (currentPayrollHealthcare ?? 0));

  const bizChoice = BUSINESS_CHOICES.find(b => b.value === businessChoice);
  const businessCost = (businessChoice === 'custom' && businessCostOverride && businessCostOverride > 0)
    ? businessCostOverride
    : (bizChoice?.monthlyCost ?? 500);

  const seTax = Math.round((expectedRevenue ?? 0) * SE_TAX_RATE);
  const partnerOffset = isDualIncome ? (partnerIncome ?? 0) : 0;

  const tmib = Math.max(0,
    (livingExpenses ?? 0) +
    (monthlyDebtPayments ?? 0) +
    healthcareDelta +
    seTax +
    businessCost -
    partnerOffset
  );

  return {
    lifestyle: livingExpenses ?? 0,
    debt: monthlyDebtPayments ?? 0,
    healthcareDelta,
    seTax,
    businessCost,
    partnerOffset,
    tmib,
    estimatedPlan,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────
export default function Simulator() {
  return (
    <ErrorBoundary>
      <SimulatorInner />
    </ErrorBoundary>
  );
}

function SimulatorInner() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [businessChoice, setBusinessChoice] = useState<BusinessChoice | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const { control, handleSubmit, watch, setValue, trigger } = form;
  const values = watch();

  const stepValidationFields: Record<number, (keyof SimulationFormValues)[]> = {
    1:  ['livingExpenses'],
    2:  values.isDualIncome ? ['partnerIncome'] : [],
    3:  [],
    4:  ['healthcareType', 'currentPayrollHealthcare'],
    5:  [],
    6:  [],
    7:  [],
    8:  ['expectedRevenue'],
    9:  ['rampDuration'],
    10: ['volatilityPercent'],
    11: [],
  };

  const next = async () => {
    const fields = stepValidationFields[step] || [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    if (step === 7 && businessChoice === null) return;
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = () => {
    const data = values;
    const payload = {
      ...data,
      currentSalary: 0,
      breakevenMonths: (data.rampDuration || 0) + 3,
    };
    createSimulation.mutate(payload, {
      onSuccess: (result) => setLocation(`/results/${result.id}`),
      onError: (err) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
    });
  };

  const isDualIncome = values.isDualIncome;
  const healthcareType = values.healthcareType;
  const adultsOnPlan = values.adultsOnPlan ?? 1;
  const dependentChildren = values.dependentChildren ?? 0;
  const currentPayrollHealthcare = values.currentPayrollHealthcare ?? 0;
  const healthcareCostOverride = values.healthcareCostOverride;

  const estimatedPlan = estimatePlan(adultsOnPlan, dependentChildren);
  const effectiveIndependentCost = (healthcareCostOverride && healthcareCostOverride > 0)
    ? healthcareCostOverride : estimatedPlan;
  const effectivePlan = healthcareType === 'partner' ? 0 : effectiveIndependentCost;
  const healthcareDelta = Math.max(0, effectivePlan - currentPayrollHealthcare);

  const burn = computeClientBurn(values, businessChoice);

  const { header, framing } = STEP_META[step];
  const progress = Math.round((step / TOTAL_STEPS) * 100);
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

  return (
    <Layout>
      <div className="flex-1 flex flex-col bg-background">
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-border">
          <div className="h-full bg-foreground transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg">

            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-8" data-testid="text-step-counter">
              Step {step} of {TOTAL_STEPS}
            </p>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">
                  {header}
                </h1>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed max-w-md">{framing}</p>

                {/* ── Step 1 — Lifestyle expenses ─────────────────── */}
                {step === 1 && (
                  <div>
                    <p className="text-base font-semibold text-foreground mb-4">
                      What do you spend per month, excluding debt and healthcare?
                    </p>
                    <MoneyInput
                      name="livingExpenses" control={control}
                      placeholder="4,500" autoFocus
                      note="Include rent (if not mortgage), utilities, food, non-health insurance, childcare, subscriptions, and discretionary."
                    />
                  </div>
                )}

                {/* ── Step 2 — Household structure ────────────────── */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <p className="text-base font-semibold text-foreground mb-4">Household income structure</p>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => { setValue("isDualIncome", false); setValue("partnerIncome", 0); }}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${!isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-single-income">
                          Single income
                        </button>
                        <button type="button" onClick={() => setValue("isDualIncome", true)}
                          className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                          data-testid="button-dual-income-yes">
                          Dual income
                        </button>
                      </div>
                    </div>

                    {isDualIncome && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <MoneyInput
                          name="partnerIncome" control={control}
                          label="Partner net monthly income contributing to household"
                          placeholder="5,000" autoFocus
                          note="After tax. Only include what reliably flows toward shared household expenses."
                        />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Step 3 — Debt ───────────────────────────────── */}
                {step === 3 && (
                  <div className="space-y-8">
                    <div>
                      <p className="text-base font-semibold text-foreground mb-4">
                        What are your required monthly debt payments?
                      </p>
                      <MoneyInput
                        name="monthlyDebtPayments" control={control}
                        placeholder="1,800" autoFocus
                        note="Combined required minimums — mortgage, student loans, car, credit cards, anything with a mandatory monthly payment."
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">
                        Total outstanding debt balance
                        <span className="ml-2 text-xs font-normal text-muted-foreground opacity-70">optional — risk context only</span>
                      </p>
                      <MoneyInput
                        name="totalDebt" control={control}
                        placeholder="0" optional
                      />
                      <div className="mt-3 flex items-start gap-2 p-3 bg-muted/30 rounded-md border border-border">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground">
                          This does not affect monthly burn. It informs leverage and structural risk commentary.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 4 — Healthcare ─────────────────────────── */}
                {step === 4 && (
                  <div className="space-y-6">
                    {/* Coverage type */}
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-3">What happens to your coverage when you quit?</p>
                      <div className="space-y-2">
                        {HEALTHCARE_OPTIONS.map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setValue("healthcareType", opt.value as SimulationFormValues['healthcareType'], { shouldValidate: true })}
                            className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-md border transition-all ${healthcareType === opt.value ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                            data-testid={`option-healthcare-${opt.value}`}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.note}</p>
                            </div>
                            {healthcareType === opt.value && <Check className="w-4 h-4 shrink-0 ml-3" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dependent sizing (not shown if partner) */}
                    {healthcareType && healthcareType !== 'partner' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 border-t border-border pt-5">
                        <div className="grid grid-cols-2 gap-6">
                          <Stepper
                            label="Adults on plan"
                            value={adultsOnPlan} min={1} max={2}
                            onChange={(v) => setValue("adultsOnPlan", v)}
                          />
                          <Stepper
                            label="Dependent children"
                            value={dependentChildren} min={0} max={6}
                            onChange={(v) => setValue("dependentChildren", v)}
                          />
                        </div>

                        <MoneyInput
                          name="currentPayrollHealthcare" control={control}
                          label="Current monthly healthcare payroll deduction"
                          placeholder="0"
                          note="What you pay now out of each paycheck — not the full premium."
                        />

                        {/* Auto-estimate display */}
                        <div className="p-4 rounded-md border border-border bg-muted/30">
                          <div className="flex items-start justify-between gap-4 mb-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Estimated independent plan cost
                            </p>
                            <p className="text-base font-bold font-serif text-foreground shrink-0"
                               data-testid="text-estimated-plan">{fmt(estimatedPlan)}/mo</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Based on {adultsOnPlan} adult{adultsOnPlan > 1 ? 's' : ''}{dependentChildren > 0 ? ` and ${dependentChildren} child${dependentChildren > 1 ? 'ren' : ''}` : ''} on an independent plan.
                          </p>

                          {/* Healthcare delta preview */}
                          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Healthcare delta (added to burn)</p>
                            <p className="text-sm font-bold text-foreground" data-testid="text-healthcare-delta">{fmt(healthcareDelta)}/mo</p>
                          </div>
                        </div>

                        {/* Override toggle */}
                        <div>
                          <button type="button"
                            onClick={() => {
                              setShowHealthcareOverride(v => !v);
                              if (showHealthcareOverride) setValue("healthcareCostOverride", null);
                            }}
                            className="text-sm text-foreground underline underline-offset-2 opacity-60"
                            data-testid="button-healthcare-override">
                            {showHealthcareOverride ? 'Use estimated cost' : 'Override estimated cost'}
                          </button>
                          {showHealthcareOverride && (
                            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                              <MoneyInput
                                name="healthcareCostOverride" control={control}
                                label="Your actual independent plan cost (monthly)"
                                placeholder="600"
                                note="Enter the monthly premium you would actually pay on your independent plan."
                              />
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {healthcareType === 'partner' && (
                      <div className="p-4 rounded-md border border-green-200 bg-green-50">
                        <p className="text-sm font-semibold text-green-700">Partner coverage reduces healthcare exposure.</p>
                        <p className="text-xs text-green-700 mt-1">No healthcare delta will be added to your monthly burn.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 5 — Cash ───────────────────────────────── */}
                {step === 5 && (
                  <div>
                    <p className="text-base font-semibold text-foreground mb-4">
                      How much cash and HYSA do you have right now?
                    </p>
                    <MoneyInput name="cash" control={control} placeholder="50,000" autoFocus
                      note="Counted at 100% — fully liquid, no penalty, no tax event." />
                  </div>
                )}

                {/* ── Step 6 — Investments ────────────────────────── */}
                {step === 6 && (
                  <div className="space-y-8">
                    <div>
                      <p className="text-base font-semibold text-foreground mb-4">
                        Taxable brokerage account balance?
                      </p>
                      <MoneyInput name="brokerage" control={control} placeholder="0" autoFocus
                        note="Counted at 80% — capital gains and market timing risk applied." />
                    </div>

                    <button type="button"
                      onClick={() => setShowAdvanced(v => !v)}
                      className="text-sm text-foreground underline underline-offset-2 opacity-60"
                      data-testid="button-toggle-advanced">
                      {showAdvanced ? 'Hide retirement and home equity' : '+ Include retirement accounts and home equity'}
                    </button>

                    {showAdvanced && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <MoneyInput name="roth" control={control}
                          label="Roth IRA contributions (penalty-free portion)"
                          placeholder="0" note="Counted at 100% — contributions only, no tax or penalty on withdrawal." />
                        <MoneyInput name="traditional" control={control}
                          label="Traditional IRA / 401(k) balance"
                          placeholder="0" note="Counted at 50% — income tax and 10% early withdrawal penalty applied." />
                        <MoneyInput name="realEstate" control={control}
                          label="Home equity (estimated)"
                          placeholder="0" note="Counted at 30% — illiquid, transaction costs, and market timing risk." />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Step 7 — Business model ─────────────────────── */}
                {step === 7 && (
                  <div className="space-y-4">
                    <p className="text-base font-semibold text-foreground mb-4">What best describes your planned work structure?</p>
                    <div className="space-y-2">
                      {BUSINESS_CHOICES.map(opt => {
                        const selected = businessChoice === opt.value;
                        return (
                          <button key={opt.value} type="button"
                            onClick={() => {
                              setBusinessChoice(opt.value);
                              setValue("businessModelType", opt.modelType as SimulationFormValues['businessModelType']);
                              if (opt.value !== 'custom') setValue("businessCostOverride", null);
                            }}
                            className={`w-full text-left flex items-center justify-between px-5 py-4 rounded-md border transition-all ${selected ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                            data-testid={`option-model-${opt.value}`}>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground ml-3 shrink-0">{opt.cost}</span>
                          </button>
                        );
                      })}
                    </div>
                    {businessChoice === 'custom' && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
                        <MoneyInput name="businessCostOverride" control={control}
                          label="Monthly business operating cost"
                          placeholder="2,000"
                          note="Tooling, software, contractors, workspace, marketing — recurring operating expenses." />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* ── Step 8 — Revenue ────────────────────────────── */}
                {step === 8 && (
                  <div>
                    <p className="text-base font-semibold text-foreground mb-4">
                      What monthly revenue do you expect once stable?
                    </p>
                    <MoneyInput name="expectedRevenue" control={control}
                      placeholder="8,000" autoFocus
                      note="Your steady-state target — not your launch number. The model stress-tests this at -15% and -30%." />
                  </div>
                )}

                {/* ── Step 9 — Ramp ───────────────────────────────── */}
                {step === 9 && (
                  <div>
                    <p className="text-base font-semibold text-foreground mb-4">
                      How many months until revenue reaches that level?
                    </p>
                    <div className="w-full max-w-sm">
                      <div className="relative">
                        <input
                          type="number" min="0" max="36"
                          placeholder="6"
                          autoFocus
                          value={values.rampDuration ?? ''}
                          onChange={(e) => setValue("rampDuration", parseInt(e.target.value) || 0, { shouldValidate: true })}
                          className="w-full px-4 pr-20 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid="input-rampDuration"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">months</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">During ramp, the engine applies a 50% revenue realization factor. If unsure, add buffer.</p>
                    </div>
                  </div>
                )}

                {/* ── Step 10 — Volatility ────────────────────────── */}
                {step === 10 && (
                  <div>
                    <p className="text-base font-semibold text-foreground mb-4">
                      What level of monthly revenue variance do you expect?
                    </p>
                    <div className="w-full max-w-sm mb-6">
                      <div className="relative">
                        <input
                          type="number" min="10" max="30" step="1"
                          value={values.volatilityPercent ?? 15}
                          onChange={(e) => setValue("volatilityPercent", parseInt(e.target.value) || 15, { shouldValidate: true })}
                          className="w-full px-4 pr-12 py-3.5 text-right border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                          data-testid="input-volatilityPercent"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { val: 10, label: 'Stable contracts / retainers' },
                        { val: 15, label: 'Mixed client work' },
                        { val: 20, label: 'Project-based billing' },
                        { val: 30, label: 'Unpredictable / early stage' },
                      ].map(h => (
                        <button key={h.val} type="button"
                          onClick={() => setValue("volatilityPercent", h.val, { shouldValidate: true })}
                          className={`text-left p-3 rounded-md border text-xs transition-all ${values.volatilityPercent === h.val ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                          data-testid={`preset-vol-${h.val}`}>
                          <span className="block font-semibold text-foreground">{h.val}%</span>
                          <span className="text-muted-foreground">{h.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 11 — Burn preview & confirm ────────────── */}
                {step === 11 && (
                  <div>
                    <div className="border border-border rounded-md overflow-hidden mb-6">
                      <div className="bg-muted/30 px-5 py-3 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Monthly Burn Breakdown</p>
                      </div>
                      <div className="divide-y divide-border">
                        {[
                          { label: 'Lifestyle expenses', value: burn.lifestyle, subtract: false },
                          { label: 'Monthly debt payments', value: burn.debt, subtract: false },
                          { label: 'Healthcare delta', value: burn.healthcareDelta, subtract: false },
                          { label: 'SE tax reserve (28%)', value: burn.seTax, subtract: false },
                          { label: 'Business operating cost', value: burn.businessCost, subtract: false },
                          ...(burn.partnerOffset > 0 ? [{ label: 'Partner income offset', value: burn.partnerOffset, subtract: true }] : []),
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between px-5 py-3.5">
                            <span className="text-sm text-muted-foreground">{row.label}</span>
                            <span className={`text-sm font-semibold ${row.subtract ? 'text-green-700' : 'text-foreground'}`}>
                              {row.subtract ? `(${fmt(row.value)})` : fmt(row.value)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-5 py-4 bg-foreground/[0.04]">
                          <span className="text-sm font-bold text-foreground">True Monthly Burn</span>
                          <span className="text-xl font-bold font-serif text-foreground" data-testid="text-burn-preview">{fmt(burn.tmib)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                      This is the monthly amount your capital must cover. Verify these numbers before running the stress model.
                      Your accessible capital will be stress-tested against this burn across four scenarios.
                    </p>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="mt-10 flex items-center justify-between">
              <button type="button" onClick={back}
                className={`flex items-center gap-1.5 text-sm text-muted-foreground ${step === 1 ? 'invisible' : ''}`}
                data-testid="button-back">
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={next}
                  disabled={step === 7 && businessChoice === null}
                  data-testid="button-next">
                  Continue
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
