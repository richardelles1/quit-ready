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
  }
];

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find(p => p.slug === slug);
}
