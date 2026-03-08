import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAllFinancialMetrics() {
  return useQuery({
    queryKey: ["all-financial-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_metrics")
        .select("*")
        .order("year", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllShareholding() {
  return useQuery({
    queryKey: ["all-shareholding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shareholding")
        .select("*")
        .order("quarter", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllSnapshots() {
  return useQuery({
    queryKey: ["all-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarterly_snapshots")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllPromises() {
  return useQuery({
    queryKey: ["all-promises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_promises")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllCommitments() {
  return useQuery({
    queryKey: ["all-commitments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("management_commitments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
