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
