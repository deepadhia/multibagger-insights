import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Settings2, Save, X, Loader2, Plus, Trash2 } from "lucide-react";

interface Props {
  stockId: string;
  trackingDirectives: string | null;
  metricKeys: unknown;
}

export function MasterPromptEditor({ stockId, trackingDirectives, metricKeys }: Props) {
  const [editing, setEditing] = useState(false);
  const [directives, setDirectives] = useState(trackingDirectives || "");
  const [metrics, setMetrics] = useState<string[]>(
    Array.isArray(metricKeys) ? (metricKeys as string[]) : ["revenue_growth", "opm", "pat_growth", "order_book"]
  );
  const [newMetric, setNewMetric] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("stocks")
        .update({
          tracking_directives: directives.trim() || null,
          metric_keys: metrics.filter(Boolean) as any,
        })
        .eq("id", stockId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["stock", stockId] });
      toast({ title: "Prompt config saved" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addMetric = () => {
    const key = newMetric.trim().toLowerCase().replace(/\s+/g, "_");
    if (key && !metrics.includes(key)) {
      setMetrics([...metrics, key]);
      setNewMetric("");
    }
  };

  const removeMetric = (key: string) => setMetrics(metrics.filter(m => m !== key));

  const currentMetrics = Array.isArray(metricKeys) ? (metricKeys as string[]) : ["revenue_growth", "opm", "pat_growth", "order_book"];

  if (!editing) {
    return (
      <Card className="p-4 bg-card border-border card-glow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Settings2 className="h-3 w-3" /> Prompt Config
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDirectives(trackingDirectives || "");
              setMetrics([...currentMetrics]);
              setEditing(true);
            }}
            className="h-6 px-2 text-[10px] font-mono"
          >
            Edit
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground mb-1">Tracking Directives</p>
            <p className="text-xs text-foreground leading-relaxed">
              {trackingDirectives || <span className="text-muted-foreground italic">None set — general analysis will be used.</span>}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground mb-1">Tracked Metrics</p>
            <div className="flex flex-wrap gap-1">
              {currentMetrics.map(m => (
                <Badge key={m} variant="secondary" className="font-mono text-[10px]">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-card border-border card-glow">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
        <Settings2 className="h-3 w-3" /> Prompt Config
      </h3>

      <div className="space-y-4">
        <div>
          <label className="font-mono text-[10px] text-muted-foreground mb-1 block">Tracking Directives</label>
          <Textarea
            value={directives}
            onChange={e => setDirectives(e.target.value)}
            placeholder="e.g. Focus on order book growth, margin trajectory, capex plans, and management's tone on export opportunities."
            className="bg-muted border-border font-mono text-xs min-h-[100px]"
          />
        </div>

        <div>
          <label className="font-mono text-[10px] text-muted-foreground mb-1 block">Tracked Metrics</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {metrics.map(m => (
              <Badge key={m} variant="secondary" className="font-mono text-[10px] gap-1 pr-1">
                {m}
                <button onClick={() => removeMetric(m)} className="ml-0.5 hover:text-destructive">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newMetric}
              onChange={e => setNewMetric(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addMetric())}
              placeholder="e.g. order_book"
              className="bg-muted border-border font-mono text-xs h-8 flex-1"
            />
            <Button variant="secondary" size="sm" onClick={addMetric} className="h-8 px-2" disabled={!newMetric.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button size="sm" onClick={handleSave} disabled={saving} className="font-mono text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="font-mono text-xs">
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
      </div>
    </Card>
  );
}
