import { useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useStock, useStockAnalysis, useStockCommitments } from "@/hooks/useStocks";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function StockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: stock, isLoading } = useStock(id!);
  const { data: analyses } = useStockAnalysis(id!);
  const { data: commitments } = useStockCommitments(id!);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!stock) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">Stock not found</div>
      </DashboardLayout>
    );
  }

  const sentimentData = analyses?.map(a => ({
    quarter: `${a.quarter}`,
    score: a.sentiment_score || 0,
  })).reverse() || [];

  const latestAnalysis = analyses?.[0];

  const achievedCount = commitments?.filter(c => c.status === "Achieved").length || 0;
  const totalCommitments = commitments?.length || 0;
  const credibility = totalCommitments > 0 ? Math.round((achievedCount / totalCommitments) * 100) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">{stock.ticker}</h1>
              <Badge variant="outline" className="font-mono">{stock.category}</Badge>
            </div>
            <p className="text-foreground mt-1">{stock.company_name}</p>
            <p className="text-sm text-muted-foreground">{stock.sector || "No sector"}</p>
          </div>
          {stock.buy_price && (
            <div className="text-right">
              <p className="text-xs font-mono text-muted-foreground uppercase">Buy Price</p>
              <p className="text-xl font-mono font-bold text-foreground">₹{stock.buy_price}</p>
            </div>
          )}
        </div>

        {/* Thesis */}
        {stock.investment_thesis && (
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Investment Thesis</h3>
            <p className="text-sm text-foreground">{stock.investment_thesis}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sentiment Trend */}
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Sentiment Trend</h3>
            {sentimentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={sentimentData}>
                  <XAxis dataKey="quarter" tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(220 18% 9%)", border: "1px solid hsl(220 14% 16%)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 }} />
                  <Line type="monotone" dataKey="score" stroke="hsl(142 70% 45%)" strokeWidth={2} dot={{ fill: "hsl(142 70% 45%)", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground font-mono text-sm">
                No sentiment data yet
              </div>
            )}
          </Card>

          {/* Management Credibility */}
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Management Credibility</h3>
            {credibility !== null ? (
              <div className="space-y-4">
                <div className="text-center">
                  <p className={`text-4xl font-mono font-bold ${credibility >= 70 ? "text-terminal-green" : credibility >= 40 ? "text-terminal-amber" : "text-terminal-red"}`}>
                    {credibility}%
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {achievedCount}/{totalCommitments} commitments achieved
                  </p>
                </div>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {commitments?.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                      <span className="text-foreground truncate flex-1 mr-2">{c.statement}</span>
                      <Badge variant="outline" className={`font-mono text-[10px] ${
                        c.status === "Achieved" ? "text-terminal-green border-terminal-green/30" :
                        c.status === "Missed" ? "text-terminal-red border-terminal-red/30" :
                        "text-terminal-amber border-terminal-amber/30"
                      }`}>{c.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground font-mono text-sm">
                No commitments tracked yet
              </div>
            )}
          </Card>
        </div>

        {/* Latest Analysis */}
        {latestAnalysis && (
          <Card className="p-4 bg-card border-border card-glow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Latest Analysis — {latestAnalysis.quarter}
              </h3>
              <div className="flex gap-2">
                {latestAnalysis.management_tone && <ToneBadge tone={latestAnalysis.management_tone} />}
                {latestAnalysis.sentiment_score && <SentimentBadge score={latestAnalysis.sentiment_score} size="md" />}
              </div>
            </div>

            {latestAnalysis.analysis_summary && (
              <p className="text-sm text-foreground mb-4">{latestAnalysis.analysis_summary}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {latestAnalysis.growth_drivers && (
                <InsightSection title="Growth Drivers" items={latestAnalysis.growth_drivers as string[]} color="text-terminal-green" />
              )}
              {latestAnalysis.risks && (
                <InsightSection title="Risks" items={latestAnalysis.risks as string[]} color="text-terminal-red" />
              )}
              {latestAnalysis.industry_tailwinds && (
                <InsightSection title="Industry Tailwinds" items={latestAnalysis.industry_tailwinds as string[]} color="text-terminal-cyan" />
              )}
              {latestAnalysis.hidden_signals && (
                <InsightSection title="Hidden Signals" items={latestAnalysis.hidden_signals as string[]} color="text-terminal-amber" />
              )}
            </div>

            {latestAnalysis.important_quotes && (latestAnalysis.important_quotes as string[]).length > 0 && (
              <div className="mt-4">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Key Quotes</h4>
                <div className="space-y-2">
                  {(latestAnalysis.important_quotes as string[]).map((q, i) => (
                    <blockquote key={i} className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                      "{q}"
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* All Analyses */}
        {analyses && analyses.length > 1 && (
          <Card className="p-4 bg-card border-border card-glow">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-4">Analysis History</h3>
            <div className="space-y-3">
              {analyses.slice(1).map(a => (
                <div key={a.id} className="p-3 bg-muted rounded border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold">{a.quarter} {a.year}</span>
                    <div className="flex gap-2">
                      {a.management_tone && <ToneBadge tone={a.management_tone} />}
                      {a.sentiment_score && <SentimentBadge score={a.sentiment_score} />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{a.analysis_summary}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function InsightSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <h4 className={`font-mono text-xs uppercase tracking-wider ${color} mb-2`}>{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
            <span className={`mt-1.5 h-1 w-1 rounded-full flex-shrink-0 ${color.replace("text-", "bg-")}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
