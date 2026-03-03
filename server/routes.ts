import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { calculateSimulation, generateNarrative, HEALTHCARE_COSTS, HEALTHCARE_RISK_LABELS, BUSINESS_COST_BASELINES } from "./services/simulator";
import { z } from "zod";
import PDFDocument from "pdfkit";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.simulations.create.path, async (req, res) => {
    try {
      const body = {
        ...req.body,
        currentSalary: Number(req.body.currentSalary || 0),
        livingExpenses: Number(req.body.livingExpenses || 0),
        totalDebt: Number(req.body.totalDebt || 0),
        monthlyDebtPayments: Number(req.body.monthlyDebtPayments || 0),
        partnerIncome: Number(req.body.partnerIncome || 0),
        cash: Number(req.body.cash || 0),
        brokerage: Number(req.body.brokerage || 0),
        roth: Number(req.body.roth || 0),
        traditional: Number(req.body.traditional || 0),
        realEstate: Number(req.body.realEstate || 0),
        businessCostOverride: req.body.businessCostOverride ? Number(req.body.businessCostOverride) : null,
        expectedRevenue: Number(req.body.expectedRevenue || 0),
        volatilityPercent: Number(req.body.volatilityPercent || 15),
        rampDuration: Number(req.body.rampDuration || 0),
        breakevenMonths: Number(req.body.breakevenMonths || 0),
        isDualIncome: req.body.isDualIncome === true || req.body.isDualIncome === 'true',
      };

      const input = api.simulations.create.input.parse(body);
      const computed = calculateSimulation(input);

      const simulation = await storage.createSimulation({
        ...input,
        tmib: computed.tmib,
        accessibleCapital: computed.accessibleCapital,
        selfEmploymentTax: computed.selfEmploymentTax,
        businessCostBaseline: computed.businessCostBaseline,
        healthcareMonthlyCost: computed.healthcareMonthlyCost,
        baseRunway: computed.baseRunway,
        runway15Down: computed.runway15Down,
        runway30Down: computed.runway30Down,
        runwayRampDelay: computed.runwayRampDelay,
        structuralBreakpointScore: computed.structuralBreakpointScore,
        debtExposureRatio: computed.debtExposureRatio,
        healthcareRisk: computed.healthcareRisk,
        breakpointMonth: computed.breakpointMonth,
        breakpointScenario: computed.breakpointScenario,
      });

      res.status(201).json(simulation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.simulations.get.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) {
      return res.status(404).json({ message: 'Simulation not found' });
    }
    res.json(sim);
  });

  app.get(api.simulations.downloadPdf.path, async (req, res) => {
    const sim = await storage.getSimulation(Number(req.params.id));
    if (!sim) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    try {
      const doc = new PDFDocument({ margin: 60, size: 'LETTER' });
      const reportDate = new Date(sim.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const narrative = generateNarrative(sim);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="QuitReady_Breakpoint_Report_${sim.id}.pdf"`);
      doc.pipe(res);

      const NAVY = '#1e293b';
      const CHARCOAL = '#334155';
      const MUTED = '#64748b';
      const LIGHT = '#f8fafc';
      const RED = '#dc2626';
      const AMBER = '#d97706';
      const GREEN = '#15803d';
      const WIDTH = 492; // usable width

      const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;
      const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
      const fmtRunway = (n: number) => n >= 999 ? '24+ months' : `${n} months`;

      const scoreColor = (score: number) => score >= 66 ? GREEN : score >= 41 ? AMBER : RED;

      // ── COVER PAGE ──────────────────────────────────────────────
      doc.rect(0, 0, 612, 792).fill(NAVY);
      doc.fillColor('#ffffff').fontSize(32).font('Times-Bold')
        .text('QuitReady.', 60, 120);
      doc.fontSize(18).font('Times-Roman')
        .text('Structural Breakpoint Simulation Report', 60, 166);
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#94a3b8')
        .text(`Report Date: ${reportDate}`, 60, doc.y);
      doc.text(`Simulation ID: ${sim.id}`, 60, doc.y + 4);

      doc.fillColor('#ffffff').fontSize(11).font('Helvetica')
        .text(
          'This document presents a deterministic simulation of structural financial risk during an employment transition. It is not financial, tax, or legal advice.',
          60, 680, { width: WIDTH, lineGap: 4 }
        );
      doc.addPage();

      // ── PAGE 1: EXECUTIVE SUMMARY ─────────────────────────────
      let y = 60;
      const addPageNumber = (n: number) => {
        doc.fillColor(MUTED).fontSize(9).font('Helvetica')
          .text(`Page ${n} of 5`, 60, 750, { align: 'right', width: WIDTH });
      };

      doc.fillColor(NAVY).fontSize(22).font('Times-Bold').text('Executive Summary', 60, y);
      y += 36;

      doc.fillColor(CHARCOAL).fontSize(11).font('Helvetica').text(narrative, 60, y, { width: WIDTH, lineGap: 3 });
      y += 80;

      // Key metrics row
      const metrics = [
        { label: 'True Monthly Independence Burn', value: fmt(sim.tmib) },
        { label: 'Accessible Capital', value: fmt(sim.accessibleCapital) },
        { label: 'Base-Case Runway', value: fmtRunway(sim.baseRunway) },
        { label: 'Worst-Case Runway', value: fmtRunway(Math.min(sim.runway15Down, sim.runway30Down, sim.runwayRampDelay)) },
      ];

      metrics.forEach((m, i) => {
        const col = i % 2 === 0 ? 60 : 336;
        if (i === 2) y += 50;
        doc.rect(col, y, 226, 44).fill('#f1f5f9');
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(m.label.toUpperCase(), col + 12, y + 8, { width: 202 });
        doc.fillColor(NAVY).fontSize(16).font('Times-Bold').text(m.value, col + 12, y + 20);
      });

      y += 80;

      // Structural Breakpoint Score
      const scoreVal = sim.structuralBreakpointScore;
      doc.rect(60, y, WIDTH, 56).fill('#f1f5f9');
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('STRUCTURAL BREAKPOINT SCORE', 72, y + 8);
      doc.fillColor(scoreColor(scoreVal)).fontSize(28).font('Times-Bold').text(`${scoreVal} / 100`, 72, y + 18);
      const scoreLabel = scoreVal >= 66 ? 'Structurally Stable' : scoreVal >= 41 ? 'Elevated Caution' : 'High Structural Risk';
      doc.fillColor(CHARCOAL).fontSize(11).font('Helvetica').text(scoreLabel, 280, y + 28);
      y += 80;

      if (sim.breakpointMonth < 999) {
        doc.fillColor(RED).fontSize(11).font('Helvetica-Bold')
          .text(`Structural Breakpoint: Month ${sim.breakpointMonth} — ${sim.breakpointScenario}`, 60, y);
      } else {
        doc.fillColor(GREEN).fontSize(11).font('Helvetica-Bold')
          .text('No structural breakpoint identified within the 24-month modeling horizon.', 60, y);
      }

      addPageNumber(1);
      doc.addPage();

      // ── PAGE 2: STRUCTURAL EXPOSURE ────────────────────────────
      y = 60;
      doc.fillColor(NAVY).fontSize(22).font('Times-Bold').text('Structural Exposure', 60, y);
      y += 36;

      const debtPct = fmtPct(sim.debtExposureRatio);
      const debtFlagged = sim.debtExposureRatio > 0.70;

      const exposureItems = [
        { label: 'Total Outstanding Debt', value: fmt(sim.totalDebt) },
        { label: 'Monthly Debt Service', value: fmt(sim.monthlyDebtPayments) },
        { label: 'Debt-to-Accessible-Capital Ratio', value: debtPct, flag: debtFlagged },
        { label: 'Healthcare Monthly Cost (Estimated)', value: fmt(sim.healthcareMonthlyCost) },
        { label: 'Healthcare Risk Classification', value: sim.healthcareRisk, long: true },
      ];

      exposureItems.forEach(item => {
        doc.rect(60, y, WIDTH, item.long ? 52 : 40).fill('#f8fafc');
        doc.rect(60, y, 3, item.long ? 52 : 40).fill(item.flag ? RED : NAVY);
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(item.label.toUpperCase(), 72, y + 8, { width: WIDTH - 24 });
        doc.fillColor(item.flag ? RED : NAVY).fontSize(13).font('Times-Bold').text(item.value, 72, y + 20, { width: WIDTH - 24 });
        if (item.flag) {
          doc.fillColor(RED).fontSize(9).font('Helvetica').text('ELEVATED STRUCTURAL RISK: Debt exceeds 70% of accessible capital.', 72, y + 36);
        }
        y += (item.long ? 52 : 40) + 8;
      });

      addPageNumber(2);
      doc.addPage();

      // ── PAGE 3: LIQUIDITY DEFENSE MAP ─────────────────────────
      y = 60;
      doc.fillColor(NAVY).fontSize(22).font('Times-Bold').text('Liquidity Defense Map', 60, y);
      y += 14;
      doc.fillColor(MUTED).fontSize(10).font('Helvetica')
        .text('Conservative haircuts applied to each asset class to derive Accessible Capital.', 60, y, { width: WIDTH });
      y += 36;

      const assetRows = [
        { label: 'Cash & HYSA', raw: sim.cash, haircut: 1.00, note: 'Full face value — no penalty' },
        { label: 'Brokerage (Taxable)', raw: sim.brokerage, haircut: 0.80, note: '20% haircut for capital gains & market risk' },
        { label: 'Roth IRA (Contributions Only)', raw: sim.roth, haircut: 1.00, note: 'Contributions are penalty-free' },
        { label: 'Traditional IRA / 401(k)', raw: sim.traditional, haircut: 0.50, note: '50% haircut for tax liability + 10% early withdrawal penalty' },
        { label: 'Real Estate Equity', raw: sim.realEstate, haircut: 0.30, note: '70% haircut — illiquid, transaction costs, market timing' },
      ];

      assetRows.forEach(row => {
        const accessible = Math.round(row.raw * row.haircut);
        doc.rect(60, y, WIDTH, 50).fill('#f8fafc');
        doc.fillColor(CHARCOAL).fontSize(11).font('Helvetica-Bold').text(row.label, 72, y + 8);
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(row.note, 72, y + 24, { width: 260 });
        doc.fillColor(MUTED).fontSize(8).text('DECLARED', 360, y + 8);
        doc.fillColor(CHARCOAL).fontSize(11).font('Helvetica').text(fmt(row.raw), 360, y + 20);
        doc.fillColor(MUTED).fontSize(8).text(`COUNTED (${(row.haircut * 100).toFixed(0)}%)`, 440, y + 8);
        doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text(fmt(accessible), 440, y + 20);
        y += 58;
      });

      // Total
      doc.rect(60, y, WIDTH, 44).fill(NAVY);
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('TOTAL ACCESSIBLE CAPITAL', 72, y + 8);
      doc.fillColor('#ffffff').fontSize(18).font('Times-Bold').text(fmt(sim.accessibleCapital), 72, y + 18);
      y += 60;

      addPageNumber(3);
      doc.addPage();

      // ── PAGE 4: REVENUE SHOCK SIMULATION ─────────────────────
      y = 60;
      doc.fillColor(NAVY).fontSize(22).font('Times-Bold').text('Revenue Shock Simulation', 60, y);
      y += 14;
      doc.fillColor(MUTED).fontSize(10).font('Helvetica')
        .text('Stress scenarios applied automatically. User inputs are not adjusted — internal revenue realizations are discounted.', 60, y, { width: WIDTH });
      y += 36;

      // Table header
      doc.rect(60, y, WIDTH, 28).fill(NAVY);
      ['Scenario', 'Revenue Modifier', 'Runway (Months)', 'Breakpoint'].forEach((h, i) => {
        const xPositions = [72, 192, 312, 420];
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text(h, xPositions[i], y + 9);
      });
      y += 28;

      const scenarios = [
        { label: 'Base Case', mod: '—', runway: sim.baseRunway },
        { label: '-15% Revenue', mod: '-15%', runway: sim.runway15Down },
        { label: '-30% Revenue', mod: '-30%', runway: sim.runway30Down },
        { label: 'Ramp Delay +3 Months', mod: 'Base revenue / extended', runway: sim.runwayRampDelay },
      ];

      scenarios.forEach((s, i) => {
        const bg = i % 2 === 0 ? '#f8fafc' : '#f1f5f9';
        doc.rect(60, y, WIDTH, 36).fill(bg);
        const bp = s.runway >= 999 ? 'None identified' : `Month ${s.runway}`;
        const bpColor = s.runway >= 999 ? GREEN : s.runway < 12 ? RED : AMBER;
        doc.fillColor(CHARCOAL).fontSize(10).font('Helvetica').text(s.label, 72, y + 12);
        doc.fillColor(MUTED).fontSize(10).text(s.mod, 192, y + 12);
        doc.fillColor(CHARCOAL).fontSize(10).text(fmtRunway(s.runway), 312, y + 12);
        doc.fillColor(bpColor).fontSize(10).font('Helvetica-Bold').text(bp, 420, y + 12);
        y += 36;
      });

      y += 24;

      doc.fillColor(NAVY).fontSize(14).font('Times-Bold').text('TMIB Breakdown', 60, y);
      y += 16;

      const tmiItems = [
        { label: 'Monthly Living Expenses', val: sim.livingExpenses },
        { label: 'Healthcare Cost (Estimated)', val: sim.healthcareMonthlyCost },
        { label: 'Monthly Debt Payments', val: sim.monthlyDebtPayments },
        { label: 'Self-Employment Tax Reserve (28%)', val: sim.selfEmploymentTax },
        { label: 'Business Operating Cost', val: sim.businessCostBaseline },
        { label: 'Less: Partner Income', val: -sim.partnerIncome },
      ];

      tmiItems.forEach(item => {
        if (item.val === 0) return;
        doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(item.label, 72, y, { width: 300 });
        const valStr = item.val < 0 ? `(${fmt(Math.abs(item.val))})` : fmt(item.val);
        doc.fillColor(item.val < 0 ? GREEN : CHARCOAL).text(valStr, 400, y, { width: 152, align: 'right' });
        y += 16;
      });

      doc.rect(60, y, WIDTH, 1).fill('#e2e8f0');
      y += 8;
      doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('TRUE MONTHLY INDEPENDENCE BURN', 72, y);
      doc.fillColor(NAVY).fontSize(13).font('Times-Bold').text(fmt(sim.tmib), 400, y, { width: 152, align: 'right' });

      addPageNumber(4);
      doc.addPage();

      // ── PAGE 5: CONTROLLED EXIT CONDITIONS ────────────────────
      y = 60;
      doc.fillColor(NAVY).fontSize(22).font('Times-Bold').text('Controlled Exit Conditions', 60, y);
      y += 14;
      doc.fillColor(MUTED).fontSize(10).font('Helvetica')
        .text('Deterministic adjustments. All calculations based on your provided assumptions.', 60, y, { width: WIDTH });
      y += 36;

      // Calculated recommendations
      const targetRunway = 18;
      const capitalNeededFor18 = sim.tmib * targetRunway;
      const additionalCapitalNeeded = Math.max(0, capitalNeededFor18 - sim.accessibleCapital);

      const monthlyGap = sim.tmib - sim.expectedRevenue;
      const breakCostThreshold = sim.expectedRevenue * 0.50;

      const recommendations = [
        additionalCapitalNeeded > 0
          ? `To extend base-case runway to ${targetRunway} months, accessible capital would need to increase by ${fmt(additionalCapitalNeeded)}. This could be achieved through liquidation of additional brokerage assets, accelerated debt paydown, or delayed exit timing.`
          : `Your current accessible capital of ${fmt(sim.accessibleCapital)} is sufficient for an ${targetRunway}-month runway under base-case assumptions.`,

        monthlyGap > 0
          ? `Your current revenue projection of ${fmt(sim.expectedRevenue)}/month falls short of TMIB by ${fmt(monthlyGap)}. Closing this gap before exit materially reduces breakpoint risk.`
          : `Your projected revenue of ${fmt(sim.expectedRevenue)}/month exceeds TMIB of ${fmt(sim.tmib)}. Revenue execution is the primary remaining variable.`,

        `If monthly business operating costs exceed ${fmt(breakCostThreshold)}, the revenue model requires re-evaluation. Current baseline: ${fmt(sim.businessCostBaseline)}.`,

        sim.debtExposureRatio > 0.40
          ? `Debt exposure at ${fmtPct(sim.debtExposureRatio)} of accessible capital is elevated. Reducing total debt by ${fmt(Math.round(sim.totalDebt * 0.25))} would move this ratio below the 40% threshold.`
          : `Debt-to-capital ratio of ${fmtPct(sim.debtExposureRatio)} is within manageable parameters.`,
      ];

      recommendations.forEach((rec, i) => {
        doc.rect(60, y, 4, 60).fill(NAVY);
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`CONDITION ${i + 1}`, 76, y + 2);
        doc.fillColor(CHARCOAL).fontSize(10).font('Helvetica').text(rec, 76, y + 14, { width: WIDTH - 24, lineGap: 2 });
        y += 80;
      });

      y += 10;
      doc.rect(60, y, WIDTH, 1).fill('#e2e8f0');
      y += 16;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
        .text(
          'DISCLAIMER: This report is an educational financial simulation based on user-provided inputs and estimated U.S. averages. It is not financial, tax, or legal advice. Consult a qualified professional before making any major financial decisions.',
          60, y, { width: WIDTH, lineGap: 2 }
        );

      addPageNumber(5);
      doc.end();

    } catch (err) {
      console.error('PDF generation failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'PDF generation failed. Please try again.' });
      }
    }
  });

  return httpServer;
}
