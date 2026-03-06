export interface BlogSection {
  heading?: string;
  body: string;
  isCTA?: boolean;
}

export interface BlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  publishDate: string;
  readMinutes: number;
  excerpt: string;
  sections: BlogSection[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "how-much-savings-to-quit-your-job",
    title: "How Much Savings Do You Really Need to Quit Your Job?",
    metaDescription: "Learn how much savings to quit your job by calculating your TMIB, accounting for self-employment taxes, and planning for healthcare transitions.",
    publishDate: "2025-01-15",
    readMinutes: 6,
    excerpt: "The old '6-month emergency fund' rule often fails for new entrepreneurs. Discover the real math behind a safe exit strategy.",
    sections: [
      {
        body: "Thinking about how much savings to quit your job is the first step toward freedom, but the standard advice often falls short for those transitioning to self-employment. Most financial planners suggest a six-month emergency fund, yet this doesn't account for the structural shifts in your expenses and taxes the moment you leave your W-2."
      },
      {
        heading: "Why the 6-Month Rule Undershoots",
        body: "When you are an employee, your company pays half of your FICA taxes and often subsidizes your health insurance. When you quit, these costs shift entirely to you. Additionally, a business rarely generates profit on day one. You aren't just covering your living expenses; you are funding a startup phase that includes increased tax burdens and unpredictable revenue."
      },
      {
        heading: "Runway vs. Raw Savings",
        body: "It is helpful to think in terms of 'runway' rather than just a total dollar amount. Runway is the number of months you can survive with zero income. To calculate this accurately, you must use your post-exit expenses, which include new line items like private health insurance and business overhead. You can use our [financial runway calculator](/blog/financial-runway-calculator) to see how your liquid assets translate into time."
      },
      {
        heading: "Introducing TMIB: Your True Cost of Living",
        body: "At QuitReady, we use a metric called Total Monthly Income Burden (TMIB). This is the absolute minimum amount of cash you need to generate (or withdraw) each month to keep your life and business functioning. It includes your mortgage, groceries, debt service, and the 'COBRA cliff'—the jump in healthcare costs when your employer coverage ends."
      },
      {
        isCTA: true,
        body: "Don't guess your exit numbers. [Run your financial runway analysis](/app) using our stress-test engine to see exactly when your 'structural breakpoint' occurs."
      },
      {
        heading: "Calculating Your Personal Number",
        body: "To find your target savings, start with your TMIB and multiply it by your expected 'ramp-up' period—the time it takes for your new venture to reach break-even. Then, add a 30% buffer for the 'Self-Employment Tax Surprise.' If your TMIB is $5,000 and you expect a 6-month ramp, you don't just need $30,000; you likely need closer to $45,000 to remain structurally stable through the transition."
      },
      {
        heading: "Conclusion",
        body: "Quitting your job is a math problem, not just a leap of faith. By understanding your structural burn and building a runway that respects the reality of self-employment, you can exit with confidence. For more checklist items, see our [guide on quitting your job to start a business](/blog/quit-job-start-business-financial-checklist)."
      }
    ]
  },
  {
    slug: "can-i-afford-to-quit-my-job",
    title: "Can I Afford to Quit My Job? Here's the Actual Math",
    metaDescription: "Ask yourself 'can I afford to quit my job' with confidence. We break down the 5 essential numbers, healthcare costs, and tax implications of leaving your 9-5.",
    publishDate: "2025-01-20",
    readMinutes: 7,
    excerpt: "Before you hand in your resignation, you need to stress-test your finances against the realities of self-employment taxes and healthcare.",
    sections: [
      {
        body: "The question 'can I afford to quit my job' is one of the most stressful inquiries a professional can make. It's often met with emotional advice about 'following your passion,' but the reality is dictated by your balance sheet. To answer this question objectively, you need to move beyond spreadsheets and into stress-testing."
      },
      {
        heading: "The 5 Numbers You Need",
        body: "Before deciding to quit, you must identify: 1. Your current liquid cash, 2. Your 'haircut' investment value (brokerage at 80%), 3. Your post-exit monthly burn (TMIB), 4. Your healthcare transition cost, and 5. Your estimated revenue ramp-up. Without these five data points, any plan is just a guess."
      },
      {
        heading: "The Healthcare Cost Reality Check",
        body: "Most employees are shocked by the 'COBRA cliff.' If your employer was paying $1,200 of your $1,500 monthly premium, your expenses don't just go up—your net income requirements skyrocket. Even with ACA subsidies, you must plan for a significant increase in out-of-pocket costs. Understanding [self-employment health insurance options](/blog/self-employment-healthcare-options) is critical for a successful transition."
      },
      {
        heading: "The Self-Employment Tax Trap",
        body: "In a W-2 role, you pay 7.65% in FICA taxes, and your employer matches it. When you are the employer, you pay the full 15.3%. After adjustments, this adds roughly 14.13% to your effective tax rate. If you don't reserve this from every dollar earned, your first tax season as an entrepreneur will be a liquidity crisis."
      },
      {
        isCTA: true,
        body: "Stop wondering 'can I afford to quit my job' and get a definitive answer. [Run your structural model](/app) now to see how your savings hold up against a 12-month revenue ramp."
      },
      {
        heading: "Revenue Ramp Reality",
        body: "Optimism is a requirement for entrepreneurs but a liability for financial planning. Most freelancers take 6 to 12 months to reach a 'break-even' point where business income covers their TMIB. Your savings must be deep enough to bridge this gap even if your first few clients take longer to sign than expected."
      },
      {
        heading: "Stress-Testing Your Plan",
        body: "A good plan works when things go right; a great plan works when things go wrong. What happens if your revenue is 30% lower than expected? What if your healthcare costs double? By modeling these 'worst-case' scenarios, you can identify your 'structural breakpoint'—the moment when your capital is exhausted and you are forced to return to traditional employment."
      }
    ]
  },
  {
    slug: "self-employment-healthcare-options",
    title: "Self-Employment Health Insurance: ACA, COBRA, and Partner Coverage Compared",
    metaDescription: "Navigate self-employment health insurance. Compare ACA subsidies, COBRA costs, and partner plans to find the best fit for your job exit.",
    publishDate: "2025-01-25",
    readMinutes: 6,
    excerpt: "Healthcare is the single most volatile expense when quitting a job. Learn how to model your costs before you lose your employer subsidy.",
    sections: [
      {
        body: "Finding affordable self-employment health insurance is often the 'final boss' of quitting a corporate job. In the U.S., health insurance is so tightly coupled with employment that leaving a role can trigger a 400% increase in monthly premiums if you aren't prepared for the transition."
      },
      {
        heading: "The Three Primary Options",
        body: "Most people exiting a job have three paths: COBRA, the ACA Marketplace, or a partner's plan. COBRA allows you to keep your exact same coverage but requires you to pay 102% of the total premium (including the portion your employer used to pay). The ACA Marketplace offers income-based subsidies, and a partner's plan is often the most cost-effective if available."
      },
      {
        heading: "ACA Subsidies and the 'Cliff'",
        body: "The Affordable Care Act (ACA) provides tax credits that lower your premiums based on your estimated annual income. However, there is a 'subsidy cliff' (traditionally at 400% of the Federal Poverty Level). If your business performs too well, your subsidies might be clawed back, or you may lose them entirely. Accurate income projection is essential to avoid a massive tax bill at the end of the year."
      },
      {
        isCTA: true,
        body: "Healthcare costs are a major component of your [Total Monthly Income Burden](/app). Plug in your expected premiums to see how they impact your overall runway."
      },
      {
        heading: "COBRA: When It's Worth It",
        body: "While expensive, COBRA is often the best choice if you have already met your deductible for the year or are mid-treatment for a chronic condition. It provides stability during a high-stress transition, even if the $1,500+ monthly price tag is painful. It buys you 18 months of time to get your business income to a level that can support the cost."
      },
      {
        heading: "The Volatility of Healthcare Expenses",
        body: "Unlike your mortgage or car payment, healthcare costs can change annually and are subject to complex tax rules. It is the most volatile line item in any [financial runway calculation](/blog/financial-runway-calculator). When modeling your exit, always use a conservative estimate for premiums and include a buffer for out-of-pocket maximums."
      },
      {
        heading: "Conclusion",
        body: "Do not let healthcare fear keep you in a job you hate, but do not ignore the math. Map out your transition plan early, and if you're looking for a complete roadmap, check our [quit job start business checklist](/blog/quit-job-start-business-financial-checklist)."
      }
    ]
  },
  {
    slug: "financial-runway-calculator",
    title: "Financial Runway: How to Calculate It Before Quitting Your Job",
    metaDescription: "Use a financial runway calculator approach to determine your survival time after quitting. Learn about liquidity tiers and stress-testing your savings.",
    publishDate: "2025-02-01",
    readMinutes: 6,
    excerpt: "Runway isn't just your bank balance divided by your rent. It's a dynamic measure of your structural stability during a career transition.",
    sections: [
      {
        body: "Thinking like a startup founder is the best way to handle your personal finances when you quit your job. Central to this mindset is the use of a financial runway calculator—a tool that tells you exactly how many months of life you have left if you never make another dime."
      },
      {
        heading: "Runway vs. Savings Balance",
        body: "Your savings balance is a static number; your runway is a dynamic one. If you have $50,000 but your monthly expenses (TMIB) are $10,000, you have a 5-month runway. If you can lower your TMIB to $5,000, you've doubled your runway without saving another cent. This is why [calculating how much savings you need](/blog/how-much-savings-to-quit-your-job) requires looking at both sides of the ledger."
      },
      {
        heading: "The Three Liquidity Tiers",
        body: "Not all assets are created equal. When calculating runway, you must apply 'haircuts' to different tiers: Tier 1 is cash (100% value), Tier 2 is brokerage accounts (80% value to account for market volatility and taxes), and Tier 3 is retirement/home equity (often 30-50% value due to penalties and illiquidity). Only Tier 1 and Tier 2 should be considered part of your primary runway."
      },
      {
        isCTA: true,
        body: "Want a more sophisticated tool than a spreadsheet? [Run your financial runway analysis](/app) with our scenario engine to see how these tiers perform under pressure."
      },
      {
        heading: "The Base Case vs. The Stress Case",
        body: "Your 'base case' is what you hope will happen. Your 'stress case' is what happens when a client fires you or the market dips 15%. A safe exit strategy usually requires a base case runway of at least 12 months and a severe stress case runway of at least 6 months. If your numbers don't meet this threshold, you may need to reconsider [if you can afford to quit your job](/blog/can-i-afford-to-quit-my-job) just yet."
      },
      {
        heading: "Why TMIB is the Lever",
        body: "Total Monthly Income Burden (TMIB) is the divisor in the runway equation. By aggressively auditing your fixed costs before you quit, you extend your runway. This might mean pausing retirement contributions, switching to a high-deductible health plan, or eliminating unused subscriptions. Every dollar removed from your TMIB is another day of freedom."
      }
    ]
  },
  {
    slug: "quit-job-start-business-financial-checklist",
    title: "Quitting Your Job to Start a Business: The 10-Point Financial Checklist",
    metaDescription: "The ultimate 10-point checklist for quitting your job to start a business. Cover TMIB, taxes, healthcare, and runway modeling.",
    publishDate: "2025-02-05",
    readMinutes: 7,
    excerpt: "Before you make the leap, run through this comprehensive financial audit to ensure your transition is structurally sound.",
    sections: [
      {
        body: "When you quit job start business activities, you are moving from a world of predictable bi-weekly checks to a world of variable revenue and structural costs. To survive this transition, you need more than a business plan—you need a financial fortress. This 10-point checklist will help you build it."
      },
      {
        heading: "1. Know Your TMIB",
        body: "Calculate your Total Monthly Income Burden. This is your 'burn rate'—the total amount of cash leaving your accounts every month, including taxes and insurance."
      },
      {
        heading: "2. Establish a Healthcare Plan",
        body: "Whether it's COBRA, ACA, or a partner's plan, have your enrollment dates and premium costs locked in before your last day. Research [self-employment health insurance](/blog/self-employment-healthcare-options) to understand your choices."
      },
      {
        heading: "3. Build a 3-Scenario Savings Model",
        body: "Calculate your [financial runway](/blog/financial-runway-calculator) for three scenarios: your 'Target' revenue, 'Low' revenue (50% of target), and 'Zero' revenue."
      },
      {
        isCTA: true,
        body: "Don't check these off in your head. [Generate your 17-page report](/app) to see exactly where your plan stands across all 10 checklist items."
      },
      {
        heading: "4. Reserve 25–30% for Taxes",
        body: "Self-employment tax is 15.3%, on top of federal and state income tax. Set up a separate 'Tax' savings account and move a percentage of every check there immediately."
      },
      {
        heading: "5. Calculate Your Break-even Revenue",
        body: "How much gross revenue do you need to earn to cover your TMIB and your taxes? This number is usually 40-50% higher than your old salary's take-home pay."
      },
      {
        heading: "6. Map Your Ramp Timeline",
        body: "Be realistic. If your sales cycle is 3 months, don't expect revenue in month 1. Plan for a 6-month ramp-up period."
      },
      {
        heading: "7. Identify Partner Income Offsets",
        body: "If you have a spouse or partner, how much of the household TMIB can they cover? This is your ultimate safety net and extends your runway significantly."
      },
      {
        heading: "8. Audit Fixed Debt Obligations",
        body: "Can you refinance or consolidate debt to lower your monthly payments before you lose your W-2 status? It's much harder to get a loan once you are self-employed."
      },
      {
        heading: "9. Define Your Tier 1/2/3 Capital",
        body: "Know exactly which accounts you will draw from and in what order. Protect your Tier 1 (cash) at all costs."
      },
      {
        heading: "10. Run a Stress Test",
        body: "What is your 'structural breakpoint'? Knowing the date you'll run out of money if things go poorly allows you to pivot before it becomes a crisis. See our guide on [how much savings you really need](/blog/how-much-savings-to-quit-your-job) for more on this."
      }
    ]
  },
  {
    slug: "quit-job-become-creator-financial-guide",
    title: "Quit Your Job to Become a Creator: The Financial Bridge You Actually Need",
    metaDescription: "Thinking about quitting your job to become a creator? Learn the real financial math behind the W-2-to-creator transition, including healthcare, self-employment tax, and income volatility.",
    publishDate: "2025-02-15",
    readMinutes: 7,
    excerpt: "Creator economy advice is full of audience-growth tips. It's almost entirely silent on how to survive the first 18 months financially. Here's the math they don't cover.",
    sections: [
      {
        body: "Every week, thousands of people quit their jobs to become full-time creators. The content about this transition is almost entirely focused on growing an audience, finding your niche, and building a brand. Virtually none of it covers the financial structure required to survive long enough to succeed. That gap is where most creator careers end."
      },
      {
        heading: "The Creator Economy's Dirty Financial Secret",
        body: "Creator income is real, but it is almost never linear. Sponsorship deals have net-60 payment terms. Platform monetization fluctuates with algorithm changes. Product launches are lumpy. Course sales front-load. What this means financially is that you are not trading a predictable salary for a predictable revenue stream. You are trading a paycheck for a portfolio of irregular payments that can swing 40% month to month."
      },
      {
        heading: "What a Financial Bridge Actually Looks Like",
        body: "A financial bridge is the capital structure that funds your life between your last paycheck and the month your creator income reliably covers your TMIB (Total Monthly Income Burden). For most creators, this bridge needs to span 12 to 24 months. It must account for: your baseline living expenses, healthcare premiums after losing employer coverage, self-employment taxes on every dollar earned, and business costs like software, equipment, and ads."
      },
      {
        heading: "The Healthcare Line Item Nobody Budgets",
        body: "When you leave a corporate job, your employer's health insurance contribution disappears overnight. If your employer was covering $900 of a $1,200 monthly premium, your expenses don't just go up by $300. They go up by $900. Depending on your income and state, ACA marketplace plans may offset some of this, but you need to model this cost explicitly before you hand in your notice. It is the most consistently underestimated line item in creator financial plans."
      },
      {
        isCTA: true,
        body: "Curious how long your savings will actually last as a creator? [Run your structural model](/app) to see exactly which month your capital runs out under different revenue scenarios."
      },
      {
        heading: "Self-Employment Tax: The 14% Surprise",
        body: "As a W-2 employee, your employer paid half of your FICA taxes. As a self-employed creator, you pay both halves. After accounting for the deduction, this adds roughly 14.13% to your effective tax rate on every dollar of net income. If your creator income is $5,000 in a month and you spend it all, you will owe approximately $700 in SE tax on top of your regular income taxes. Build a tax reserve from your first dollar of creator revenue."
      },
      {
        heading: "Calculating Your Minimum Viable Bridge",
        body: "To calculate the minimum bridge you need, multiply your post-exit TMIB by your expected ramp period in months, then add 30% as a tax and volatility buffer. If your monthly burn is $6,000 and you expect 18 months to reach break-even, your minimum bridge is $6,000 x 18 x 1.3, which equals $140,400. Many creators start with less and make it work by aggressively cutting their TMIB, earning part-time consulting income, or relying on a partner's income. But you should know this number before you quit, not after."
      },
      {
        heading: "The Structural Exit vs. the Emotional Exit",
        body: "A structural exit is one where you have modeled your numbers, know your runway, and have a clear trigger point for returning to traditional employment if needed. An emotional exit is one where you quit because you are burned out and figure the rest out later. Both can work, but only the structural exit gives you the calm to build something great without financial panic driving every decision. For a complete pre-exit checklist, read our [10-point financial checklist for quitting your job to start a business](/blog/quit-job-start-business-financial-checklist)."
      }
    ]
  },
  {
    slug: "when-to-quit-your-day-job-for-entrepreneurship",
    title: "When Is the Right Time to Quit Your Day Job for Entrepreneurship?",
    metaDescription: "Stop waiting for the 'perfect moment' to quit your day job for entrepreneurship. Learn the four concrete financial thresholds that signal structural readiness.",
    publishDate: "2025-02-22",
    readMinutes: 6,
    excerpt: "There is no perfect moment. But there are structural signals that tell you whether your plan can absorb the shock of an exit. Here's how to read them.",
    sections: [
      {
        body: "The most common piece of advice about when to quit your day job is 'when it feels right.' This is nearly useless. Feelings are not a financial model. The second most common piece of advice is 'when you have six months of savings,' which is closer to useful but still dramatically undershoots the real cost of a self-employment transition. The truth is, readiness is a structural question, not an emotional one."
      },
      {
        heading: "Why There Is No Perfect Moment",
        body: "Waiting for certainty is a trap. Entrepreneurship is inherently uncertain, and no amount of planning eliminates that risk. What planning does is give you a defined threshold: a set of conditions you can objectively evaluate to decide whether the current moment is structurally sound enough to proceed. The goal is not certainty. It is a calculated, informed bet."
      },
      {
        heading: "Threshold 1: The Coverage Ratio",
        body: "Your coverage ratio is the percentage of your TMIB (Total Monthly Income Burden) that your current side income or new venture already covers. A coverage ratio above 50% is a strong signal. It means you have validated that your new income model works and that you only need to close a manageable gap. A coverage ratio below 20% means your primary income is still entirely dependent on your employer. Neither is automatically a go or no-go, but the ratio sets the context for every other number."
      },
      {
        heading: "Threshold 2: The Savings Floor",
        body: "Your savings floor is the minimum capital you need to feel structurally safe making the exit. Unlike the generic six-month rule, calculate this based on your actual post-exit TMIB. If your burn rate is $7,000 per month and you expect a 12-month ramp, your floor is at least $84,000 in accessible capital before taxes and haircuts. Use our guide on [how much savings you need to quit your job](/blog/how-much-savings-to-quit-your-job) to run this math properly."
      },
      {
        isCTA: true,
        body: "Not sure if your numbers cross the threshold? [Run your structural model](/app) to see your exact breakpoint and coverage ratio under four different revenue scenarios."
      },
      {
        heading: "Threshold 3: Ramp Certainty",
        body: "Ramp certainty is your confidence level that new income will appear within a predictable window. It is high when you have signed contracts, committed clients, or a validated product with consistent sales. It is low when your plan depends on assumptions about clients who have not yet paid you anything. You can offset low ramp certainty with a larger savings floor, but you cannot ignore the ramp timeline entirely."
      },
      {
        heading: "Threshold 4: Structural Flexibility",
        body: "Structural flexibility is the degree to which you can reduce your TMIB in a crisis. If your fixed costs are $6,500 per month but you could survive on $4,000 by pausing retirement contributions and renegotiating your rent, your structural flexibility is high. If every dollar of your burn rate is locked into non-negotiable fixed payments, a revenue shortfall becomes a crisis with no exits. High flexibility is a significant indicator of transition readiness."
      },
      {
        heading: "Putting It Together",
        body: "There is no single number that tells you when to quit. But if your coverage ratio is above 30%, your savings floor is funded, your ramp has at least some confirmed signal, and your structural flexibility is moderate, you are likely in a zone where the decision is rational. If you are failing two or more of these thresholds, the timing is probably premature. For a full pre-exit checklist, see our [10-point financial guide for quitting to start a business](/blog/quit-job-start-business-financial-checklist)."
      }
    ]
  },
  {
    slug: "freelance-income-volatility-financial-planning",
    title: "Freelance Income Volatility: How to Build a Financial Plan That Survives Feast and Famine",
    metaDescription: "Freelance income volatility is the biggest threat to new freelancers, not client acquisition. Learn how to build a financial plan that holds up through irregular income cycles.",
    publishDate: "2025-03-01",
    readMinutes: 7,
    excerpt: "Most freelance financial advice assumes income is predictable. It isn't. Here's how to build a plan that works when the calendar is empty and when it's overflowing.",
    sections: [
      {
        body: "The hardest financial adjustment most new freelancers face has nothing to do with taxes or healthcare. It is the psychological and structural challenge of managing income that can swing from $12,000 in one month to $800 in the next. Standard personal finance advice is built for predictable W-2 income. Applied to freelancing, it often fails completely."
      },
      {
        heading: "Why Static Budgets Break Under Variable Income",
        body: "A static budget assumes a fixed monthly income and allocates spending against it. When you are a freelancer, your income is rarely the same two months in a row. Applying a static budget to a variable income creates a recurring crisis: strong months feel fine, weak months require you to either drain savings or cut expenses on short notice. Neither outcome is sustainable. The fix is to stop budgeting from income and start budgeting from a smoothed monthly draw."
      },
      {
        heading: "The Income Smoothing Method",
        body: "Income smoothing is the practice of depositing all business revenue into a dedicated business account and then paying yourself a consistent monthly 'salary' from that account. In high-revenue months, the surplus builds in the business account as a buffer. In low-revenue months, the buffer absorbs the shortfall without touching your personal spending. The key discipline is to keep your personal 'salary' conservative, typically 60 to 70 percent of your average monthly revenue, to ensure the buffer builds over time."
      },
      {
        heading: "Building Your Famine Reserve",
        body: "Beyond month-to-month smoothing, every freelancer needs a famine reserve: a dedicated pool of capital specifically for extended low-revenue periods. Industry data consistently shows that most freelancers experience at least one month per year where income falls more than 50% below their average. If your average monthly revenue is $8,000, your famine reserve should hold at least three months of your TMIB at full cost, including healthcare and taxes. Calculate your TMIB carefully using our guide on [financial runway](/blog/financial-runway-calculator)."
      },
      {
        isCTA: true,
        body: "Want to see how your freelance plan holds up across four different revenue scenarios? [Run your structural model](/app) to find your exact breakpoint and runway under stress."
      },
      {
        heading: "Quarterly Tax Payments: The Discipline That Protects You",
        body: "As a freelancer, federal estimated taxes are due four times per year. Missing these payments leads to underpayment penalties and a large, unexpected tax bill in April. The simplest system is to move 28 to 32 percent of every client payment into a separate tax savings account immediately after it clears. Do not touch this account for anything other than tax payments. It becomes untouchable the moment you treat it as an emergency fund."
      },
      {
        heading: "The Feast Trap",
        body: "Counterintuitively, high-revenue months are where many freelancers make their worst financial decisions. A $15,000 month feels like proof that the plan is working and can trigger lifestyle inflation, underreserving for taxes, and underfunding the famine reserve. The structural rule is simple: treat every feast month like it is the last one for six months. Excess should flow into the famine reserve and tax account, not into discretionary spending."
      },
      {
        heading: "Stress-Testing Your Freelance Model",
        body: "A plan that works in your best months is not a plan. A real freelance financial plan needs to be tested against your worst-case months. What happens if you have two consecutive months at 30% of your average revenue? How long does your famine reserve last? At what month does your capital run out? These are the questions a [structural stress test](/app) answers. Knowing your breakpoint in advance gives you a trigger point to take action before a slow quarter becomes an existential crisis. For more on understanding the financial structure of leaving employment, read our [complete guide to quitting your job to start a business](/blog/quit-job-start-business-financial-checklist)."
      }
    ]
  }
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find(p => p.slug === slug);
}
