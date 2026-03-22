import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Settings2, Save, X, Loader2, Plus, Trash2, ClipboardPaste } from "lucide-react";
import { useStockTrackingProfile } from "@/hooks/useStocks";

interface Props {
  stockId: string;
  trackingDirectives: string | null;
  metricKeys: unknown;
}

export function MasterPromptEditor({ stockId, trackingDirectives, metricKeys }: Props) {
  const [editing, setEditing] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [directives, setDirectives] = useState(trackingDirectives || "");
  const [metrics, setMetrics] = useState<string[]>(
    Array.isArray(metricKeys) ? (metricKeys as string[]) : ["revenue_growth", "opm", "pat_growth", "order_book"]
  );
  const [newMetric, setNewMetric] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: trackingProfile } = useStockTrackingProfile(stockId);
  const [profileConfig, setProfileConfig] = useState<Record<string, unknown> | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const baseConfig = (profileConfig || (trackingProfile as any) || {}) as Record<string, unknown>;
      const nextConfig: Record<string, unknown> = {
        ...baseConfig,
        tracking_directives: directives.trim() || null,
        metric_keys: metrics.filter(Boolean),
      };

      const { error } = await supabase
        .from("stock_tracking_profiles")
        .upsert(
          {
            stock_id: stockId,
            config: nextConfig as any,
          },
          { onConflict: "stock_id" },
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["stock-tracking-profile", stockId] });
      toast({ title: "Tracking profile saved" });
      setProfileConfig(nextConfig);
      setEditing(false);
      setJsonMode(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput.trim());
      setProfileConfig(parsed);
      if (parsed.tracking_directives && typeof parsed.tracking_directives === "string") {
        setDirectives(parsed.tracking_directives);
      }
      if (Array.isArray(parsed.metric_keys)) {
        setMetrics(parsed.metric_keys.filter((k: any) => typeof k === "string"));
      }
      setJsonMode(false);
      toast({ title: "JSON imported", description: "Review and save the changes." });
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Please paste valid tracking profile JSON (e.g. core_thesis, tracking_directives, metric_keys...).",
        variant: "destructive",
      });
    }
  };

  const getJsonExport = () =>
    JSON.stringify(
      (trackingProfile as any) || {
        tracking_directives: trackingDirectives || "",
        metric_keys: Array.isArray(metricKeys) ? metricKeys : ["revenue_growth", "opm", "pat_growth", "order_book"],
      },
      null,
      2,
    );

  const addMetric = () => {
    const key = newMetric.trim().toLowerCase().replace(/\s+/g, "_");
    if (key && !metrics.includes(key)) {
      setMetrics([...metrics, key]);
      setNewMetric("");
    }
  };

  const removeMetric = (key: string) => setMetrics(metrics.filter(m => m !== key));

  const profile = trackingProfile as any;
  const currentMetrics = Array.isArray(profile?.metric_keys)
    ? (profile.metric_keys as string[])
    : Array.isArray(metricKeys)
      ? (metricKeys as string[])
      : ["revenue_growth", "opm", "pat_growth", "order_book"];

  if (!editing) {
    const displayDirectives = profile?.tracking_directives || trackingDirectives || "";

    return (
      <Card className="p-4 bg-card border-border card-glow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Settings2 className="h-3 w-3" /> Prompt Config
          </h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const base = (trackingProfile as any) || {};
                setProfileConfig(base);
                setDirectives(base.tracking_directives || trackingDirectives || "");
                setMetrics([...currentMetrics]);
                setJsonMode(true);
                setJsonInput(getJsonExport());
                setEditing(true);
              }}
              className="h-6 px-2 text-[10px] font-mono"
              title="Import/Export JSON"
            >
              <ClipboardPaste className="h-3 w-3 mr-1" /> JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const base = (trackingProfile as any) || {};
                setProfileConfig(base);
                setDirectives(base.tracking_directives || trackingDirectives || "");
                setMetrics(
                  Array.isArray(base.metric_keys) ? (base.metric_keys as string[]) : [...currentMetrics],
                );
                setJsonMode(false);
                setEditing(true);
              }}
              className="h-6 px-2 text-[10px] font-mono"
            >
              Edit
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground mb-1">Tracking Directives</p>
            <p className="text-xs text-foreground leading-relaxed">
              {displayDirectives || (
                <span className="text-muted-foreground italic">None set — general analysis will be used.</span>
              )}
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Settings2 className="h-3 w-3" /> Prompt Config
        </h3>
        <div className="flex gap-1">
          <Button
            variant={jsonMode ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              if (!jsonMode) setJsonInput(JSON.stringify({ tracking_directives: directives, metric_keys: metrics }, null, 2));
              setJsonMode(!jsonMode);
            }}
            className="h-6 px-2 text-[10px] font-mono"
          >
            <ClipboardPaste className="h-3 w-3 mr-1" /> {jsonMode ? "Form" : "JSON"}
          </Button>
        </div>
      </div>

      {jsonMode ? (
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground font-mono">
            Paste full tracking profile JSON (e.g. <code className="text-primary">core_thesis</code>,{" "}
            <code className="text-primary">tracking_directives</code>,{" "}
            <code className="text-primary">primary_thesis_metric</code>,{" "}
            <code className="text-primary">metric_keys</code>, <code className="text-primary">leading_indicators</code>).
          </p>
          <Textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder={`{
  "ticker": "ANANTRAJ",
  "core_thesis": "...",
  "tracking_directives": "...",
  "primary_thesis_metric": { "key": "operational_dc_capacity_mw", "label": "Operational Data Center Capacity (MW)" },
  "metric_keys": ["revenue_growth", "opm", "pat_growth", "operational_dc_capacity_mw"],
  "leading_indicators": ["...", "..."]
}`}
            className="bg-muted border-border font-mono text-xs min-h-[180px]"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleJsonImport} className="font-mono text-xs">
              <ClipboardPaste className="h-3 w-3 mr-1" /> Import JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setJsonMode(false); }} className="font-mono text-xs">
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
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

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="font-mono text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setJsonMode(false); }} className="font-mono text-xs">
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
