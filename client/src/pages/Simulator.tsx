import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import Layout from "../components/Layout";
import ErrorBoundary from "../components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { simulationFormSchema, SimulationFormValues, useCreateSimulation } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Info } from "lucide-react";

// ─── Step definitions ──────────────────────────────────────────────────────
const TOTAL_STEPS = 10;

const STEP_META: Record<number, { header: string; framing: string }> = {
  1:  { header: "Let's start with your foundation.",
        framing: "Most people underestimate transition costs. Conservative inputs help you trust the output." },
  2:  { header: "Now, your household baseline.",
        framing: "A partner's stable income materially reduces your independence burn — include it if consistent and dependable." },
  3:  { header: "Next: obligations that don't disappear.",
        framing: "Mortgage, car loans, student debt — any payment that continues regardless of your employment status." },
  4:  { header: "Healthcare is usually the biggest delta.",
        framing: "For most people, leaving employment adds $500–$1,500/month in new costs. This is modeled automatically." },
  5:  { header: "Now: the capital you can actually reach.",
        framing: "This is your most defensible capital — liquid, no penalty, no tax event." },
  6:  { header: "Let's include what you could tap if needed.",
        framing: "These assets carry haircuts. Brokerage at 80%, retirement accounts at 50%, real estate at 30%." },
  7:  { header: "Now let's model what comes next.",
        framing: "Your business structure determines baseline operating costs. The model uses these to calculate true burn." },
  8:  { header: "Let's pressure-test your revenue expectations.",
        framing: "The simulator stress-tests this number at -15% and -30% scenarios automatically. Use a conservative estimate." },
  9:  { header: "Most transitions take longer than planned.",
        framing: "During ramp, the model applies a 50% revenue realization factor — accounting for slow starts and pipeline gaps." },
  10: { header: "Last question: how reliable is this income?",
        framing: "Project-based work typically swings 20–30%. Retainers or contracts: 10–15%." },
};

const HEALTHCARE_OPTIONS = [
  { value: 'partner', label: 'Covered by partner plan', note: 'No additional cost to you', cost: null },
  { value: 'aca',     label: 'ACA marketplace',         note: 'Income-dependent subsidies available', cost: '$600/mo estimated' },
  { value: 'cobra',   label: 'COBRA continuation',      note: 'Time-limited to 18 months', cost: '$850/mo estimated' },
  { value: 'employer',label: 'Employer plan retained',  note: 'During severance or notice period', cost: '$0' },
  { value: 'none',    label: 'No coverage (self-pay)',  note: 'All medical costs fully out-of-pocket', cost: 'High risk' },
];

type BusinessChoice = 'solo' | 'agency' | 'product' | 'custom';
const BUSINESS_CHOICES: { value: BusinessChoice; label: string; desc: string; cost: string; modelType: string }[] = [
  { value: 'solo',    label: 'Solo bootstrap',       desc: 'Freelance, consulting, one-person operation', cost: '$500/mo',   modelType: 'solo_bootstrap' },
  { value: 'agency',  label: 'Lean agency / service', desc: 'Small team, service delivery',               cost: '$3,000/mo', modelType: 'agency_service' },
  { value: 'product', label: 'Product build',         desc: 'SaaS, software, recurring revenue model',    cost: '$2,500/mo', modelType: 'saas_product' },
  { value: 'custom',  label: 'Custom',                desc: 'I know my monthly operating cost',           cost: 'Enter cost', modelType: 'solo_bootstrap' },
];

