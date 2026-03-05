import { Resend } from "resend";
import type { Simulation } from "@shared/schema";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "QuitReady <reports@quitready.app>";
const REPORT_BASE_URL = process.env.APP_URL || "https://quitready.app";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function bandLabel(score: number) {
  if (score >= 86) return "Strong Buffer";
  if (score >= 70) return "Stable";
  if (score >= 50) return "Moderately Exposed";
  return "Fragile";
}

function htmlEmail(sim: Simulation, reportUrl: string, rerunUrl: string): string {
  const score = sim.structuralBreakpointScore;
  const band = bandLabel(score);
  const runwayYears = sim.baseRunway > 0 ? (sim.baseRunway / 12).toFixed(1) : "N/A";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Your QuitReady Report</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;border-radius:12px 12px 0 0;padding:28px 36px;">
              <p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">QuitReady</p>
              <h1 style="margin:8px 0 0;color:#f8fafc;font-size:22px;font-weight:700;line-height:1.3;">Your Structural Financial Report</h1>
            </td>
          </tr>

          <!-- Score band -->
          <tr>
            <td style="background:#1e293b;padding:20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Structural Breakpoint Score</p>
                    <p style="margin:0;color:#f8fafc;font-size:36px;font-weight:800;line-height:1;">${score}<span style="font-size:18px;font-weight:400;color:#64748b;">/100</span></p>
                    <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${band}</p>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 10px;background:#334155;border-radius:6px;text-align:center;">
                          <p style="margin:0;color:#94a3b8;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Base Runway</p>
                          <p style="margin:2px 0 0;color:#f8fafc;font-size:18px;font-weight:700;">${runwayYears} yrs</p>
                        </td>
                      </tr>
                      <tr><td style="padding-top:8px;">
                        <table cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:4px 10px;background:#334155;border-radius:6px;text-align:center;">
                              <p style="margin:0;color:#94a3b8;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Monthly Burn</p>
                              <p style="margin:2px 0 0;color:#f8fafc;font-size:18px;font-weight:700;">${formatCurrency(sim.tmib)}</p>
                            </td>
                          </tr>
                        </table>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 36px;">
              <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
                Your 17-page QuitReady report is attached to this email as a PDF. Keep it — it contains your complete financial runway analysis, stress scenario results, and the structural logic behind your score.
              </p>

              <p style="margin:0 0 8px;color:#0f172a;font-size:13px;font-weight:700;">What's in your report:</p>
              <ul style="margin:0 0 24px;padding-left:20px;color:#475569;font-size:13px;line-height:2;">
                <li>Executive Snapshot — income, outflow, TMIB, accessible capital</li>
                <li>Structural Breakpoint Score breakdown across 5 factors</li>
                <li>Savings runway under 4 stress scenarios</li>
                <li>ACA healthcare transition delta</li>
                <li>Revenue growth trajectory (3 paths over 36 months)</li>
                <li>Decision interpretation and closing structural assessment</li>
              </ul>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f1f5f9;border-radius:8px;padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your permanent report link</p>
                    <p style="margin:0;font-size:13px;">
                      <a href="${reportUrl}" style="color:#3b82f6;text-decoration:none;word-break:break-all;">${reportUrl}</a>
                    </p>
                    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">Bookmark this URL — it always opens your interactive report.</p>
                  </td>
                </tr>
              </table>

              <!-- Rerun offer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="background:#f8fafc;padding:16px 20px;">
                    <p style="margin:0 0 6px;color:#0f172a;font-size:14px;font-weight:700;">Rerun with updated numbers — $4.99</p>
                    <p style="margin:0 0 14px;color:#64748b;font-size:13px;line-height:1.5;">If your income target changes, you build up more savings, or you want to model a different healthcare option, run a fresh analysis at a discounted rate. This link is unique to your purchase and can only be used once.</p>
                    <a href="${rerunUrl}" style="display:inline-block;background:#0f172a;color:#f8fafc;font-size:13px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:6px;">Run Updated Analysis → $4.99</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                Questions? Reply to this email. We read every response.<br/>
                This report is for personal educational use only and does not constitute financial, tax, or legal advice.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;border-radius:0 0 12px 12px;padding:16px 36px;">
              <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
                © 2025 QuitReady · U.S.-only · Educational use only<br/>
                You received this because you purchased a QuitReady report.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendReportEmail(
  sim: Simulation,
  pdfBuffer: Buffer,
  rerunToken: string,
  origin: string
): Promise<{ success: boolean; error?: string }> {
  if (!sim.purchaserEmail) {
    return { success: false, error: "No purchaser email on record" };
  }

  const reportUrl = `${origin}/results/${sim.id}`;
  const rerunUrl = `${origin}/rerun/${rerunToken}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: sim.purchaserEmail,
      subject: `Your QuitReady Report — Score ${sim.structuralBreakpointScore}/100`,
      html: htmlEmail(sim, reportUrl, rerunUrl),
      attachments: [
        {
          filename: `QuitReady-Report-${sim.id}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      console.error("Resend send error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Email send exception:", err);
    return { success: false, error: err.message };
  }
}
