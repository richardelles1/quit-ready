import { useParams, Link } from "wouter";
import { Download, AlertCircle, ShieldCheck, TrendingUp, Info } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip as RechartsTooltip, PolarRadiusAxis } from "recharts";

import Layout from "../components/Layout";
import { Button } from "../components/Button";
import { useSimulation, useDownloadSimulationPdf } from "../hooks/use-simulations";

export default function Results() {
  const params = useParams();
  const id = params.id ? parseInt(params.id, 10) : null;
  
  const { data: simulation, isLoading, isError } = useSimulation(id);
  const downloadPdf = useDownloadSimulationPdf();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-6"></div>
          <h2 className="text-2xl font-serif font-bold text-slate-800">Processing Models...</h2>
          <p className="text-slate-500 mt-2">Calculating liquidity weights and stress-testing revenue.</p>
        </div>
      </Layout>
    );
  }

  if (isError || !simulation) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
          <AlertCircle className="w-16 h-16 text-destructive mb-6" />
          <h2 className="text-2xl font-serif font-bold text-slate-800">Simulation Not Found</h2>
          <p className="text-slate-500 mt-2 mb-8">We couldn't locate this specific report. It may have expired or been removed.</p>
          <Link href="/simulator">
            <Button>Start New Simulation</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const chartData = [
    { subject: 'Liquidity', A: simulation.liquidityScore, fullMark: 100 },
    { subject: 'Revenue', A: simulation.revenueScore, fullMark: 100 },
    { subject: 'Fixed Costs', A: simulation.fixedCostScore, fullMark: 100 },
    { subject: 'Healthcare', A: simulation.healthcareScore, fullMark: 100 },
    { subject: 'Tax/Buffer', A: simulation.bufferScore, fullMark: 100 },
  ];

  const handleDownload = () => {
    if (id) downloadPdf.mutate(id);
  };

  const getReadinessColor = (score: number) => {
    if (score >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (score >= 50) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-rose-700 bg-rose-50 border-rose-200";
  };

  return (
    <Layout>
      <div className="flex-1 bg-slate-50 py-8 md:py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-bold font-serif text-slate-900">Simulation Report</h1>
              <p className="text-slate-500 mt-1">Generated on {new Date(simulation.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex gap-4">
              <Button 
                onClick={handleDownload} 
                isLoading={downloadPdf.isPending}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </Button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Primary Score Column */}
            <div className="lg:col-span-1 space-y-8">
              {/* Overall Index */}
              <div className="bg-white rounded-xl border border-slate-200 p-8 structural-shadow text-center">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Readiness Index</h3>
                <div className="flex items-center justify-center mb-4">
                  <span className={`text-6xl font-bold font-serif px-6 py-4 rounded-xl border ${getReadinessColor(simulation.readinessIndex)}`}>
                    {simulation.readinessIndex}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-4 leading-relaxed">
                  A composite score based on liquidity runway, revenue predictability, and fixed structural costs.
                </p>
              </div>

              {/* Execution Stability */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 text-white structural-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="text-slate-300 w-6 h-6" />
                  <h3 className="text-lg font-semibold font-serif">Execution Stability</h3>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                  {simulation.executionStability}
                </p>
                <div className="bg-slate-800 rounded-md p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400">
                    Recommendations are generated purely algorithmically based on strict financial heuristics. Not professional advice.
                  </p>
                </div>
              </div>
            </div>

            {/* Radar Chart & Details Column */}
            <div className="lg:col-span-2 space-y-8">
              
              <div className="bg-white rounded-xl border border-slate-200 p-8 structural-shadow h-[400px] flex flex-col">
                <h3 className="text-lg font-semibold font-serif text-slate-900 mb-6">Risk Vector Breakdown</h3>
                <div className="flex-1 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                        itemStyle={{ color: '#f8fafc' }}
                      />
                      <Radar name="Score" dataKey="A" stroke="#0f172a" fill="#0f172a" fillOpacity={0.15} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Score Detailed Breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-8 structural-shadow">
                <h3 className="text-lg font-semibold font-serif text-slate-900 mb-6">Component Analysis</h3>
                <div className="space-y-6">
                  
                  <ScoreBar label="Liquidity Runway" score={simulation.liquidityScore} desc="Cash & accessible brokerage buffers against burn." />
                  <ScoreBar label="Revenue Resilience" score={simulation.revenueScore} desc="Predictability of income vs. ramp duration." />
                  <ScoreBar label="Fixed Cost Density" score={simulation.fixedCostScore} desc="Living & business expenses mapped to potential income." />
                  <ScoreBar label="Healthcare Risk" score={simulation.healthcareScore} desc="Exposure based on selected coverage strategy." />
                  <ScoreBar label="Tax & Buffer Discipline" score={simulation.bufferScore} desc="Adequacy of set-aside funds for tax obligations." />

                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}

function ScoreBar({ label, score, desc }: { label: string, score: number, desc: string }) {
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <div>
          <h4 className="text-sm font-bold text-slate-800">{label}</h4>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
        <span className="text-sm font-semibold text-slate-900">{score}/100</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-slate-800 transition-all duration-1000 ease-out"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
