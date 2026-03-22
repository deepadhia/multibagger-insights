import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sortSnapshotsByQuarterDesc } from "@/lib/quarterSort";
import { parseTrackingProfileConfig } from "@/lib/trackingProfileConfig";

export function useStocks() {
  return useQuery({
    queryKey: ["stocks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stocks").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Count quarterly_snapshots per stock_id (PostgREST JS has no .group(); aggregate client-side). */
export function useSnapshotCounts() {
  return useQuery({
    queryKey: ["snapshot-counts"],
    queryFn: async () => {
      const map: Record<string, number> = {};
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("quarterly_snapshots")
          .select("stock_id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        for (const row of rows) {
          const id = row.stock_id as string;
          map[id] = (map[id] || 0) + 1;
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return map;
    },
  });
}

export function useStock(id: string) {
  return useQuery({
    queryKey: ["stock", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("stocks").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useStockAnalysis(stockId: string) {
  return useQuery({
    queryKey: ["analysis", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcript_analysis")
        .select("*")
        .eq("stock_id", stockId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useStockCommitments(stockId: string) {
  return useQuery({
    queryKey: ["commitments", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_commitments")
        .select("*")
        .eq("stock_id", stockId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useStockTranscripts(stockId: string) {
  return useQuery({
    queryKey: ["transcripts", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcripts")
        .select("*")
        .eq("stock_id", stockId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useAllAnalysis() {
  return useQuery({
    queryKey: ["all-analysis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transcript_analysis")
        .select("*, stocks(company_name, ticker)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useManagementPromises(stockId: string) {
  return useQuery({
    queryKey: ["management-promises", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_promises")
        .select("*")
        .eq("stock_id", stockId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useQuarterlySnapshots(stockId: string) {
  return useQuery({
    queryKey: ["quarterly-snapshots", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_snapshots")
        .select("*")
        .eq("stock_id", stockId);
      if (error) throw error;
      return sortSnapshotsByQuarterDesc(data || []);
    },
    enabled: !!stockId,
  });
}

export function useStockTrackingProfile(stockId: string) {
  return useQuery({
    queryKey: ["stock-tracking-profile", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_tracking_profiles")
        .select("config")
        .eq("stock_id", stockId)
        .maybeSingle();
      if (error) throw error;
      return parseTrackingProfileConfig(data?.config);
    },
    enabled: !!stockId,
  });
}
