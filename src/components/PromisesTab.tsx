import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useManagementPromises } from "@/hooks/useStocks";

const MOCK_PROMISES = [
  { id: "mock-1", promise_text: "Achieve 25% revenue growth by Q2FY26", made_in_quarter: "Q3FY25", status: "pending", target_deadline: "Q2FY26", resolved_in_quarter: null },
  { id: "mock-2", promise_text: "Reduce debt-to-equity below 0.5", made_in_quarter: "Q2FY25", status: "kept", target_deadline: "Q4FY25", resolved_in_quarter: "Q4FY25" },
  { id: "mock-3", promise_text: "Launch new product line in domestic market", made_in_quarter: "Q1FY25", status: "broken", target_deadline: "Q3FY25", resolved_in_quarter: "Q3FY25" },
  { id: "mock-4", promise_text: "Expand capacity by 30% at Hosur plant", made_in_quarter: "Q2FY25", status: "pending", target_deadline: "Q1FY26", resolved_in_quarter: null },
  { id: "mock-5", promise_text: "Maintain OPM above 18%", made_in_quarter: "Q1FY25", status: "kept", target_deadline: null, resolved_in_quarter: "Q2FY25" },
];

interface Props {
  stockId: string;
}

export function PromisesTab({ stockId }: Props) {
  const { data: dbPromises } = useManagementPromises(stockId);
  const promises = dbPromises && dbPromises.length > 0 ? dbPromises : MOCK_PROMISES;
  const isMock = !dbPromises || dbPromises.length === 0;

  const kept = promises.filter(p => p.status === "kept").length;
  const broken = promises.filter(p => p.status === "broken").length;
  const pending = promises.filter(p => p.status === "pending").length;
  const resolved = kept + broken;
  const credibility = resolved > 0 ? Math.round((kept / resolved) * 100) : null;

  return (
    <div className="space-y-4">
      {isMock && (
        <Card className="p-3 bg-muted/50 border-border rounded">
          <p className="text-xs text-muted-foreground">
            <strong>Mock data shown.</strong> Import a Gemini analysis from the Transcripts page to populate real promises.
          </p>
        </Card>
      )}

      {/* Credibility Score */}
      <Card className="p-4 bg-card border-border card-glow">
        <div className="flex items-center gap-6">
          <div className="text-center min-w-[100px]">
            <p className={`text-4xl font-mono font-bold ${
              credibility === null ? "text-muted-foreground" :
              credibility >= 70 ? "text-terminal-green" :
              credibility >= 40 ? "text-terminal-amber" : "text-terminal-red"
            }`}>
              {credibility !== null ? `${credibility}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">Credibility Score</p>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span className="text-terminal-green">{kept} Kept</span>
              <span className="text-terminal-red">{broken} Broken</span>
              <span className="text-terminal-amber">{pending} Pending</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
              {resolved > 0 && (
                <>
                  <div className="h-full bg-terminal-green" style={{ width: `${(kept / promises.length) * 100}%` }} />
                  <div className="h-full bg-terminal-red" style={{ width: `${(broken / promises.length) * 100}%` }} />
                  <div className="h-full bg-terminal-amber" style={{ width: `${(pending / promises.length) * 100}%` }} />
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Promises Table */}
      <Card className="p-4 bg-card border-border card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full data-grid">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Made In</th>
                <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Promise</th>
                <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Deadline</th>
                <th className="text-left p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Resolved In</th>
                <th className="text-center p-2 text-muted-foreground text-[10px] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {promises.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-2 text-foreground font-mono text-xs">{p.made_in_quarter}</td>
                  <td className="p-2 text-foreground text-xs max-w-[350px]">{p.promise_text}</td>
                  <td className="p-2 text-muted-foreground text-xs font-mono">{p.target_deadline || "—"}</td>
                  <td className="p-2 text-muted-foreground text-xs font-mono">{p.resolved_in_quarter || "—"}</td>
                  <td className="p-2 text-center">
                    <Badge variant="outline" className={`font-mono text-[10px] ${
                      p.status === "kept" ? "text-terminal-green border-terminal-green/30 bg-terminal-green/10" :
                      p.status === "broken" ? "text-terminal-red border-terminal-red/30 bg-terminal-red/10" :
                      "text-terminal-amber border-terminal-amber/30 bg-terminal-amber/10"
                    }`}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
