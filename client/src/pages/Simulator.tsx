import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Activity, DollarSign, BriefcaseMedical } from "lucide-react";

import Layout from "../components/Layout";
import { Button } from "../components/Button";
import { FormField, SelectField } from "../components/FormField";
import { simulationFormSchema, SimulationFormValues, useCreateSimulation } from "../hooks/use-simulations";

const STEPS = [
  { id: 1, title: "Capital Liquidity", icon: DollarSign, description: "Map your available runway." },
  { id: 2, title: "Fixed Liabilities", icon: Activity, description: "Calculate structural burn." },
  { id: 3, title: "Revenue Model", icon: ShieldAlert, description: "Stress-test income projections." },
  { id: 4, title: "Risk Exposure", icon: BriefcaseMedical, description: "Healthcare and structural risks." }
];

export default function Simulator() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const createSimulation = useCreateSimulation();

  const form = useForm<SimulationFormValues>({
    resolver: zodResolver(simulationFormSchema),
    defaultValues: {
      cash: 0,
      brokerage: 0,
      roth: 0,
      traditional: 0,
      realEstate: 0,
      livingExpenses: 0,
      healthcareCost: 0,
      businessCosts: 0,
      taxReserve: 0,
      isDualIncome: false,
      partnerIncome: 0,
      expectedRevenue: 0,
      rampDuration: 0,
      revenueType: 'recurring',
      volatilityPercent: 15,
      healthcareType: 'none',
    },
    mode: "onChange"
  });

  const { register, handleSubmit, formState: { errors, isValid }, trigger, watch, setValue } = form;
  const isDualIncome = watch("isDualIncome");

  const nextStep = async () => {
    // Validate current step fields before advancing
    let fieldsToValidate: (keyof SimulationFormValues)[] = [];
    if (currentStep === 1) fieldsToValidate = ['cash', 'brokerage', 'roth', 'traditional', 'realEstate'];
    if (currentStep === 2) fieldsToValidate = ['livingExpenses', 'healthcareCost', 'businessCosts', 'taxReserve', 'partnerIncome'];
    if (currentStep === 3) fieldsToValidate = ['expectedRevenue', 'rampDuration', 'revenueType', 'volatilityPercent'];
    
    const isStepValid = await trigger(fieldsToValidate);
    if (isStepValid) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
  };

  const onSubmit = (data: SimulationFormValues) => {
    createSimulation.mutate(data, {
      onSuccess: (result) => {
        setLocation(`/results/${result.id}`);
      }
    });
  };

  return (
    <Layout>
      <div className="flex-1 bg-slate-50 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Progress Indicator */}
          <div className="mb-10">
            <div className="flex justify-between items-center mb-4">
              {STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = step.id === currentStep;
                const isPast = step.id < currentStep;
                return (
                  <div key={step.id} className="flex flex-col items-center relative z-10">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${
                      isActive ? 'bg-primary border-primary text-primary-foreground' : 
                      isPast ? 'bg-primary/10 border-primary text-primary' : 
                      'bg-card border-border text-muted-foreground'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold mt-2 hidden sm:block text-slate-600">
                      {step.title}
                    </span>
                  </div>
                );
              })}
              {/* Connecting line */}
              <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-border -z-0 hidden sm:block">
                <div 
                  className="h-full bg-primary transition-all duration-500 ease-in-out" 
                  style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
                />
              </div>
            </div>
            <div className="text-center sm:hidden mt-4">
              <h2 className="text-xl font-bold font-serif">{STEPS[currentStep - 1].title}</h2>
              <p className="text-sm text-muted-foreground">{STEPS[currentStep - 1].description}</p>
            </div>
          </div>

          {/* Form Container */}
          <div className="bg-card rounded-xl border border-border structural-shadow overflow-hidden">
            <div className="hidden sm:block p-8 border-b border-border bg-slate-50/50">
              <h2 className="text-2xl font-bold font-serif text-foreground">{STEPS[currentStep - 1].title}</h2>
              <p className="text-muted-foreground">{STEPS[currentStep - 1].description}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 sm:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  
                  {/* STEP 1: Assets */}
                  {currentStep === 1 && (
                    <div className="space-y-6">
                      <FormField
                        label="Cash & HYSA"
                        description="Fully liquid, penalty-free cash."
                        type="number"
                        prefix="$"
                        registration={register("cash")}
                        error={errors.cash?.message}
                      />
                      <div className="grid sm:grid-cols-2 gap-6">
                        <FormField
                          label="Brokerage (Taxable)"
                          description="Liquid, subject to capital gains."
                          type="number"
                          prefix="$"
                          registration={register("brokerage")}
                          error={errors.brokerage?.message}
                        />
                        <FormField
                          label="Roth IRA (Contributions)"
                          description="Contributions can be withdrawn penalty-free."
                          type="number"
                          prefix="$"
                          registration={register("roth")}
                          error={errors.roth?.message}
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <FormField
                          label="Traditional IRA/401k"
                          description="Subject to tax and 10% penalty if early."
                          type="number"
                          prefix="$"
                          registration={register("traditional")}
                          error={errors.traditional?.message}
                        />
                        <FormField
                          label="Real Estate Equity"
                          description="Highly illiquid. Use conservatively."
                          type="number"
                          prefix="$"
                          registration={register("realEstate")}
                          error={errors.realEstate?.message}
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Burn */}
                  {currentStep === 2 && (
                    <div className="space-y-6">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                            {...register("isDualIncome")}
                          />
                          <span className="font-semibold text-slate-800">I have a partner with stable income</span>
                        </label>
                        {isDualIncome && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <FormField
                              label="Partner's Net Monthly Income"
                              type="number"
                              prefix="$"
                              registration={register("partnerIncome")}
                              error={errors.partnerIncome?.message}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <FormField
                          label="Monthly Living Expenses"
                          description="Rent/mortgage, food, utilities."
                          type="number"
                          prefix="$"
                          registration={register("livingExpenses")}
                          error={errors.livingExpenses?.message}
                        />
                        <FormField
                          label="Monthly Healthcare Cost"
                          description="Premiums + expected out-of-pocket."
                          type="number"
                          prefix="$"
                          registration={register("healthcareCost")}
                          error={errors.healthcareCost?.message}
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <FormField
                          label="Monthly Business Costs"
                          description="Software, services, contractors."
                          type="number"
                          prefix="$"
                          registration={register("businessCosts")}
                          error={errors.businessCosts?.message}
                        />
                        <FormField
                          label="Monthly Tax Reserve"
                          description="Estimated self-employment taxes."
                          type="number"
                          prefix="$"
                          registration={register("taxReserve")}
                          error={errors.taxReserve?.message}
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Revenue */}
                  {currentStep === 3 && (
                    <div className="space-y-6">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <FormField
                          label="Expected Monthly Revenue"
                          description="Conservative baseline projection."
                          type="number"
                          prefix="$"
                          registration={register("expectedRevenue")}
                          error={errors.expectedRevenue?.message}
                        />
                        <FormField
                          label="Ramp Duration (Months)"
                          description="Time until reaching expected revenue."
                          type="number"
                          suffix="mo"
                          registration={register("rampDuration")}
                          error={errors.rampDuration?.message}
                        />
                      </div>
                      
                      <div className="grid sm:grid-cols-2 gap-6">
                        <SelectField
                          label="Revenue Structure"
                          description="Nature of your cash flow."
                          options={[
                            { label: "Recurring (Retainers, Subscriptions)", value: "recurring" },
                            { label: "One-Time (Projects, Hourly)", value: "one-time" }
                          ]}
                          registration={register("revenueType")}
                          error={errors.revenueType?.message}
                        />
                        <FormField
                          label="Volatility Buffer (%)"
                          description="Expected variance (10-20%)."
                          type="number"
                          suffix="%"
                          min="10"
                          max="20"
                          registration={register("volatilityPercent")}
                          error={errors.volatilityPercent?.message}
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Risk */}
                  {currentStep === 4 && (
                    <div className="space-y-6">
                      <SelectField
                        label="Healthcare Coverage Strategy"
                        description="How you plan to manage medical risk."
                        options={[
                          { label: "Partner's Corporate Plan (Safest)", value: "partner" },
                          { label: "ACA Marketplace (Subsidized/Standard)", value: "aca" },
                          { label: "Private/Non-ACA Plan (Higher Risk)", value: "private" },
                          { label: "None / Out of Pocket (Extreme Risk)", value: "none" }
                        ]}
                        registration={register("healthcareType")}
                        error={errors.healthcareType?.message}
                      />
                      
                      <div className="mt-8 p-6 bg-slate-100 rounded-lg border border-slate-200">
                        <h4 className="font-semibold text-slate-800 mb-2">Ready to generate your report?</h4>
                        <p className="text-sm text-slate-600">
                          By proceeding, you acknowledge that this is a simulation based on estimates and standard formulas. It does not constitute formal advice.
                        </p>
                      </div>
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>

              {/* Navigation Controls */}
              <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={prevStep}
                  className={currentStep === 1 ? 'invisible' : ''}
                >
                  Back
                </Button>
                
                {currentStep < STEPS.length ? (
                  <Button type="button" onClick={nextStep}>
                    Continue to {STEPS[currentStep].title}
                  </Button>
                ) : (
                  <Button 
                    type="submit" 
                    isLoading={createSimulation.isPending}
                    className="bg-slate-900 text-white"
                  >
                    Generate Report
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