// ─── Shared input primitives ───────────────────────────────────────────────
function CurrencyInput({
  label, placeholder = "0", name, register, error, autoFocus = false,
}: {
  label?: string; placeholder?: string; name: string;
  register: ReturnType<typeof useForm<SimulationFormValues>>['register'];
  error?: string; autoFocus?: boolean;
}) {
  return (
    <div className="w-full max-w-sm">
      {label && <label className="block text-sm font-medium text-muted-foreground mb-2">{label}</label>}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/60 font-medium">$</span>
        <input
          type="number" min="0" step="1"
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-8 pr-4 py-3.5 border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          data-testid={`input-${name}`}
          {...register(name as keyof SimulationFormValues)}
        />
      </div>
      {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
    </div>
  );
}

function NumInput({
  label, suffix, name, min, max, placeholder = "0", register, error, autoFocus = false,
}: {
  label?: string; suffix?: string; name: string; min?: number; max?: number; placeholder?: string;
  register: ReturnType<typeof useForm<SimulationFormValues>>['register'];
  error?: string; autoFocus?: boolean;
}) {
  return (
    <div className="w-full max-w-sm">
      {label && <label className="block text-sm font-medium text-muted-foreground mb-2">{label}</label>}
      <div className="relative">
        <input
          type="number" min={min} max={max} step="1"
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full px-4 py-3.5 border border-input rounded-md bg-background text-foreground text-lg font-medium focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid={`input-${name}`}
          {...register(name as keyof SimulationFormValues)}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{suffix}</span>
        )}
      </div>
      {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
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
      healthcareType: undefined as unknown as 'employer',
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

  const { register, handleSubmit, watch, setValue, formState: { errors }, trigger } = form;
  const isDualIncome = watch("isDualIncome");
  const healthcareType = watch("healthcareType");

  // Per-step validation fields
  const stepValidationFields: Record<number, (keyof SimulationFormValues)[]> = {
    1:  ['livingExpenses'],
    2:  isDualIncome ? ['partnerIncome'] : [],
    3:  ['totalDebt', 'monthlyDebtPayments'],
    4:  ['healthcareType'],
    5:  ['cash'],
    6:  ['brokerage'],
    7:  ['businessModelType'],
    8:  ['expectedRevenue'],
    9:  ['rampDuration'],
    10: ['volatilityPercent'],
  };

  const next = async () => {
    const fields = stepValidationFields[step] || [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = (data: SimulationFormValues) => {
    // Set breakevenMonths based on rampDuration if not set
    const payload = {
      ...data,
      currentSalary: 0,
      breakevenMonths: data.rampDuration ? data.rampDuration + 3 : 3,
    };
    createSimulation.mutate(payload, {
      onSuccess: (result) => setLocation(`/results/${result.id}`),
      onError: (err) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
    });
  };

  const selectHealthcare = (value: string) => {
    setValue("healthcareType", value as SimulationFormValues['healthcareType'], { shouldValidate: true });
  };

  const selectBusiness = (choice: BusinessChoice) => {
    setBusinessChoice(choice);
    const found = BUSINESS_CHOICES.find(b => b.value === choice);
    if (found) {
      setValue("businessModelType", found.modelType as SimulationFormValues['businessModelType']);
      if (choice !== 'custom') setValue("businessCostOverride", null);
    }
  };

  const { header, framing } = STEP_META[step];
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <Layout>
      <div className="flex-1 flex flex-col bg-background">
        {/* Progress bar */}
        <div className="w-full h-0.5 bg-border">
          <div
            className="h-full bg-foreground transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg">

            {/* Step counter */}
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
                {/* Header */}
                <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground mb-3 leading-tight">
                  {header}
                </h1>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed max-w-md">
                  {framing}
                </p>

                {/* ── Step content ──────────────────────────────────── */}

                {/* Step 1 — Living expenses */}
                {step === 1 && (
                  <div className="space-y-4">
                    <label className="block text-base font-semibold text-foreground mb-3">
                      What does your life cost each month?
                    </label>
                    <CurrencyInput name="livingExpenses" register={register} error={errors.livingExpenses?.message} autoFocus placeholder="4,500" />
                    <p className="text-xs text-muted-foreground">Include rent or mortgage, food, utilities, insurance, transportation, and subscriptions.</p>
                  </div>
                )}

                {/* Step 2 — Partner income */}
                {step === 2 && (
                  <div className="space-y-6">
                    <label className="block text-base font-semibold text-foreground mb-3">
                      Does a partner contribute stable income to this household?
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setValue("isDualIncome", true)}
                        className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                        data-testid="button-dual-income-yes"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => { setValue("isDualIncome", false); setValue("partnerIncome", 0); }}
                        className={`flex-1 py-3.5 rounded-md border text-sm font-semibold transition-colors ${!isDualIncome ? 'bg-foreground text-background border-foreground' : 'border-border text-foreground'}`}
                        data-testid="button-dual-income-no"
                      >
                        No
                      </button>
                    </div>
                    {isDualIncome && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-4">
                        <label className="block text-sm font-semibold text-foreground mb-3">
                          Partner net monthly income (after tax)
                        </label>
                        <CurrencyInput name="partnerIncome" register={register} error={errors.partnerIncome?.message} autoFocus placeholder="5,000" />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Step 3 — Debt */}
                {step === 3 && (
                  <div className="space-y-8">
                    <div>
                      <label className="block text-base font-semibold text-foreground mb-3">
                        What total debt balance would continue after you leave?
                      </label>
                      <CurrencyInput name="totalDebt" register={register} error={errors.totalDebt?.message} autoFocus placeholder="180,000" />
                    </div>
                    <div>
                      <label className="block text-base font-semibold text-foreground mb-3">
                        What are your required monthly debt payments?
                      </label>
                      <CurrencyInput name="monthlyDebtPayments" register={register} error={errors.monthlyDebtPayments?.message} placeholder="1,800" />
                      <p className="text-xs text-muted-foreground mt-2">Combined total — mortgage, loans, credit cards, anything with a required minimum.</p>
                    </div>
                  </div>
                )}

                {/* Step 4 — Healthcare */}
                {step === 4 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-4">
                      What happens to your health coverage when you quit?
                    </label>
                    <div className="space-y-2">
                      {HEALTHCARE_OPTIONS.map(opt => {
                        const selected = healthcareType === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => selectHealthcare(opt.value)}
                            className={`w-full text-left flex items-center justify-between px-5 py-4 rounded-md border transition-all ${selected ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                            data-testid={`option-healthcare-${opt.value}`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.note}</p>
                            </div>
                            {opt.cost && (
                              <span className={`text-xs font-medium shrink-0 ml-3 ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {opt.cost}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.healthcareType && (
                      <p className="text-xs text-destructive mt-2">Please select a healthcare option.</p>
                    )}
                    {healthcareType && !['partner', 'employer'].includes(healthcareType) && (
                      <div className="mt-4 flex items-start gap-2 p-3.5 bg-muted/40 rounded-md border border-border">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The estimated cost for your selection will be added to your True Monthly Independence Burn (TMIB) automatically.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5 — Cash */}
                {step === 5 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-3">
                      How much cash and HYSA do you have right now?
                    </label>
                    <CurrencyInput name="cash" register={register} error={errors.cash?.message} autoFocus placeholder="50,000" />
                    <p className="text-xs text-muted-foreground mt-2">Checking, savings, money market, high-yield savings — fully liquid with no penalty.</p>
                  </div>
                )}

                {/* Step 6 — Investments */}
                {step === 6 && (
                  <div className="space-y-8">
                    <div>
                      <label className="block text-base font-semibold text-foreground mb-3">
                        Taxable brokerage account balance?
                      </label>
                      <CurrencyInput name="brokerage" register={register} error={errors.brokerage?.message} autoFocus placeholder="0" />
                      <p className="text-xs text-muted-foreground mt-2">Counted at 80% — capital gains and market timing risk applied.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAdvanced(v => !v)}
                      className="text-sm text-foreground underline underline-offset-2 opacity-60"
                      data-testid="button-toggle-advanced"
                    >
                      {showAdvanced ? 'Hide additional accounts' : '+ Include retirement accounts and home equity'}
                    </button>

                    {showAdvanced && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-2">Roth IRA contributions (withdrawable portion)</label>
                          <CurrencyInput name="roth" register={register} placeholder="0" />
                          <p className="text-xs text-muted-foreground mt-1">Counted at 100% — contributions only, penalty-free.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-2">Traditional IRA / 401(k) balance</label>
                          <CurrencyInput name="traditional" register={register} placeholder="0" />
                          <p className="text-xs text-muted-foreground mt-1">Counted at 50% — tax liability and 10% early withdrawal penalty applied.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-2">Home equity (estimated)</label>
                          <CurrencyInput name="realEstate" register={register} placeholder="0" />
                          <p className="text-xs text-muted-foreground mt-1">Counted at 30% — illiquid, transaction costs, and market timing risk.</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Step 7 — Business model */}
                {step === 7 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-4">
                      What best describes your planned work structure?
                    </label>
                    <div className="space-y-2 mb-6">
                      {BUSINESS_CHOICES.map(opt => {
                        const selected = businessChoice === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => selectBusiness(opt.value)}
                            className={`w-full text-left flex items-center justify-between px-5 py-4 rounded-md border transition-all ${selected ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                            data-testid={`option-model-${opt.value}`}
                          >
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
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <label className="block text-sm font-semibold text-foreground mb-2">Monthly business operating cost</label>
                        <CurrencyInput name="businessCostOverride" register={register} placeholder="2,000" />
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Step 8 — Expected revenue */}
                {step === 8 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-3">
                      What monthly revenue do you expect once you're stable?
                    </label>
                    <CurrencyInput name="expectedRevenue" register={register} error={errors.expectedRevenue?.message} autoFocus placeholder="8,000" />
                    <p className="text-xs text-muted-foreground mt-2">
                      This is your steady-state target — not your launch number. The stress test will run this at -15% and -30%.
                    </p>
                  </div>
                )}

                {/* Step 9 — Ramp */}
                {step === 9 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-3">
                      How many months until revenue reaches that level?
                    </label>
                    <NumInput name="rampDuration" suffix="months" register={register} error={errors.rampDuration?.message} autoFocus placeholder="6" min={0} />
                    <p className="text-xs text-muted-foreground mt-2">
                      Add buffer. If you think 3 months, model 6. During ramp, the engine applies a 50% revenue realization factor.
                    </p>
                  </div>
                )}

                {/* Step 10 — Volatility */}
                {step === 10 && (
                  <div>
                    <label className="block text-base font-semibold text-foreground mb-3">
                      What level of monthly revenue variance do you expect?
                    </label>
                    <NumInput name="volatilityPercent" suffix="%" register={register} error={errors.volatilityPercent?.message} autoFocus placeholder="15" min={10} max={30} />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {[
                        { label: 'Stable contracts / retainers', val: '10%' },
                        { label: 'Mixed client work', val: '15%' },
                        { label: 'Project-based billing', val: '20%' },
                        { label: 'Unpredictable / early stage', val: '30%' },
                      ].map(h => (
                        <button
                          key={h.val}
                          type="button"
                          onClick={() => setValue("volatilityPercent", parseInt(h.val), { shouldValidate: true })}
                          className="text-left p-3 rounded-md border border-border text-xs"
                          data-testid={`preset-vol-${h.val}`}
                        >
                          <span className="block font-semibold text-foreground">{h.val}</span>
                          <span className="text-muted-foreground">{h.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="mt-10 flex items-center justify-between">
              <button
                type="button"
                onClick={back}
                className={`flex items-center gap-1.5 text-sm text-muted-foreground transition-opacity ${step === 1 ? 'invisible' : ''}`}
                data-testid="button-back"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {step < TOTAL_STEPS ? (
                <Button
                  type="button"
                  onClick={next}
                  disabled={step === 7 && businessChoice === null}
                  data-testid="button-next"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={createSimulation.isPending}
                  onClick={handleSubmit(onSubmit)}
                  data-testid="button-submit"
                >
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
