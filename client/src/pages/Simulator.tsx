import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { simulationFormSchema, SimulationFormValues, useCreateSimulation } from "../hooks/use-simulations";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronLeft, Info } from "lucide-react";

const SECTIONS = [
  { id: 1, title: "Current Stability", subtitle: "Employment income, living expenses, and debt obligations." },
  { id: 2, title: "Liquidity Position", subtitle: "Accessible capital across all asset classes — before haircuts." },
  { id: 3, title: "Business Transition Model", subtitle: "Revenue projections and ramp assumptions." },
];

const HEALTHCARE_OPTIONS = [
  { value: 'employer', label: 'Employer Coverage Retained', note: 'Staying on plan during notice period' },
  { value: 'cobra', label: 'COBRA Continuation', note: 'Avg. $850/mo — time-limited to 18 months' },
  { value: 'aca', label: 'ACA Marketplace', note: 'Avg. $600/mo — income-dependent subsidies' },
  { value: 'partner', label: 'Covered by Partner Plan', note: 'No additional healthcare cost' },
  { value: 'none', label: 'No Coverage', note: 'All medical costs out-of-pocket — extreme risk' },
];

const BUSINESS_MODELS = [
  { value: 'solo_bootstrap', label: 'Solo Bootstrap', cost: '$500/mo baseline' },
  { value: 'contractor_heavy', label: 'Contractor-Heavy', cost: '$2,000/mo baseline' },
  { value: 'agency_service', label: 'Agency / Service Firm', cost: '$3,000/mo baseline' },
  { value: 'inventory_heavy', label: 'Inventory-Heavy', cost: '$4,500/mo baseline' },
  { value: 'saas_product', label: 'SaaS / Product Build', cost: '$2,500/mo baseline' },
];

