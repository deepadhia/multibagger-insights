import type { Database } from "@/integrations/supabase/types";

export type Stock = Database["public"]["Tables"]["stocks"]["Row"];
export type StockInsert = Database["public"]["Tables"]["stocks"]["Insert"];
export type Price = Database["public"]["Tables"]["prices"]["Row"];
export type FinancialMetric = Database["public"]["Tables"]["financial_metrics"]["Row"];
export type Transcript = Database["public"]["Tables"]["transcripts"]["Row"];
export type TranscriptAnalysis = Database["public"]["Tables"]["transcript_analysis"]["Row"];
export type ManagementCommitment = Database["public"]["Tables"]["management_commitments"]["Row"];
export type FinancialResult = Database["public"]["Tables"]["financial_results"]["Row"];
