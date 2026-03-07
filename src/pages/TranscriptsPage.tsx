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
import { SentimentBadge } from "@/components/SentimentBadge";
import { ToneBadge } from "@/components/ToneBadge";
import { Loader2, FileText, Upload } from "lucide-react";

export default function TranscriptsPage() {
  const { data: stocks } = useStocks();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [stockId, setStockId] = useState("");
  const [quarter, setQuarter] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [transcriptText, setTranscriptText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!stockId || !quarter || !transcriptText.trim()) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    setAnalyzing(true);
    setResult(null);

    try {
      // Save transcript
      const { error: transcriptError } = await supabase.from("transcripts").insert({
        stock_id: stockId,
        quarter,
        year: parseInt(year),
        transcript_text: transcriptText,
      });
      if (transcriptError) throw transcriptError;

      // Call AI analysis
      const { data, error } = await supabase.functions.invoke("analyze-transcript", {
        body: { stock_id: stockId, quarter, year: parseInt(year), transcript_text: transcriptText },
      });

      if (error) throw error;

      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["all-analysis"] });
      queryClient.invalidateQueries({ queryKey: ["analysis", stockId] });
      queryClient.invalidateQueries({ queryKey: ["commitments", stockId] });
      toast({ title: "Analysis complete", description: "Transcript analyzed successfully." });
    } catch (err: any) {
      console.error("Analysis error:", err);
      toast({ title: "Error", description: err.message || "Failed to analyze transcript", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-mono font-bold text-primary terminal-glow">Transcript Upload</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Paste earnings call transcripts for AI analysis
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Form */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 bg-card border-border card-glow space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="font-mono text-xs">Stock</Label>
                  <Select value={stockId} onValueChange={setStockId}>
                    <SelectTrigger className="bg-muted border-border font-mono">
                      <SelectValue placeholder="Select stock" />
                    </SelectTrigger>
                    <SelectContent>
                      {stocks?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.ticker} — {s.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-mono text-xs">Quarter</Label>
                  <Select value={quarter} onValueChange={setQuarter}>
                    <SelectTrigger className="bg-muted border-border font-mono">
                      <SelectValue placeholder="Quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="font-mono text-xs">Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="bg-muted border-border font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="font-mono text-xs">Transcript Text</Label>
                <Textarea
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Paste the earnings call transcript here..."
                  className="bg-muted border-border font-mono text-sm min-h-[300px]"
                />
              </div>

              <Button onClick={handleAnalyze} disabled={analyzing} className="w-full font-mono">
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Analyze Transcript
                  </>
                )}
              </Button>
            </Card>
          </div>

          {/* Instructions */}
          <div>
            <Card className="p-4 bg-card border-border card-glow">
              <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-3">
                <FileText className="inline h-3 w-3 mr-1" /> How It Works
              </h3>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">01</span>
                  Select a stock from your portfolio
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">02</span>
                  Choose the quarter and year
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">03</span>
                  Paste the earnings call transcript
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">04</span>
                  AI extracts growth drivers, risks, sentiment & signals
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-mono font-bold">05</span>
                  Management commitments are tracked automatically
                </li>
              </ol>
            </Card>
          </div>
        </div>

        {/* Analysis Result */}
        {result && (
          <Card className="p-4 bg-card border-border card-glow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs uppercase tracking-wider text-primary terminal-glow">
                Analysis Results
              </h3>
              <div className="flex gap-2">
                {result.analysis?.management_tone && <ToneBadge tone={result.analysis.management_tone} />}
                {result.analysis?.sentiment_score && <SentimentBadge score={result.analysis.sentiment_score} size="md" />}
              </div>
            </div>

            {result.analysis?.analysis_summary && (
              <p className="text-sm text-foreground mb-4">{result.analysis.analysis_summary}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResultSection title="Growth Drivers" items={result.analysis?.growth_drivers} color="text-terminal-green" />
              <ResultSection title="Margin Drivers" items={result.analysis?.margin_drivers} color="text-terminal-cyan" />
              <ResultSection title="Risks" items={result.analysis?.risks} color="text-terminal-red" />
              <ResultSection title="Industry Tailwinds" items={result.analysis?.industry_tailwinds} color="text-terminal-blue" />
              <ResultSection title="Hidden Signals" items={result.analysis?.hidden_signals} color="text-terminal-amber" />
            </div>

            {result.analysis?.important_quotes?.length > 0 && (
              <div className="mt-4">
                <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">Key Quotes</h4>
                <div className="space-y-2">
                  {result.analysis.important_quotes.map((q: string, i: number) => (
                    <blockquote key={i} className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                      "{q}"
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {result.commitments?.length > 0 && (
              <div className="mt-4">
                <h4 className="font-mono text-xs uppercase tracking-wider text-terminal-amber mb-2">
                  Management Commitments Extracted ({result.commitments.length})
                </h4>
                <div className="space-y-2">
                  {result.commitments.map((c: any, i: number) => (
                    <div key={i} className="text-xs p-2 bg-muted rounded flex justify-between">
                      <span className="text-foreground">{c.statement}</span>
                      {c.timeline && <span className="text-muted-foreground ml-2">{c.timeline}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function ResultSection({ title, items, color }: { title: string; items?: string[]; color: string }) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
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
