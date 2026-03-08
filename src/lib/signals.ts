// Shared signal detection logic used by StockDetailPage and Command Center

export interface Signal {
  label: string;
  type: "bullish" | "warning" | "bearish";
}

export interface ThesisStatus {
  status: "Strengthening" | "Stable" | "Weakening" | "Broken";
  reason: string;
  score: number;
}

export function detectMultibaggerSignals(
  financials: any[],
  latestAnalysis: any,
  commitments: any[],
  shareholding: any[],
  promises: any[],
  snapshots: any[]
): Signal[] {
  const signals: Signal[] = [];
  if (financials.length >= 2) {
    const latest = financials[financials.length - 1];
    const prev = financials[financials.length - 2];

    const highRoceYears = financials.filter(f => (f.roce ?? 0) >= 15).length;
    if (highRoceYears >= 3) signals.push({ label: `ROCE >15% for ${highRoceYears}yr`, type: "bullish" });
    else if (latest.roce && latest.roce < 10) signals.push({ label: `Low ROCE ${latest.roce}%`, type: "bearish" });

    if (latest.revenue_growth && prev.revenue_growth && latest.revenue_growth > prev.revenue_growth && latest.revenue_growth > 15) {
      signals.push({ label: "Revenue growth accelerating", type: "bullish" });
    }

    if (latest.profit_growth && latest.revenue_growth && latest.profit_growth > latest.revenue_growth) {
      signals.push({ label: "Operating leverage visible", type: "bullish" });
    }

    if (latest.opm && prev.opm && latest.opm > prev.opm) {
      signals.push({ label: `OPM expanding (${prev.opm}→${latest.opm}%)`, type: "bullish" });
    } else if (latest.opm && prev.opm && latest.opm < prev.opm - 3) {
      signals.push({ label: "OPM declining", type: "warning" });
    }

    if (latest.debt_equity !== null && latest.debt_equity <= 0.5) {
      signals.push({ label: "Low debt (D/E ≤ 0.5)", type: "bullish" });
    } else if (latest.debt_equity !== null && latest.debt_equity > 2) {
      signals.push({ label: `High debt D/E ${latest.debt_equity}`, type: "bearish" });
    }

    const positiveFCFYears = financials.filter(f => (f.free_cash_flow ?? 0) > 0).length;
    if (positiveFCFYears >= 3) signals.push({ label: `Positive FCF ${positiveFCFYears}yr`, type: "bullish" });

    if (latest.eps && prev.eps && prev.eps > 0) {
      const epsGrowth = ((latest.eps - prev.eps) / prev.eps) * 100;
      if (epsGrowth > 20) signals.push({ label: `EPS +${Math.round(epsGrowth)}% YoY`, type: "bullish" });
    }

    if (latest.promoter_holding && latest.promoter_holding >= 60) {
      signals.push({ label: `High promoter ${latest.promoter_holding}%`, type: "bullish" });
    }
  }

  // Shareholding signals
  if (shareholding.length >= 2) {
    const latestSH = shareholding[shareholding.length - 1];
    const prevSH = shareholding[shareholding.length - 2];

    if (latestSH.promoters != null && prevSH.promoters != null) {
      const pChange = latestSH.promoters - prevSH.promoters;
      if (pChange > 0.5) signals.push({ label: `Promoter ↑ ${pChange.toFixed(1)}%`, type: "bullish" });
      else if (pChange < -3) signals.push({ label: `Promoter selling ${Math.abs(pChange).toFixed(1)}%`, type: "bearish" });
      else if (pChange < -1) signals.push({ label: `Promoter ↓ ${Math.abs(pChange).toFixed(1)}%`, type: "warning" });
    }

    if (latestSH.fiis != null && prevSH.fiis != null) {
      const fiiChange = latestSH.fiis - prevSH.fiis;
      if (fiiChange > 1) signals.push({ label: `FII buying ↑ ${fiiChange.toFixed(1)}%`, type: "bullish" });
      else if (fiiChange < -2) signals.push({ label: `FII selling ↓ ${Math.abs(fiiChange).toFixed(1)}%`, type: "warning" });
    }

    if (latestSH.diis != null && prevSH.diis != null) {
      const diiChange = latestSH.diis - prevSH.diis;
      if (diiChange > 2) signals.push({ label: `DII accumulating ↑ ${diiChange.toFixed(1)}%`, type: "bullish" });
    }

    if (shareholding.length >= 4) {
      const last4 = shareholding.slice(-4);
      const promoterDeclines = last4.filter((s: any, i: number) =>
        i > 0 && s.promoters != null && last4[i - 1].promoters != null && s.promoters < last4[i - 1].promoters
      ).length;
      if (promoterDeclines >= 3) signals.push({ label: "Promoter declining 3+ qtrs", type: "bearish" });
    }
  }

  // Sentiment
  if (latestAnalysis?.sentiment_score >= 8) {
    signals.push({ label: `AI Sentiment ${latestAnalysis.sentiment_score}/10`, type: "bullish" });
  } else if (latestAnalysis?.sentiment_score && latestAnalysis.sentiment_score <= 4) {
    signals.push({ label: `Low sentiment ${latestAnalysis.sentiment_score}/10`, type: "bearish" });
  }

  // Old commitments credibility
  const achieved = commitments.filter(c => c.status === "Achieved").length;
  const total = commitments.length;
  if (total >= 3 && achieved / total >= 0.7) {
    signals.push({ label: `Mgmt credibility ${Math.round(achieved / total * 100)}%`, type: "bullish" });
  }

  // Promise execution
  if (promises.length > 0) {
    const kept = promises.filter((p: any) => p.status === "kept").length;
    const broken = promises.filter((p: any) => p.status === "broken").length;
    const pending = promises.filter((p: any) => p.status === "pending").length;
    const resolved = kept + broken;

    if (resolved >= 2) {
      const credRate = Math.round((kept / resolved) * 100);
      if (credRate >= 80) signals.push({ label: `Promise credibility ${credRate}% (${kept}/${resolved})`, type: "bullish" });
      else if (credRate <= 40) signals.push({ label: `Broken promises ${broken}/${resolved}`, type: "bearish" });
      else signals.push({ label: `Promise track record ${credRate}%`, type: "warning" });
    }

    if (pending > 0 && resolved === 0) {
      signals.push({ label: `${pending} promises being tracked`, type: "warning" });
    }
  }

  // Snapshot-based signals
  if (snapshots.length > 0) {
    const latestSnap = snapshots[0];
    const flags = Array.isArray(latestSnap.red_flags) ? latestSnap.red_flags : [];
    const dodged = Array.isArray(latestSnap.dodged_questions) ? latestSnap.dodged_questions : [];

    if (flags.length >= 3) {
      signals.push({ label: `⚠ ${flags.length} red flags in ${latestSnap.quarter}`, type: "bearish" });
    } else if (flags.length >= 1) {
      signals.push({ label: `${flags.length} red flag${flags.length > 1 ? "s" : ""} in ${latestSnap.quarter}`, type: "bearish" });
    }
    if (flags.length === 0 && dodged.length === 0) {
      signals.push({ label: `Clean quarter ${latestSnap.quarter}`, type: "bullish" });
    }

    if (dodged.length >= 2) {
      signals.push({ label: `Mgmt dodging ${dodged.length} questions`, type: "warning" });
    }

    if (snapshots.length >= 2) {
      const prevSnap = snapshots[1];
      const prevFlags = Array.isArray(prevSnap.red_flags) ? prevSnap.red_flags.length : 0;
      const currFlags = flags.length;

      if (currFlags < prevFlags && prevFlags > 0) {
        signals.push({ label: `Red flags ↓ (${prevFlags}→${currFlags})`, type: "bullish" });
      } else if (currFlags > prevFlags + 1) {
        signals.push({ label: `Red flags ↑ (${prevFlags}→${currFlags})`, type: "bearish" });
      }

      const currMetrics = (latestSnap.metrics && typeof latestSnap.metrics === "object") ? latestSnap.metrics as Record<string, string> : {};
      const prevMetrics = (prevSnap.metrics && typeof prevSnap.metrics === "object") ? prevSnap.metrics as Record<string, string> : {};

      const extractNum = (val: string): number | null => {
        if (!val) return null;
        const match = String(val).match(/([\d,.]+)/);
        return match ? parseFloat(match[1].replace(/,/g, "")) : null;
      };

      let improvingMetrics = 0;
      let decliningMetrics = 0;
      const metricKeys = Object.keys(currMetrics);

      for (const key of metricKeys) {
        const curr = extractNum(currMetrics[key]);
        const prev = extractNum(prevMetrics[key]);
        if (curr !== null && prev !== null) {
          if (curr > prev) improvingMetrics++;
          else if (curr < prev) decliningMetrics++;
        }
      }

      if (metricKeys.length >= 3) {
        if (improvingMetrics > decliningMetrics * 2 && improvingMetrics >= 3) {
          signals.push({ label: `Thesis strengthening (${improvingMetrics}/${metricKeys.length} metrics ↑)`, type: "bullish" });
        } else if (decliningMetrics > improvingMetrics * 2 && decliningMetrics >= 3) {
          signals.push({ label: `Thesis weakening (${decliningMetrics}/${metricKeys.length} metrics ↓)`, type: "bearish" });
        }
      }
    }
  }

  return signals;
}

