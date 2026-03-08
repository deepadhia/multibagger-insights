import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuarterlySnapshots } from "@/hooks/useStocks";
import { AlertTriangle, MessageSquare, FileText } from "lucide-react";

const MOCK_SNAPSHOTS = [
  {
    id: "mock-snap-1",
    quarter: "Q4FY25",
    summary: "Strong quarter with revenue growth of 22% YoY driven by export orders and domestic demand recovery. Management guided for continued momentum with new capacity coming online in H1FY26.",
    dodged_questions: ["What is the exact timeline for the Hosur plant commissioning?", "Can you quantify the impact of raw material cost inflation?"],
    red_flags: ["Inventory days increased from 45 to 62", "Receivables grew faster than revenue"],
    metrics: { revenue_growth: 22, opm: 19.5, pat_growth: 28 },
    raw_ai_output: null,
    created_at: new Date().toISOString(),
    stock_id: "",
  },
  {
    id: "mock-snap-2",
    quarter: "Q3FY25",
    summary: "Muted quarter impacted by seasonal slowdown and delayed government orders. Management remains confident of full-year guidance.",
    dodged_questions: ["Why did promoter holding decrease?"],
    red_flags: ["Employee costs rising faster than revenue"],
    metrics: { revenue_growth: 8, opm: 17.2, pat_growth: 5 },
    raw_ai_output: null,
    created_at: new Date().toISOString(),
    stock_id: "",
  },
];

interface Props {
  stockId: string;
}

export function SnapshotsTab({ stockId }: Props) {
  const { data: dbSnapshots } = useQuarterlySnapshots(stockId);
  const snapshots = dbSnapshots && dbSnapshots.length > 0 ? dbSnapshots : MOCK_SNAPSHOTS;
  const isMock = !dbSnapshots || dbSnapshots.length === 0;

  return (
    <div className="space-y-4">
      {isMock && (
        <Card className="p-3 bg-muted/50 border-border rounded">
          <p className="text-xs text-muted-foreground">
            <strong>Mock data shown.</strong> Import a Gemini analysis from the Transcripts page to populate real quarterly snapshots.
          </p>
        </Card>
      )}

      {snapshots.map((snap) => {
        const dodged = (Array.isArray(snap.dodged_questions) ? snap.dodged_questions : []) as string[];
        const flags = (Array.isArray(snap.red_flags) ? snap.red_flags : []) as string[];
        const metrics = (snap.metrics && typeof snap.metrics === "object" ? snap.metrics : {}) as Record<string, number>;

        return (
          <Card key={snap.id} className="p-5 bg-card border-border card-glow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {snap.quarter}
              </h3>
              {snap.raw_ai_output && (
                <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                  Raw JSON saved
                </Badge>
              )}
            </div>

            {/* Summary */}
            {snap.summary && (
              <p className="text-sm text-foreground leading-relaxed mb-4">{snap.summary}</p>
            )}

            {/* Metrics chips */}
            {Object.keys(metrics).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(metrics).map(([key, val]) => (
                  <Badge key={key} variant="secondary" className="font-mono text-[10px]">
                    {key.replace(/_/g, " ")}: {val}
                    {key.includes("growth") || key.includes("opm") || key.includes("margin") ? "%" : ""}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dodged Questions */}
              {dodged.length > 0 && (
                <div className="p-3 bg-muted rounded border border-border/50">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-amber mb-2 flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" /> Dodged Questions ({dodged.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {dodged.map((q, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0 bg-terminal-amber" />
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Red Flags */}
              {flags.length > 0 && (
                <div className="p-3 bg-muted rounded border border-border/50">
                  <h4 className="font-mono text-[10px] uppercase tracking-wider text-terminal-red mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> Red Flags ({flags.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {flags.map((f, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 rounded-full flex-shrink-0 bg-terminal-red" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
