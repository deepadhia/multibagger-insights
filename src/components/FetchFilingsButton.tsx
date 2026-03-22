import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

const WINDOW_OPTIONS = [
  { value: "3q", label: "3 quarters" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
] as const;

export function FetchFilingsButton() {
  const [fetching, setFetching] = useState(false);
  const [window, setWindow] = useState<"3q" | "6m" | "1y">("1y");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFetchAll = async () => {
    if (fetching) return;
    setFetching(true);
    try {
      const response = await apiFetch("/api/transcripts/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Process all stocks in DB, but only fetch
          // quarters/categories that are still missing on disk.
          useWatchlist: false,
          onlyMissing: true,
          uploadAfterDownload: true,
          window,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
      }
      const up = data?.uploadAfterDownload ?? {};
      const uploaded = up.uploaded ?? 0;
      const errs = up.errors ?? [];
      queryClient.invalidateQueries({ queryKey: ["transcripts-files"] });
      queryClient.invalidateQueries({ queryKey: ["transcripts-drive-status"] });
      const msg =
        uploaded > 0 || errs.length > 0
          ? `Download & upload done. Uploaded: ${uploaded}${errs.length > 0 ? `, failed: ${errs.length}` : ""}.`
          : data?.skipped
            ? "All filings up to date; nothing new to download."
            : "Fetch complete.";
      toast({ title: "Fetch filings", description: msg });
    } catch (err) {
      toast({
        title: "Fetch filings failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={window} onValueChange={(v) => setWindow(v as "3q" | "6m" | "1y")}>
        <SelectTrigger className="w-[110px] h-8 font-mono text-xs border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WINDOW_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleFetchAll}
        disabled={fetching}
        className="font-mono text-xs"
      >
        {fetching ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <FileText className="h-3 w-3" />
        )}
        <span className="ml-1">Fetch filings</span>
      </Button>
    </div>
  );
}
