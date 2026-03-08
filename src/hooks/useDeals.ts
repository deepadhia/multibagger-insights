import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useInsiderTrades(stockId: string) {
  return useQuery({
    queryKey: ["insider-trades", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insider_trades")
        .select("*")
        .eq("stock_id", stockId)
        .order("trade_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}

export function useBulkDeals(stockId: string) {
  return useQuery({
    queryKey: ["bulk-deals", stockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulk_deals")
        .select("*")
        .eq("stock_id", stockId)
        .order("deal_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!stockId,
  });
}
