import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useStocks } from "@/hooks/useStocks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Upload, CheckCircle2, AlertTriangle, Edit3 } from "lucide-react";

interface GeminiPayload {
  quarterly_snapshot: {
    quarter: string;
    summary?: string;
    dodged_questions?: string[];
    red_flags?: string[];
    metrics?: Record<string, unknown>;
  };
  promise_updates?: Array<{
    promise_id: string;
    new_status: string;
  }>;
  new_promises?: Array<{
    promise_text: string;
    target_deadline?: string;
  }>;
}

export default function TranscriptsPage() {
  const { data: stocks } = useStocks();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stockId, setStockId] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [quarter, setQuarter] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ snapshots: number; promisesUpdated: number; promisesCreated: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseJson = (raw: string): GeminiPayload | null => {
    try {
      const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (!parsed.quarterly_snapshot?.quarter) {
        setParseError("Missing quarterly_snapshot.quarter in JSON");
        return null;
      }
      setParseError(null);
      return parsed as GeminiPayload;
    } catch {
      setParseError("Invalid JSON format. Check the Gemini output for syntax errors.");
      return null;
    }
  };

  const handleImport = async () => {
    if (!stockId) {
      toast({ title: "Select a stock", variant: "destructive" });
      return;
    }

    const payload = parseJson(jsonInput);
    if (!payload) return;

    setLoading(true);
    setResult(null);

    try {
      const snap = payload.quarterly_snapshot;

      // 1. Upsert quarterly snapshot
      const { error: snapError } = await supabase
        .from("quarterly_snapshots" as any)
        .upsert({
          stock_id: stockId,
          quarter: snap.quarter,
          summary: snap.summary || null,
          dodged_questions: snap.dodged_questions || [],
          red_flags: snap.red_flags || [],
          metrics: snap.metrics || {},
        }, { onConflict: "stock_id,quarter" });

      if (snapError) throw snapError;

      // 2. Update existing promises
      let promisesUpdated = 0;
      if (payload.promise_updates?.length) {
        for (const update of payload.promise_updates) {
          if (update.new_status !== "pending") {
            const { error } = await supabase
              .from("management_promises" as any)
              .update({
                status: update.new_status,
                resolved_in_quarter: snap.quarter,
              })
              .eq("id", update.promise_id);
            if (!error) promisesUpdated++;
          }
        }
      }

      // 3. Insert new promises
      let promisesCreated = 0;
      if (payload.new_promises?.length) {
        const rows = payload.new_promises.map((p) => ({
          stock_id: stockId,
          promise_text: p.promise_text,
          made_in_quarter: snap.quarter,
          target_deadline: p.target_deadline || null,
          status: "pending",
        }));

        const { error: promiseError } = await supabase
          .from("management_promises" as any)
          .insert(rows);
        if (promiseError) throw promiseError;
        promisesCreated = rows.length;
      }

      setResult({ snapshots: 1, promisesUpdated, promisesCreated });
      queryClient.invalidateQueries({ queryKey: ["quarterly-snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["management-promises"] });
      toast({ title: "Import complete", description: `Snapshot saved, ${promisesCreated} new promises, ${promisesUpdated} updated.` });
    } catch (err: any) {
      console.error("Import error:", err);
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">Import Gemini Analysis</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Paste structured JSON from Gemini to ingest quarterly analysis & management promises
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 bg-card border-border card-glow space-y-4">
              <div>
                <Label className="font-mono text-xs">Stock</Label>
                <Select value={stockId} onValueChange={setStockId}>
                  <SelectTrigger className="bg-muted border-border font-mono">
                    <SelectValue placeholder="Select stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {stocks?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.ticker} — {s.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="font-mono text-xs">Gemini JSON Output</Label>
                <Textarea
                  value={jsonInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setJsonInput(val);
                    setParseError(null);
                    // Auto-detect quarter from JSON
                    try {
                      const clean = val.replace(/```json/gi, "").replace(/```/g, "").trim();
                      const parsed = JSON.parse(clean);
                      if (parsed?.quarterly_snapshot?.quarter && !quarter) {
                        setQuarter(parsed.quarterly_snapshot.quarter);
                      }
                    } catch {
                      // ignore parse errors during typing
                    }
                  }}
                  placeholder={`Paste the Gemini JSON here...\n\n{\n  "quarterly_snapshot": {\n    "quarter": "Q4FY25",\n    "summary": "...",\n    "dodged_questions": [...],\n    "red_flags": [...],\n    "metrics": {...}\n  },\n  "new_promises": [...]\n}`}
                  className="bg-muted border-border font-mono text-sm min-h-[300px]"
                />
                {parseError && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {parseError}
                  </p>
                )}
              </div>

              <div>
                <Label className="font-mono text-xs flex items-center gap-1">
                  <Edit3 className="h-3 w-3" /> Quarter (auto-detected, editable)
                </Label>
                <input
                  type="text"
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value.toUpperCase())}
                  placeholder="e.g. Q4FY25"
                  className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <Button onClick={handleImport} disabled={loading || !jsonInput.trim()} className="w-full font-mono">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Committing to Database...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Commit to Database
                  </>
                )}
              </Button>
            </Card>
          </div>

          {/* Instructions */}
          <div className="space-y-4">
            <Card className="p-4 bg-card border-border card-glow">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
                <FileText className="inline h-3 w-3 mr-1" /> Workflow
              </h3>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">01</span>
                  Upload transcript (PDF/MP3) to Gemini Web
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">02</span>
                  Use the MBIQ prompt to get structured JSON
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">03</span>
                  Paste the JSON output here
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">04</span>
                  Click "Commit to Database" to store
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">05</span>
                  Credibility scores update automatically
                </li>
              </ol>
            </Card>

            <Card className="p-4 bg-card border-border card-glow">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
                Expected JSON Shape
              </h3>
              <pre className="text-[10px] text-muted-foreground font-mono overflow-x-auto whitespace-pre-wrap">
{`{
  "quarterly_snapshot": {
    "quarter": "Q4FY25",
    "summary": "...",
    "dodged_questions": ["..."],
    "red_flags": ["..."],
    "metrics": { "revenue": 500 }
  },
  "promise_updates": [
    { "promise_id": "uuid",
      "new_status": "kept" }
  ],
  "new_promises": [
    { "promise_text": "...",
      "target_deadline": "Q2FY26" }
  ]
}`}
              </pre>
            </Card>
          </div>
        </div>

        {/* Result */}
        {result && (
          <Card className="p-4 bg-card border-border card-glow">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary terminal-glow">
                Import Successful
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{result.snapshots}</p>
                <p className="text-xs text-muted-foreground">Snapshot Saved</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{result.promisesCreated}</p>
                <p className="text-xs text-muted-foreground">New Promises</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-mono font-bold text-foreground">{result.promisesUpdated}</p>
                <p className="text-xs text-muted-foreground">Promises Updated</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
