// Shared signal detection logic used by StockDetailPage and Command Center

export interface Signal {
  label: string;
  type: "bullish" | "warning" | "bearish";
  category: "financial" | "concall" | "credibility" | "shareholding" | "early_cycle";
}

export interface ThesisStatus {
  status: "Strengthening" | "Stable" | "Weakening" | "Broken";
  reason: string;
  score: number;
}

export interface CredibilityDimensions {
  guidanceAccuracy: number | null; // % of targets met
  narrativeConsistency: number | null; // sentiment stability
  executionSpeed: number | null; // avg quarters to resolve
  overall: number | null;
}

export function detectMultibaggerSignals(
  financials: any[],
  latestAnalysis: any,
  commitments: any[],
  shareholding: any[],
  promises: any[],
  snapshots: any[],
  allAnalyses?: any[]
): Signal[] {
  const signals: Signal[] = [];

  // ═══ FINANCIAL SIGNALS ═══
  if (financials.length >= 2) {
    const latest = financials[financials.length - 1];
    const prev = financials[financials.length - 2];

    const highRoceYears = financials.filter(f => (f.roce ?? 0) >= 15).length;
    if (highRoceYears >= 3) signals.push({ label: `ROCE >15% for ${highRoceYears}yr`, type: "bullish", category: "financial" });
    else if (latest.roce && latest.roce < 10) signals.push({ label: `Low ROCE ${latest.roce}%`, type: "bearish", category: "financial" });

    if (latest.revenue_growth && prev.revenue_growth && latest.revenue_growth > prev.revenue_growth && latest.revenue_growth > 15) {
      signals.push({ label: "Revenue growth accelerating", type: "bullish", category: "financial" });
    }

    if (latest.profit_growth && latest.revenue_growth && latest.profit_growth > latest.revenue_growth) {
      signals.push({ label: "Operating leverage visible", type: "bullish", category: "financial" });
    }

    if (latest.opm && prev.opm && latest.opm > prev.opm) {
      signals.push({ label: `OPM expanding (${prev.opm}→${latest.opm}%)`, type: "bullish", category: "financial" });
    } else if (latest.opm && prev.opm && latest.opm < prev.opm - 3) {
      signals.push({ label: "OPM declining", type: "warning", category: "financial" });
    }

    if (latest.debt_equity !== null && latest.debt_equity <= 0.5) {
      signals.push({ label: "Low debt (D/E ≤ 0.5)", type: "bullish", category: "financial" });
    } else if (latest.debt_equity !== null && latest.debt_equity > 2) {
      signals.push({ label: `High debt D/E ${latest.debt_equity}`, type: "bearish", category: "financial" });
    }

    const positiveFCFYears = financials.filter(f => (f.free_cash_flow ?? 0) > 0).length;
    if (positiveFCFYears >= 3) signals.push({ label: `Positive FCF ${positiveFCFYears}yr`, type: "bullish", category: "financial" });

    if (latest.eps && prev.eps && prev.eps > 0) {
      const epsGrowth = ((latest.eps - prev.eps) / prev.eps) * 100;
      if (epsGrowth > 20) signals.push({ label: `EPS +${Math.round(epsGrowth)}% YoY`, type: "bullish", category: "financial" });
    }

    if (latest.promoter_holding && latest.promoter_holding >= 60) {
      signals.push({ label: `High promoter ${latest.promoter_holding}%`, type: "bullish", category: "financial" });
    }
  }

  // ═══ SHAREHOLDING SIGNALS ═══
  if (shareholding.length >= 2) {
    const latestSH = shareholding[shareholding.length - 1];
    const prevSH = shareholding[shareholding.length - 2];

    if (latestSH.promoters != null && prevSH.promoters != null) {
      const pChange = latestSH.promoters - prevSH.promoters;
      if (pChange > 0.5) signals.push({ label: `Promoter ↑ ${pChange.toFixed(1)}%`, type: "bullish", category: "shareholding" });
      else if (pChange < -3) signals.push({ label: `Promoter selling ${Math.abs(pChange).toFixed(1)}%`, type: "bearish", category: "shareholding" });
      else if (pChange < -1) signals.push({ label: `Promoter ↓ ${Math.abs(pChange).toFixed(1)}%`, type: "warning", category: "shareholding" });
    }

    if (latestSH.fiis != null && prevSH.fiis != null) {
      const fiiChange = latestSH.fiis - prevSH.fiis;
      if (fiiChange > 1) signals.push({ label: `FII buying ↑ ${fiiChange.toFixed(1)}%`, type: "bullish", category: "shareholding" });
      else if (fiiChange < -2) signals.push({ label: `FII selling ↓ ${Math.abs(fiiChange).toFixed(1)}%`, type: "warning", category: "shareholding" });
    }

    if (latestSH.diis != null && prevSH.diis != null) {
      const diiChange = latestSH.diis - prevSH.diis;
      if (diiChange > 2) signals.push({ label: `DII accumulating ↑ ${diiChange.toFixed(1)}%`, type: "bullish", category: "shareholding" });
    }

    if (shareholding.length >= 4) {
      const last4 = shareholding.slice(-4);
      const promoterDeclines = last4.filter((s: any, i: number) =>
        i > 0 && s.promoters != null && last4[i - 1].promoters != null && s.promoters < last4[i - 1].promoters
      ).length;
      if (promoterDeclines >= 3) signals.push({ label: "Promoter declining 3+ qtrs", type: "bearish", category: "shareholding" });
    }
  }

  // ═══ CONCALL / SENTIMENT SIGNALS ═══
  if (latestAnalysis?.sentiment_score >= 8) {
    signals.push({ label: `AI Sentiment ${latestAnalysis.sentiment_score}/10`, type: "bullish", category: "concall" });
  } else if (latestAnalysis?.sentiment_score && latestAnalysis.sentiment_score <= 4) {
    signals.push({ label: `Low sentiment ${latestAnalysis.sentiment_score}/10`, type: "bearish", category: "concall" });
  }

  // Narrative consistency: check if sentiment is stable/improving across analyses
  const sortedAnalyses = allAnalyses || (latestAnalysis ? [latestAnalysis] : []);
  if (sortedAnalyses.length >= 3) {
    const recent3 = sortedAnalyses.slice(0, 3);
    const scores = recent3.map((a: any) => a.sentiment_score).filter((s: any) => s != null);
    if (scores.length >= 3) {
      const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      const variance = scores.reduce((s: number, v: number) => s + Math.pow(v - avg, 2), 0) / scores.length;
      if (variance <= 1 && avg >= 7) {
        signals.push({ label: "Consistent positive narrative", type: "bullish", category: "concall" });
      } else if (variance > 4) {
        signals.push({ label: "Erratic management narrative", type: "warning", category: "concall" });
      }
    }
  }

  // Management tone signals
  if (latestAnalysis?.management_tone) {
    const tone = latestAnalysis.management_tone.toLowerCase();
    if (tone.includes("defensive") || tone.includes("evasive")) {
      signals.push({ label: `Mgmt tone: ${latestAnalysis.management_tone}`, type: "warning", category: "concall" });
    }
  }

  // ═══ EARLY CYCLE SIGNALS (from concall analysis) ═══
  if (latestAnalysis) {
    const checkText = (text: string | null | undefined, keywords: string[], label: string) => {
      if (!text) return;
      const lower = text.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        signals.push({ label, type: "bullish", category: "early_cycle" });
      }
    };

    // Capacity utilization signals
    checkText(latestAnalysis.capacity_expansion, ["utilization", "capacity utilization", ">85%", "90%", "full capacity", "near capacity"], "Capacity utilization high");
    checkText(latestAnalysis.capacity_expansion, ["new plant", "commissioning", "greenfield", "brownfield", "capex"], "New capacity commissioning");

    // Order book / demand signals
    checkText(latestAnalysis.demand_outlook, ["record order", "order book", "highest ever", "strong pipeline", "robust demand"], "Strong order pipeline");
    checkText(latestAnalysis.demand_outlook, ["pricing power", "price hike", "price increase", "margin expansion"], "Pricing power returning");

    // Check growth drivers for early cycle indicators
    const growthDrivers = Array.isArray(latestAnalysis.growth_drivers) ? latestAnalysis.growth_drivers : [];
    const allDriversText = growthDrivers.join(" ").toLowerCase();
    if (allDriversText.includes("export") && (allDriversText.includes("grow") || allDriversText.includes("expand") || allDriversText.includes("new market"))) {
      signals.push({ label: "Export expansion underway", type: "bullish", category: "early_cycle" });
    }

    // Industry tailwinds
    const tailwinds = Array.isArray(latestAnalysis.industry_tailwinds) ? latestAnalysis.industry_tailwinds : [];
    if (tailwinds.length >= 3) {
      signals.push({ label: `${tailwinds.length} industry tailwinds`, type: "bullish", category: "early_cycle" });
    }

    // Guidance signals
    if (latestAnalysis.guidance) {
      const guidanceLower = latestAnalysis.guidance.toLowerCase();
      if (guidanceLower.includes("upgrade") || guidanceLower.includes("raised") || guidanceLower.includes("better than expected")) {
        signals.push({ label: "Guidance upgraded", type: "bullish", category: "early_cycle" });
      } else if (guidanceLower.includes("downgrade") || guidanceLower.includes("lower") || guidanceLower.includes("muted")) {
        signals.push({ label: "Guidance downgraded", type: "bearish", category: "early_cycle" });
      }
    }
  }

  // ═══ CREDIBILITY SIGNALS ═══
  // Old commitments credibility
  const achieved = commitments.filter(c => c.status === "Achieved").length;
  const total = commitments.length;
  if (total >= 3 && achieved / total >= 0.7) {
    signals.push({ label: `Mgmt credibility ${Math.round(achieved / total * 100)}%`, type: "bullish", category: "credibility" });
  }

  // Promise execution
  if (promises.length > 0) {
    const kept = promises.filter((p: any) => p.status === "kept").length;
    const broken = promises.filter((p: any) => p.status === "broken").length;
    const pending = promises.filter((p: any) => p.status === "pending").length;
    const resolved = kept + broken;

    if (resolved >= 2) {
      const credRate = Math.round((kept / resolved) * 100);
      if (credRate >= 80) signals.push({ label: `Promise credibility ${credRate}% (${kept}/${resolved})`, type: "bullish", category: "credibility" });
      else if (credRate <= 40) signals.push({ label: `Broken promises ${broken}/${resolved}`, type: "bearish", category: "credibility" });
      else signals.push({ label: `Promise track record ${credRate}%`, type: "warning", category: "credibility" });
    }

    if (pending > 0 && resolved === 0) {
      signals.push({ label: `${pending} promises being tracked`, type: "warning", category: "credibility" });
    }
  }

  // ═══ SNAPSHOT-BASED SIGNALS ═══
  if (snapshots.length > 0) {
    const latestSnap = snapshots[0];
    const flags = Array.isArray(latestSnap.red_flags) ? latestSnap.red_flags : [];
    const dodged = Array.isArray(latestSnap.dodged_questions) ? latestSnap.dodged_questions : [];

    if (flags.length >= 3) {
      signals.push({ label: `⚠ ${flags.length} red flags in ${latestSnap.quarter}`, type: "bearish", category: "concall" });
    } else if (flags.length >= 1) {
      signals.push({ label: `${flags.length} red flag${flags.length > 1 ? "s" : ""} in ${latestSnap.quarter}`, type: "bearish", category: "concall" });
    }
    if (flags.length === 0 && dodged.length === 0) {
      signals.push({ label: `Clean quarter ${latestSnap.quarter}`, type: "bullish", category: "concall" });
    }

    if (dodged.length >= 2) {
      signals.push({ label: `Mgmt dodging ${dodged.length} questions`, type: "warning", category: "concall" });
    }

    if (snapshots.length >= 2) {
      const prevSnap = snapshots[1];
      const prevFlags = Array.isArray(prevSnap.red_flags) ? prevSnap.red_flags.length : 0;
      const currFlags = flags.length;

      if (currFlags < prevFlags && prevFlags > 0) {
        signals.push({ label: `Red flags ↓ (${prevFlags}→${currFlags})`, type: "bullish", category: "concall" });
      } else if (currFlags > prevFlags + 1) {
        signals.push({ label: `Red flags ↑ (${prevFlags}→${currFlags})`, type: "bearish", category: "concall" });
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
          signals.push({ label: `Thesis strengthening (${improvingMetrics}/${metricKeys.length} metrics ↑)`, type: "bullish", category: "concall" });
        } else if (decliningMetrics > improvingMetrics * 2 && decliningMetrics >= 3) {
          signals.push({ label: `Thesis weakening (${decliningMetrics}/${metricKeys.length} metrics ↓)`, type: "bearish", category: "concall" });
        }
      }
    }
  }

  return signals;
}

