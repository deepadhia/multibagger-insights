import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Settings2, Save, X, Loader2, Plus, Trash2, ClipboardPaste, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStockTrackingProfile } from "@/hooks/useStocks";
import {
  getMetricKeysForPrompt,
  metricKeysFromProfileConfig,
  leadingIndicatorsFromProfile,
  getPrimaryThesisMetric,
  getCoreThesisFromProfile,
} from "@/lib/trackingProfileConfig";
import { humanizeTrackingKey } from "@/lib/formatTrackingKey";
import { cn } from "@/lib/utils";

function TrackingKeyChip({
  slug,
  variant,
  onRemove,
}: {
  slug: string;
  variant: "json-metric" | "leading";
  onRemove?: () => void;
}) {
  const label = humanizeTrackingKey(slug);
  const isJson = variant === "json-metric";
  return (
    <div
      className={cn(
        "group/chip inline-flex max-w-[16rem] min-h-[2rem] items-center rounded-lg border px-2.5 py-1.5 shadow-sm",
        isJson
          ? "border-primary/55 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-foreground ring-1 ring-primary/25"
          : "border-terminal-green/45 bg-gradient-to-br from-terminal-green/15 via-terminal-green/8 to-transparent text-foreground ring-1 ring-terminal-green/20",
      )}
      title={`JSON key: ${slug}`}
    >
      <div className="flex w-full items-center justify-between gap-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold leading-snug tracking-tight",
            isJson ? "text-primary" : "text-terminal-green",
          )}
        >
          {label}
        </span>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-70 hover:bg-destructive/15 hover:text-destructive hover:opacity-100"
            aria-label={`Remove ${slug}`}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

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
  const defaultMetricFallback = ["revenue_growth", "opm", "pat_growth", "order_book"];
  const [metrics, setMetrics] = useState<string[]>(() =>
    Array.isArray(metricKeys) ? (metricKeys as string[]) : defaultMetricFallback,
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
      const imported = metricKeysFromProfileConfig(parsed as Record<string, unknown>);
      if (imported !== null) setMetrics(imported);
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
      (trackingProfile as Record<string, unknown> | null | undefined) || {
        tracking_directives: trackingDirectives || "",
        metric_keys: getMetricKeysForPrompt(
          trackingProfile as Record<string, unknown> | null | undefined,
          metricKeys,
          defaultMetricFallback,
        ),
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

  const profile = trackingProfile as Record<string, unknown> | null | undefined;
  const currentMetrics = getMetricKeysForPrompt(profile, metricKeys, defaultMetricFallback);
  const leadingIndicators = leadingIndicatorsFromProfile(profile);
  const primaryMetric = getPrimaryThesisMetric(profile);
  const coreThesis = getCoreThesisFromProfile(profile);

  const p = profile && typeof profile === "object" ? profile : null;
  const metaTicker = p && typeof p.ticker === "string" ? p.ticker : null;
  const metaThesisType =
    p && typeof p.thesis_type === "string"
      ? p.thesis_type
      : p && typeof (p as { thesisType?: string }).thesisType === "string"
        ? (p as { thesisType: string }).thesisType
        : null;
  const metaHoldings =
    p && typeof p.holdings_value === "number"
      ? p.holdings_value
      : p && typeof (p as { holdingsValue?: number }).holdingsValue === "number"
        ? (p as { holdingsValue: number }).holdingsValue
        : null;
  const metaActive =
    p && typeof p.active_tracking === "boolean"
      ? p.active_tracking
      : p && typeof (p as { activeTracking?: boolean }).activeTracking === "boolean"
        ? (p as { activeTracking: boolean }).activeTracking
        : null;
  const hasProfileMeta =
    Boolean(metaTicker) || Boolean(metaThesisType) || metaHoldings != null || metaActive != null;

  if (!editing) {
    const displayDirectives =
      (typeof profile?.tracking_directives === "string" && profile.tracking_directives) ||
      trackingDirectives ||
      "";

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
                const base = { ...((profile || {}) as Record<string, unknown>) };
                setProfileConfig(base);
                setDirectives(String(base.tracking_directives ?? trackingDirectives ?? ""));
                setMetrics([...getMetricKeysForPrompt(base, metricKeys, defaultMetricFallback)]);
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
                const base = { ...((profile || {}) as Record<string, unknown>) };
                setProfileConfig(base);
                setDirectives(String(base.tracking_directives ?? trackingDirectives ?? ""));
                setMetrics([...getMetricKeysForPrompt(base, metricKeys, defaultMetricFallback)]);
                setJsonMode(false);
                setEditing(true);
              }}
              className="h-6 px-2 text-[10px] font-mono"
            >
              Edit
            </Button>
          </div>
        </div>

        {/* Primary focus: metric + what Gemini extracts — above the fold */}
        <div className="rounded-lg border border-primary/20 bg-primary/[0.06] px-4 py-3.5 space-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary/90 mb-2">Primary thesis metric</p>
            {primaryMetric ? (
              <p
                className="text-sm sm:text-base font-semibold text-foreground leading-snug"
                title={`Schema key: ${primaryMetric.key}`}
              >
                {primaryMetric.label}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">Not set — add <code className="text-primary/80">primary_thesis_metric</code> in JSON or Edit.</p>
            )}
          </div>

          <div className="h-px bg-border/60" aria-hidden />

          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Metrics in JSON output</p>
            <div className="flex flex-wrap gap-2">
              {currentMetrics.map((m) => (
                <TrackingKeyChip key={m} slug={m} variant="json-metric" />
              ))}
            </div>
          </div>

          {leadingIndicators.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Leading indicators</p>
              <div className="flex flex-wrap gap-2">
                {leadingIndicators.map((m) => (
                  <TrackingKeyChip key={m} slug={m} variant="leading" />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <Collapsible className="mt-3 border-t border-border/50 pt-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors [&[data-state=open]_svg]:rotate-180"
            >
              <span>Thesis, directives &amp; portfolio</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pb-1">
            {hasProfileMeta ? (
              <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2">
                <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                  {metaTicker ? (
                    <div className="font-mono">
                      <span className="text-muted-foreground">ticker</span>{" "}
                      <span className="text-primary">{metaTicker}</span>
                    </div>
                  ) : null}
                  {metaThesisType ? (
                    <div className="font-mono">
                      <span className="text-muted-foreground">thesis_type</span>{" "}
                      <span className="text-foreground">{metaThesisType}</span>
                    </div>
                  ) : null}
                  {metaHoldings != null ? (
                    <div className="font-mono">
                      <span className="text-muted-foreground">holdings_value</span>{" "}
                      <span className="text-foreground tabular-nums">{metaHoldings.toLocaleString("en-IN")}</span>
                    </div>
                  ) : null}
                  {metaActive != null ? (
                    <div className="font-mono">
                      <span className="text-muted-foreground">active_tracking</span>{" "}
                      <span className={metaActive ? "text-terminal-green" : "text-muted-foreground"}>
                        {metaActive ? "true" : "false"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {coreThesis ? (
              <div>
                <p className="font-mono text-[10px] text-muted-foreground mb-1">Core thesis</p>
                <p className="text-xs text-foreground leading-relaxed">{coreThesis}</p>
              </div>
            ) : null}
            <div>
              <p className="font-mono text-[10px] text-muted-foreground mb-1">Tracking directives</p>
              <p className="text-xs text-foreground leading-relaxed">
                {displayDirectives || (
                  <span className="text-muted-foreground italic">None set — general analysis will be used.</span>
                )}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
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
              if (!jsonMode) {
                const base = {
                  ...((profileConfig || profile || {}) as Record<string, unknown>),
                  tracking_directives: directives.trim() || null,
                  metric_keys: metrics.filter(Boolean),
                };
                setJsonInput(JSON.stringify(base, null, 2));
              }
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
            <div className="flex flex-wrap gap-2 mb-2">
              {metrics.map((m) => (
                <TrackingKeyChip key={m} slug={m} variant="json-metric" onRemove={() => removeMetric(m)} />
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
