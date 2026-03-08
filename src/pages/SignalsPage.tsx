import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useStocks } from "@/hooks/useStocks";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, AlertTriangle, Shield, Target,
  CheckCircle, XCircle, ArrowRight, Zap, FileText
} from "lucide-react";

function useAllSnapshots() {
  return useQuery({
    queryKey: ["all-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_snapshots")
        .select("*, stocks(company_name, ticker)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useAllPromises() {
  return useQuery({
    queryKey: ["all-promises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_promises")
        .select("*, stocks(company_name, ticker)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

type Signal = {
  stockId: string;
  ticker: string;
  company: string;
  label: string;
  detail: string;
  type: "bullish" | "warning" | "bearish";
  category: "execution" | "red_flag" | "credibility" | "thesis";
  quarter: string;
};

export default function SignalsPage() {
  const { data: stocks } = useStocks();
  const { data: snapshots } = useAllSnapshots();
  const { data: promises } = useAllPromises();

  const signals: Signal[] = [];

  // Group snapshots & promises by stock
  const stockMap = new Map<string, { snapshots: any[]; promises: any[] }>();

  snapshots?.forEach((s) => {
    if (!stockMap.has(s.stock_id)) stockMap.set(s.stock_id, { snapshots: [], promises: [] });
    stockMap.get(s.stock_id)!.snapshots.push(s);
  });

  promises?.forEach((p) => {
    if (!stockMap.has(p.stock_id)) stockMap.set(p.stock_id, { snapshots: [], promises: [] });
    stockMap.get(p.stock_id)!.promises.push(p);
  });

  for (const [stockId, data] of stockMap) {
    const snaps = data.snapshots;
    const proms = data.promises;
    const stock = (snaps[0] as any)?.stocks || (proms[0] as any)?.stocks || {};
    const ticker = stock.ticker || "???";
    const company = stock.company_name || "";

    // ── Red flags from latest snapshot ──
    if (snaps.length > 0) {
      const latest = snaps[0];
      const flags = Array.isArray(latest.red_flags) ? latest.red_flags as string[] : [];
      const dodged = Array.isArray(latest.dodged_questions) ? latest.dodged_questions as string[] : [];

      flags.forEach((flag) => {
        signals.push({
          stockId, ticker, company, quarter: latest.quarter,
          label: "Red Flag",
          detail: flag,
          type: "bearish",
          category: "red_flag",
        });
      });

      dodged.forEach((q) => {
        signals.push({
          stockId, ticker, company, quarter: latest.quarter,
          label: "Dodged Question",
          detail: q,
          type: "warning",
          category: "red_flag",
        });
      });

      // Clean quarter signal
      if (flags.length === 0 && dodged.length === 0) {
        signals.push({
          stockId, ticker, company, quarter: latest.quarter,
          label: "Clean Quarter",
          detail: `No red flags or dodged questions in ${latest.quarter}. Management was transparent.`,
          type: "bullish",
          category: "execution",
        });
      }

      // QoQ metric comparison
      if (snaps.length >= 2) {
        const prev = snaps[1];
        const currMetrics = (latest.metrics && typeof latest.metrics === "object" ? latest.metrics : {}) as Record<string, string>;
        const prevMetrics = (prev.metrics && typeof prev.metrics === "object" ? prev.metrics : {}) as Record<string, string>;

        const extractNum = (val: string): number | null => {
          if (!val) return null;
          const match = String(val).match(/([\d,.]+)/);
          return match ? parseFloat(match[1].replace(/,/g, "")) : null;
        };

        let improving = 0;
        let declining = 0;
        const details: string[] = [];
        const metricKeys = Object.keys(currMetrics);

        for (const key of metricKeys) {
          const curr = extractNum(currMetrics[key]);
          const prevVal = extractNum(prevMetrics[key]);
          if (curr !== null && prevVal !== null && curr !== prevVal) {
            const direction = curr > prevVal ? "↑" : "↓";
            if (curr > prevVal) improving++;
            else declining++;
            details.push(`${key}: ${prevVal}→${curr} ${direction}`);
          }
        }

        if (improving > declining && improving >= 3) {
          signals.push({
            stockId, ticker, company, quarter: latest.quarter,
            label: "Thesis Strengthening",
            detail: `${improving}/${metricKeys.length} tracked metrics improving QoQ. ${details.slice(0, 3).join(", ")}`,
            type: "bullish",
            category: "thesis",
          });
        } else if (declining > improving && declining >= 3) {
          signals.push({
            stockId, ticker, company, quarter: latest.quarter,
            label: "Thesis Weakening",
            detail: `${declining}/${metricKeys.length} tracked metrics declining QoQ. ${details.slice(0, 3).join(", ")}`,
            type: "bearish",
            category: "thesis",
          });
        }

        // Red flag trend
        const prevFlagCount = Array.isArray(prev.red_flags) ? prev.red_flags.length : 0;
        const currFlagCount = flags.length;
        if (currFlagCount > prevFlagCount + 1) {
          signals.push({
            stockId, ticker, company, quarter: latest.quarter,
            label: "Red Flags Increasing",
            detail: `Red flags rose from ${prevFlagCount} to ${currFlagCount} between ${prev.quarter} and ${latest.quarter}.`,
            type: "bearish",
            category: "red_flag",
          });
        }
      }
    }

    // ── Promise credibility ──
    if (proms.length > 0) {
      const kept = proms.filter((p: any) => p.status === "kept").length;
      const broken = proms.filter((p: any) => p.status === "broken").length;
      const resolved = kept + broken;

      if (resolved >= 2) {
        const credRate = Math.round((kept / resolved) * 100);
        if (credRate >= 80) {
          signals.push({
            stockId, ticker, company, quarter: snaps[0]?.quarter || "—",
            label: "High Credibility",
            detail: `Management has delivered on ${kept}/${resolved} promises (${credRate}%). Execution is strong.`,
            type: "bullish",
            category: "credibility",
          });
        } else if (credRate <= 40) {
          signals.push({
            stockId, ticker, company, quarter: snaps[0]?.quarter || "—",
            label: "Low Credibility",
            detail: `Management broke ${broken}/${resolved} promises (${credRate}% kept). Execution risk is high.`,
            type: "bearish",
            category: "credibility",
          });
        }
      }

      // Highlight broken promises
      proms.filter((p: any) => p.status === "broken").forEach((p: any) => {
        signals.push({
          stockId, ticker, company, quarter: p.resolved_in_quarter || p.made_in_quarter,
          label: "Broken Promise",
          detail: p.promise_text,
          type: "bearish",
          category: "execution",
        });
      });

      // Highlight recently kept promises
      proms.filter((p: any) => p.status === "kept").forEach((p: any) => {
        signals.push({
          stockId, ticker, company, quarter: p.resolved_in_quarter || p.made_in_quarter,
          label: "Promise Kept",
          detail: p.promise_text,
          type: "bullish",
          category: "execution",
        });
      });
    }
  }

  // Sort: bearish first (action items), then warnings, then bullish
  const typeOrder = { bearish: 0, warning: 1, bullish: 2 };
  signals.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

  const bearishCount = signals.filter(s => s.type === "bearish").length;
  const warningCount = signals.filter(s => s.type === "warning").length;
  const bullishCount = signals.filter(s => s.type === "bullish").length;

  const [filter, setFilter] = React.useState<"all" | "bearish" | "warning" | "bullish">("all");
  const filtered = filter === "all" ? signals : signals.filter(s => s.type === filter);

  const iconMap = {
    red_flag: <AlertTriangle className="h-3.5 w-3.5" />,
    execution: <Target className="h-3.5 w-3.5" />,
    credibility: <Shield className="h-3.5 w-3.5" />,
    thesis: <TrendingUp className="h-3.5 w-3.5" />,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow flex items-center gap-2">
            <Zap className="h-6 w-6" />
            Thesis Signals
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Execution tracking, red flags, and thesis strength signals across your portfolio
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${signals.length})`} />
          <FilterChip active={filter === "bearish"} onClick={() => setFilter("bearish")} label={`Action Required (${bearishCount})`} color="text-terminal-red" />
          <FilterChip active={filter === "warning"} onClick={() => setFilter("warning")} label={`Watch (${warningCount})`} color="text-terminal-amber" />
          <FilterChip active={filter === "bullish"} onClick={() => setFilter("bullish")} label={`Thesis Strong (${bullishCount})`} color="text-terminal-green" />
        </div>

        {filtered.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center">
            <p className="text-muted-foreground font-mono">No signals yet. Import Gemini JSON on your stock pages to generate thesis signals.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((s, i) => (
              <Card key={i} className={`p-4 bg-card border-border card-glow border-l-2 ${
                s.type === "bearish" ? "border-l-terminal-red" :
                s.type === "warning" ? "border-l-terminal-amber" :
                "border-l-terminal-green"
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Link to={`/stocks/${s.stockId}`} className="font-mono text-sm font-bold text-primary hover:underline">
                        {s.ticker}
                      </Link>
                      <Badge variant="outline" className="font-mono text-[10px]">{s.quarter}</Badge>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[10px] gap-1 ${
                          s.type === "bearish" ? "text-terminal-red border-terminal-red/30 bg-terminal-red/10" :
                          s.type === "warning" ? "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10" :
                          "text-terminal-green border-terminal-green/30 bg-terminal-green/10"
                        }`}
                      >
                        {iconMap[s.category]}
                        {s.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{s.detail}</p>
                  </div>
                  <Link to={`/stocks/${s.stockId}`} className="text-muted-foreground hover:text-primary flex-shrink-0 mt-1">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

import React from "react";

function FilterChip({ active, onClick, label, color }: {
  active: boolean; onClick: () => void; label: string; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-xs px-3 py-1.5 rounded-md border transition-colors ${
        active
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
      } ${color && active ? color : ""}`}
    >
      {label}
    </button>
  );
}
