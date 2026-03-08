import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Edit3, Save, X, Loader2 } from "lucide-react";

interface Props {
  stockId: string;
  thesis: string | null;
}

export function InvestmentThesisEditor({ stockId, thesis }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(thesis || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("stocks")
        .update({ investment_thesis: value.trim() || null })
        .eq("id", stockId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["stock", stockId] });
      toast({ title: "Thesis saved" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "Error saving thesis", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Card className="p-4 bg-card border-border card-glow">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Investment Thesis
          </h3>
          <Button variant="ghost" size="sm" onClick={() => { setValue(thesis || ""); setEditing(true); }} className="h-6 px-2 text-[10px] font-mono">
            <Edit3 className="h-3 w-3 mr-1" /> Edit
          </Button>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          {thesis || <span className="text-muted-foreground italic">No thesis written yet. Click Edit to add your investment thesis.</span>}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-card border-border card-glow">
      <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <FileText className="h-3 w-3" /> Investment Thesis
      </h3>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Why did you buy this stock? What's your stop-loss? Target price? Key triggers?"
        className="bg-muted border-border font-mono text-sm min-h-[120px] mb-3"
      />
      <div className="flex gap-2">
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