function CurrencyInput({ label, description, name, register, error }: {
  label: string;
  description?: string;
  name: string;
  register: ReturnType<typeof useForm<SimulationFormValues>>['register'];
  error?: string;
}) {
  return (
    <div data-testid={`field-${name}`}>
      <label className="block text-sm font-semibold text-foreground mb-1">{label}</label>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">$</span>
        <input
          type="number"
          min="0"
          step="1"
          className="w-full pl-7 pr-4 py-2.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="0"
          data-testid={`input-${name}`}
          {...register(name as keyof SimulationFormValues)}
        />
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

function NumInput({ label, description, name, suffix, min, max, register, error }: {
  label: string;
  description?: string;
  name: string;
  suffix?: string;
  min?: number;
  max?: number;
  register: ReturnType<typeof useForm<SimulationFormValues>>['register'];
  error?: string;
}) {
  return (
    <div data-testid={`field-${name}`}>
      <label className="block text-sm font-semibold text-foreground mb-1">{label}</label>
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          step="1"
          className="w-full px-4 py-2.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="0"
          data-testid={`input-${name}`}
          {...register(name as keyof SimulationFormValues)}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

export default function Simulator() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [showOverride, setShowOverride] = useState(false);
  const { toast } = useToast();
  const createSimulation = useCreateSimulation();

  const form = useForm<SimulationFormValues>({
    resolver: zodResolver(simulationFormSchema),
    defaultValues: {
      currentSalary: 0, livingExpenses: 0, totalDebt: 0, monthlyDebtPayments: 0,
      isDualIncome: false, partnerIncome: 0, healthcareType: 'aca',
      cash: 0, brokerage: 0, roth: 0, traditional: 0, realEstate: 0,
      businessModelType: 'solo_bootstrap', businessCostOverride: null,
      expectedRevenue: 0, volatilityPercent: 15, rampDuration: 6, breakevenMonths: 12,
    },
    mode: "onChange",
  });

  const { register, handleSubmit, watch, setValue, formState: { errors }, trigger } = form;
  const isDualIncome = watch("isDualIncome");
  const businessModelType = watch("businessModelType");

  const stepFields: Record<number, (keyof SimulationFormValues)[]> = {
    1: ['livingExpenses', 'healthcareType'],
    2: ['cash'],
    3: ['expectedRevenue', 'rampDuration', 'breakevenMonths', 'volatilityPercent'],
  };

  const nextStep = async () => {
    const valid = await trigger(stepFields[step]);
    if (valid) {
      setStep(s => Math.min(s + 1, SECTIONS.length));
      window.scrollTo({ top: 0 });
    }
  };

  const prevStep = () => {
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0 });
  };

  const onSubmit = (data: SimulationFormValues) => {
    createSimulation.mutate(data, {
      onSuccess: (result) => setLocation(`/results/${result.id}`),
      onError: (err) => toast({ title: "Simulation failed", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <Layout>
      <div className="flex-1 bg-background py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          {/* Progress */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              {SECTIONS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-colors
                    ${step === s.id ? 'bg-foreground text-background border-foreground' :
                      step > s.id ? 'bg-foreground/20 text-foreground border-foreground/20' :
                      'bg-transparent text-muted-foreground border-border'}`}>
                    {s.id}
                  </div>
                  <span className={`text-sm hidden sm:block ${step === s.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                    {s.title}
                  </span>
                  {i < SECTIONS.length - 1 && <div className="h-px w-8 bg-border hidden sm:block" />}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-3 sm:hidden">{SECTIONS[step - 1].title}</p>
          </div>

          {/* Form Card */}
          <div className="bg-card border border-border rounded-md">
            <div className="px-8 py-6 border-b border-border">
              <h2 className="text-xl font-bold font-serif text-foreground">{SECTIONS[step - 1].title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{SECTIONS[step - 1].subtitle}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="p-8 space-y-8"
                >

                  {/* SECTION 1 */}
                  {step === 1 && (
                    <div className="space-y-8">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <CurrencyInput label="Current Net Monthly Salary" description="Your take-home pay, after tax." name="currentSalary" register={register} error={errors.currentSalary?.message} />
                        <CurrencyInput label="Monthly Living Expenses" description="Rent/mortgage, food, utilities, subscriptions." name="livingExpenses" register={register} error={errors.livingExpenses?.message} />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <CurrencyInput label="Total Outstanding Debt" description="Mortgage balance + all other debt." name="totalDebt" register={register} error={errors.totalDebt?.message} />
                        <CurrencyInput label="Total Monthly Debt Payments" description="All required monthly debt service." name="monthlyDebtPayments" register={register} error={errors.monthlyDebtPayments?.message} />
                      </div>

                      {/* Dual income toggle */}
                      <div className="border border-border rounded-md p-5">
                        <label className="flex items-center gap-3 cursor-pointer" data-testid="toggle-dual-income">
                          <div
                            onClick={() => setValue("isDualIncome", !isDualIncome)}
                            className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${isDualIncome ? 'bg-foreground' : 'bg-muted'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDualIncome ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <input type="checkbox" className="sr-only" {...register("isDualIncome")} />
                          <span className="text-sm font-semibold text-foreground">Partner has stable income</span>
                        </label>
                        {isDualIncome && (
                          <div className="mt-5 pt-5 border-t border-border">
                            <CurrencyInput label="Partner Net Monthly Income" description="Take-home, after tax. Reduces TMIB directly." name="partnerIncome" register={register} error={errors.partnerIncome?.message} />
                          </div>
                        )}
                      </div>

                      {/* Healthcare */}
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1">Healthcare Coverage Strategy</label>
                        <p className="text-xs text-muted-foreground mb-3">Monthly cost will be estimated based on your selection and added to TMIB.</p>
                        <div className="space-y-2">
                          {HEALTHCARE_OPTIONS.map(opt => {
                            const selected = watch("healthcareType") === opt.value;
                            return (
                              <label
                                key={opt.value}
                                className={`flex items-center justify-between p-4 rounded-md border cursor-pointer transition-colors ${selected ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                                data-testid={`option-healthcare-${opt.value}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-foreground' : 'border-muted-foreground'}`}>
                                    {selected && <div className="w-2 h-2 rounded-full bg-foreground" />}
                                  </div>
                                  <div>
                                    <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                    <p className="text-xs text-muted-foreground">{opt.note}</p>
                                  </div>
                                </div>
                                <input type="radio" value={opt.value} className="sr-only" {...register("healthcareType")} />
                              </label>
                            );
                          })}
                        </div>
                        {errors.healthcareType && <p className="text-xs text-destructive mt-1">{errors.healthcareType.message}</p>}
                      </div>
                    </div>
                  )}

                  {/* SECTION 2 */}
                  {step === 2 && (
                    <div className="space-y-6">
                      <div className="flex items-start gap-2 p-4 bg-muted/50 rounded-md border border-border">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Declare raw values. Conservative haircuts will be applied automatically: Brokerage ×0.80, Roth ×1.00, Retirement ×0.50, Real Estate ×0.30.
                        </p>
                      </div>
                      <CurrencyInput label="Cash & HYSA" description="Checking, savings, high-yield savings — fully liquid." name="cash" register={register} error={errors.cash?.message} />
                      <div className="grid sm:grid-cols-2 gap-6">
                        <CurrencyInput label="Brokerage (Taxable)" description="Subject to capital gains tax." name="brokerage" register={register} error={errors.brokerage?.message} />
                        <CurrencyInput label="Roth IRA (Contributions Only)" description="Contributions are penalty-free." name="roth" register={register} error={errors.roth?.message} />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <CurrencyInput label="Traditional IRA / 401(k)" description="Subject to tax + 10% early withdrawal penalty." name="traditional" register={register} error={errors.traditional?.message} />
                        <CurrencyInput label="Real Estate Equity" description="Illiquid. Use conservatively." name="realEstate" register={register} error={errors.realEstate?.message} />
                      </div>
                    </div>
                  )}

                  {/* SECTION 3 */}
                  {step === 3 && (
                    <div className="space-y-8">
                      {/* Business model */}
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1">Business Model Type</label>
                        <p className="text-xs text-muted-foreground mb-3">Sets baseline monthly operating cost. You can override this below.</p>
                        <div className="space-y-2">
                          {BUSINESS_MODELS.map(opt => {
                            const selected = businessModelType === opt.value;
                            return (
                              <label
                                key={opt.value}
                                className={`flex items-center justify-between p-4 rounded-md border cursor-pointer transition-colors ${selected ? 'border-foreground bg-foreground/5' : 'border-border'}`}
                                data-testid={`option-model-${opt.value}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-foreground' : 'border-muted-foreground'}`}>
                                    {selected && <div className="w-2 h-2 rounded-full bg-foreground" />}
                                  </div>
                                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">{opt.cost}</span>
                                <input type="radio" value={opt.value} className="sr-only" {...register("businessModelType")} />
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Advanced override */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowOverride(v => !v)}
                          className="text-xs text-muted-foreground underline underline-offset-2"
                          data-testid="button-toggle-override"
                        >
                          {showOverride ? 'Remove advanced cost override' : 'Override business cost manually'}
                        </button>
                        {showOverride && (
                          <div className="mt-4">
                            <CurrencyInput label="Monthly Business Cost Override" description="Replaces model-type baseline if provided." name="businessCostOverride" register={register} error={errors.businessCostOverride?.message} />
                          </div>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <CurrencyInput label="Expected Monthly Revenue (Steady State)" description="Conservative baseline at full ramp." name="expectedRevenue" register={register} error={errors.expectedRevenue?.message} />
                        <NumInput label="Revenue Volatility %" description="Expected variance in monthly revenue (10–40%)." name="volatilityPercent" suffix="%" min={10} max={40} register={register} error={errors.volatilityPercent?.message} />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <NumInput label="Ramp Duration" description="Months until stable revenue is achieved." name="rampDuration" suffix="mo" min={0} register={register} error={errors.rampDuration?.message} />
                        <NumInput label="Months to Break Even" description="Month when revenue is projected to cover TMIB." name="breakevenMonths" suffix="mo" min={0} register={register} error={errors.breakevenMonths?.message} />
                      </div>

                      {/* Stress parameters notice */}
                      <div className="border border-border rounded-md p-5">
                        <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Built-in Stress Scenarios</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">The following are automatically applied — no additional input required.</p>
                        <div className="space-y-1">
                          {['-15% Revenue shock', '-30% Revenue shock', 'Ramp delayed +3 months'].map(s => (
                            <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                              {s}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border border-border rounded-md p-5 bg-muted/30">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          By proceeding, you acknowledge this is a deterministic financial simulation based on your inputs and estimated U.S. averages. It is not financial, tax, or legal advice.
                        </p>
                      </div>
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="px-8 py-6 border-t border-border flex items-center justify-between">
                {step > 1 ? (
                  <Button type="button" variant="ghost" onClick={prevStep} className="gap-1" data-testid="button-prev">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                ) : <div />}

                {step < SECTIONS.length ? (
                  <Button type="button" onClick={nextStep} className="gap-1" data-testid="button-next">
                    {SECTIONS[step].title}
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={createSimulation.isPending}
                    data-testid="button-submit"
                  >
                    {createSimulation.isPending ? 'Running simulation...' : 'Generate Breakpoint Report'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
