import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFinancialMetrics(stockId: string) {
  return useQuery({
    queryKey: ["financial-metrics", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_metrics")
        .select("*")
        .eq("stock_id", stockId)
        .order("year", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useFinancialResults(stockId: string) {
  return useQuery({
    queryKey: ["financial-results", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_results")
        .select("*")
        .eq("stock_id", stockId)
        .order("quarter", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useStockPrices(stockId: string) {
  return useQuery({
    queryKey: ["prices", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prices")
        .select("*")
        .eq("stock_id", stockId)
        .order("date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function usePeerComparison(stockId: string) {
  return useQuery({
    queryKey: ["peers", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("peer_comparison")
        .select("*")
        .eq("stock_id", stockId)
        .order("market_cap", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useShareholding(stockId: string) {
  return useQuery({
    queryKey: ["shareholding", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shareholding")
        .select("*")
        .eq("stock_id", stockId)
        .order("quarter", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}
