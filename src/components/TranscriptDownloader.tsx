import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, ExternalLink, Search, Zap } from "lucide-react";

interface TranscriptLink {
  title: string;
  date: string;
  source: string;
  url: string;
  type: string;
}

interface Props {
  ticker: string;
  companyName: string;
  screenerSlug: string | null;
}

export function TranscriptDownloader({ ticker, companyName, screenerSlug }: Props) {
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<TranscriptLink[] | null>(null);
  const [orders, setOrders] = useState<TranscriptLink[]>([]);
  const { toast } = useToast();

  const handleFetch = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-transcript-links", {
        body: { ticker, company_name: companyName, screener_slug: screenerSlug },
      });
      if (error) throw error;
      if (data?.transcripts) {
        setLinks(data.transcripts);
        setOrders(data.orders || []);
        const total = data.transcripts.length + (data.orders?.length || 0);
        if (total === 0) {
          toast({ title: "No transcripts found", description: `No concall transcripts found for ${ticker}.` });
        } else {
          toast({ title: `Found ${data.transcripts.length} transcripts, ${data.orders?.length || 0} orders` });
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sourceColor = (src: string) => {
    if (src === "BSE") return "bg-chart-info/20 text-[hsl(var(--chart-info))] border-[hsl(var(--chart-info))]/30";
    return "bg-primary/20 text-primary border-primary/30";
  };

  return (
    <Card className="p-4 bg-card border-border card-glow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> Concall Transcripts
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFetch}
          disabled={loading}
          className="h-6 px-2 text-[10px] font-mono"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
          {links === null ? "Find Transcripts" : "Refresh"}
        </Button>
      </div>

      {links === null && !loading && (
        <p className="text-xs text-muted-foreground italic">
          Click "Find Transcripts" to search BSE & Screener for concall transcripts from the last 1 year.
        </p>
      )}

      {links !== null && links.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No concall transcripts found. Try checking BSE/NSE directly.
        </p>
      )}

      {links && links.length > 0 && (
        <div className="space-y-2">
          {links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/60 transition-colors group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-foreground truncate">{link.title}</p>
                  {link.date && (
                    <p className="font-mono text-[10px] text-muted-foreground">{link.date}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className={`font-mono text-[9px] px-1.5 py-0 ${sourceColor(link.source)}`}>
                  {link.source}
                </Badge>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          ))}
          <p className="font-mono text-[10px] text-muted-foreground mt-2">
            💡 Download PDFs and paste the text into Gemini with your analysis prompt.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-4">
          <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
            <Zap className="h-3 w-3 text-terminal-green" /> New Order Announcements
          </h4>
          <div className="space-y-2">
            {orders.map((order, i) => (
              <a
                key={i}
                href={order.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2 rounded bg-terminal-green/5 border border-terminal-green/20 hover:bg-terminal-green/10 transition-colors group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Zap className="h-3.5 w-3.5 text-terminal-green shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-foreground truncate">{order.title}</p>
                    {order.date && (
                      <p className="font-mono text-[10px] text-muted-foreground">{order.date}</p>
                    )}
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