export function calculateThesisScore(signals: Signal[]): number {
  if (signals.length === 0) return 50;
  const bullish = signals.filter(s => s.type === "bullish").length;
  const bearish = signals.filter(s => s.type === "bearish").length;
  const warning = signals.filter(s => s.type === "warning").length;
  const raw = 50 + (bullish * 8) - (warning * 5) - (bearish * 12);
  return Math.max(0, Math.min(100, raw));
}

export function getThesisStatus(signals: Signal[], score: number): ThesisStatus {
  const bearish = signals.filter(s => s.type === "bearish");
  const bullish = signals.filter(s => s.type === "bullish");

  const hasRedFlags = bearish.some(s => s.label.toLowerCase().includes("red flag"));
  const hasBrokenPromises = bearish.some(s => s.label.toLowerCase().includes("broken"));
  const hasThesisWeakening = bearish.some(s => s.label.toLowerCase().includes("thesis weakening"));
  const hasThesisStrengthening = bullish.some(s => s.label.toLowerCase().includes("thesis strengthening"));
  const hasCleanQuarter = bullish.some(s => s.label.toLowerCase().includes("clean quarter"));
  const hasHighCredibility = bullish.some(s => s.label.toLowerCase().includes("credibility"));

  // Broken: score < 20 OR multiple critical failures
  if (score < 20 || (hasRedFlags && hasBrokenPromises && hasThesisWeakening)) {
    const reasons: string[] = [];
    if (hasRedFlags) reasons.push("red flags");
    if (hasBrokenPromises) reasons.push("broken promises");
    if (hasThesisWeakening) reasons.push("metrics declining");
    return { status: "Broken", reason: reasons.join(" + ") || "Score critically low", score };
  }

  // Weakening: score < 40 OR thesis weakening signal
  if (score < 40 || hasThesisWeakening) {
    const reasons: string[] = [];
    if (hasThesisWeakening) reasons.push("metrics declining QoQ");
    if (hasRedFlags) reasons.push("red flags detected");
    if (hasBrokenPromises) reasons.push("broken promises");
    return { status: "Weakening", reason: reasons.join(", ") || "Multiple warnings", score };
  }

  // Strengthening: score >= 65 AND positive thesis indicators
  if (score >= 65 && (hasThesisStrengthening || (hasCleanQuarter && hasHighCredibility))) {
    const reasons: string[] = [];
    if (hasThesisStrengthening) reasons.push("metrics improving QoQ");
    if (hasCleanQuarter) reasons.push("clean quarter");
    if (hasHighCredibility) reasons.push("high mgmt credibility");
    return { status: "Strengthening", reason: reasons.join(" + "), score };
  }

  // Stable
  return { status: "Stable", reason: `Score ${score}, balanced signals`, score };
}
