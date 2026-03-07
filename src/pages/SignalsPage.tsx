import { DashboardLayout } from "@/components/DashboardLayout";
import { useAllAnalysis } from "@/hooks/useStocks";
import { Card } from "@/components/ui/card";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { TrendingUp } from "lucide-react";

export default function SignalsPage() {
  const { data: analyses } = useAllAnalysis();

  // Calculate multibagger signals
  const signals = analyses?.map(a => {
    let score = 0;
    const reasons: string[] = [];

    if (a.sentiment_score && a.sentiment_score >= 8) { score += 2; reasons.push("High sentiment"); }
    if (a.management_tone === "Bullish") { score += 2; reasons.push("Bullish tone"); }
    const growthDrivers = a.growth_drivers as string[] | null;
    if (growthDrivers && growthDrivers.length >= 3) { score += 2; reasons.push("Multiple growth drivers"); }
    const tailwinds = a.industry_tailwinds as string[] | null;
    if (tailwinds && tailwinds.length >= 2) { score += 1; reasons.push("Industry tailwinds"); }
    const hiddenSignals = a.hidden_signals as string[] | null;
    if (hiddenSignals && hiddenSignals.length >= 1) { score += 2; reasons.push("Hidden signals detected"); }
    const risks = a.risks as string[] | null;
    if (!risks || risks.length <= 1) { score += 1; reasons.push("Low risk profile"); }

    return {
      ...a,
      multibagger_score: Math.min(score, 10),
      reasons,
      ticker: (a as any).stocks?.ticker || "—",
      company: (a as any).stocks?.company_name || "Unknown",
    };
  })?.sort((a, b) => b.multibagger_score - a.multibagger_score) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">
            <TrendingUp className="inline h-6 w-6 mr-2" />
            Multibagger Signals
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            AI-detected potential multibagger opportunities
          </p>
        </div>

        {signals.length === 0 ? (
          <Card className="p-8 bg-card border-border text-center">
            <p className="text-muted-foreground font-mono">No signals yet. Upload transcripts to detect multibagger opportunities.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {signals.map(s => (
              <Card key={s.id} className="p-4 bg-card border-border card-glow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-lg font-bold text-primary">{s.ticker}</span>
                      <span className="text-sm text-muted-foreground">{s.company}</span>
                      <span className="text-xs text-muted-foreground font-mono">{s.quarter}</span>
                      {s.management_tone && <ToneBadge tone={s.management_tone} />}
                      {s.sentiment_score && <SentimentBadge score={s.sentiment_score} />}
                    </div>

                    {s.analysis_summary && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{s.analysis_summary}</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {s.reasons.map((r, i) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-center ml-4">
                    <div className={`text-3xl font-mono font-bold ${
                      s.multibagger_score >= 7 ? "text-terminal-green terminal-glow" :
                      s.multibagger_score >= 4 ? "text-terminal-amber" :
                      "text-muted-foreground"
                    }`}>
                      {s.multibagger_score}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">MB Score</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