// ═══ CATEGORY-BASED WEIGHTED SCORING ═══
// Financial 40%, Concall 30%, Credibility 20%, Shareholding 10%
const CATEGORY_WEIGHTS: Record<string, number> = {
  financial: 0.40,
  concall: 0.30,
  credibility: 0.20,
  shareholding: 0.10,
  early_cycle: 0.30, // early cycle signals boost concall weight
};

export function calculateThesisScore(signals: Signal[]): number {
  if (signals.length === 0) return 50;

  // Group by category
  const byCategory: Record<string, Signal[]> = {};
  for (const s of signals) {
    const cat = s.category || "financial";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  }

  // Calculate raw score per category (base 50, +8 bullish, -5 warning, -12 bearish)
  let weightedScore = 0;
  let totalWeight = 0;

  const categories = ["financial", "concall", "credibility", "shareholding", "early_cycle"];
  for (const cat of categories) {
    const catSignals = byCategory[cat] || [];
    if (catSignals.length === 0) continue;

    const bullish = catSignals.filter(s => s.type === "bullish").length;
    const warning = catSignals.filter(s => s.type === "warning").length;
    const bearish = catSignals.filter(s => s.type === "bearish").length;

    const catScore = Math.max(0, Math.min(100, 50 + (bullish * 8) - (warning * 5) - (bearish * 12)));
    const weight = CATEGORY_WEIGHTS[cat] || 0.1;

    weightedScore += catScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 50;
  return Math.max(0, Math.min(100, Math.round(weightedScore / totalWeight)));
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  weight: number;
  score: number;
  bullish: number;
  warning: number;
  bearish: number;
}

export function getCategoryBreakdown(signals: Signal[]): CategoryBreakdown[] {
  const labels: Record<string, string> = {
    financial: "Financial",
    concall: "Concall Intelligence",
    credibility: "Mgmt Credibility",
    shareholding: "Shareholding",
    early_cycle: "Early Cycle",
  };

  const byCategory: Record<string, Signal[]> = {};
  for (const s of signals) {
    const cat = s.category || "financial";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  }

  return Object.entries(byCategory).map(([cat, sigs]) => {
    const bullish = sigs.filter(s => s.type === "bullish").length;
    const warning = sigs.filter(s => s.type === "warning").length;
    const bearish = sigs.filter(s => s.type === "bearish").length;
    const score = Math.max(0, Math.min(100, 50 + (bullish * 8) - (warning * 5) - (bearish * 12)));
    return {
      category: cat,
      label: labels[cat] || cat,
      weight: CATEGORY_WEIGHTS[cat] || 0.1,
      score,
      bullish,
      warning,
      bearish,
    };
  }).sort((a, b) => b.weight - a.weight);
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
  const hasEarlyCycle = bullish.some(s => s.category === "early_cycle");

  if (score < 20 || (hasRedFlags && hasBrokenPromises && hasThesisWeakening)) {
    const reasons: string[] = [];
    if (hasRedFlags) reasons.push("red flags");
    if (hasBrokenPromises) reasons.push("broken promises");
    if (hasThesisWeakening) reasons.push("metrics declining");
    return { status: "Broken", reason: reasons.join(" + ") || "Score critically low", score };
  }

  if (score < 40 || hasThesisWeakening) {
    const reasons: string[] = [];
    if (hasThesisWeakening) reasons.push("metrics declining QoQ");
    if (hasRedFlags) reasons.push("red flags detected");
    if (hasBrokenPromises) reasons.push("broken promises");
    return { status: "Weakening", reason: reasons.join(", ") || "Multiple warnings", score };
  }

  if (score >= 65 && (hasThesisStrengthening || (hasCleanQuarter && hasHighCredibility) || hasEarlyCycle)) {
    const reasons: string[] = [];
    if (hasThesisStrengthening) reasons.push("metrics improving QoQ");
    if (hasCleanQuarter) reasons.push("clean quarter");
    if (hasHighCredibility) reasons.push("high mgmt credibility");
    if (hasEarlyCycle) reasons.push("early cycle signals");
    return { status: "Strengthening", reason: reasons.join(" + "), score };
  }

  return { status: "Stable", reason: `Score ${score}, balanced signals`, score };
}

// ═══ MANAGEMENT CREDIBILITY DIMENSIONS ═══
export function calculateCredibilityDimensions(
  promises: any[],
  analyses: any[],
  commitments: any[]
): CredibilityDimensions {
  // 1. Guidance Accuracy: % of resolved promises kept
  let guidanceAccuracy: number | null = null;
  const kept = promises.filter((p: any) => p.status === "kept").length;
  const broken = promises.filter((p: any) => p.status === "broken").length;
  const resolved = kept + broken;
  // Also factor in old commitments
  const achievedCommitments = commitments.filter(c => c.status === "Achieved").length;
  const totalCommitments = commitments.length;
  const totalResolved = resolved + totalCommitments;
  const totalKept = kept + achievedCommitments;
  if (totalResolved >= 2) {
    guidanceAccuracy = Math.round((totalKept / totalResolved) * 100);
  }

  // 2. Narrative Consistency: low variance in sentiment scores = consistent
  let narrativeConsistency: number | null = null;
  const sentimentScores = analyses
    .map((a: any) => a.sentiment_score)
    .filter((s: any) => s != null && s > 0);
  if (sentimentScores.length >= 3) {
    const avg = sentimentScores.reduce((a: number, b: number) => a + b, 0) / sentimentScores.length;
    const variance = sentimentScores.reduce((s: number, v: number) => s + Math.pow(v - avg, 2), 0) / sentimentScores.length;
    // Convert variance to 0-100 score (lower variance = higher consistency)
    // variance of 0 = 100, variance of 9 = 0
    narrativeConsistency = Math.max(0, Math.min(100, Math.round(100 - (variance / 9) * 100)));
  }

  // 3. Execution Speed: avg quarters between promise made and resolved
  let executionSpeed: number | null = null;
  const resolvedPromises = promises.filter((p: any) => p.status === "kept" && p.resolved_in_quarter && p.made_in_quarter);
  if (resolvedPromises.length >= 2) {
    const parseQuarter = (q: string) => {
      const match = q.match(/Q(\d)_FY(\d{2})/);
      if (!match) return null;
      return parseInt(match[2]) * 4 + parseInt(match[1]);
    };
    let totalQuarters = 0;
    let counted = 0;
    for (const p of resolvedPromises) {
      const made = parseQuarter(p.made_in_quarter);
      const resolved = parseQuarter(p.resolved_in_quarter);
      if (made != null && resolved != null) {
        totalQuarters += Math.abs(resolved - made);
        counted++;
      }
    }
    if (counted > 0) {
      const avgQ = totalQuarters / counted;
      // Convert to score: 1 quarter = 100, 4+ quarters = 25
      executionSpeed = Math.max(0, Math.min(100, Math.round(100 - (avgQ - 1) * 25)));
    }
  }

  // Overall: weighted average (guidance 50%, narrative 30%, execution 20%)
  let overall: number | null = null;
  const dims = [
    { val: guidanceAccuracy, weight: 0.5 },
    { val: narrativeConsistency, weight: 0.3 },
    { val: executionSpeed, weight: 0.2 },
  ].filter(d => d.val !== null);
  if (dims.length > 0) {
    const totalW = dims.reduce((s, d) => s + d.weight, 0);
    overall = Math.round(dims.reduce((s, d) => s + d.val! * d.weight, 0) / totalW);
  }

  return { guidanceAccuracy, narrativeConsistency, executionSpeed, overall };
}
