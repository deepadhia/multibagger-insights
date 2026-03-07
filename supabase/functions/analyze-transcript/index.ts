import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { stock_id, quarter, year, transcript_text } = await req.json();

    if (!stock_id || !quarter || !transcript_text) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Truncate transcript to ~15000 chars if too long
    const truncatedTranscript = transcript_text.length > 15000 
      ? transcript_text.substring(0, 15000) + "\n\n[TRANSCRIPT TRUNCATED]"
      : transcript_text;

    const systemPrompt = `You are an expert financial analyst specializing in identifying multibagger stocks from earnings call transcripts. Analyze the given earnings call transcript and extract investment-relevant signals.

You MUST respond by calling the extract_analysis function with structured data. Do not respond with plain text.`;

    const userPrompt = `Analyze this earnings call transcript for ${quarter} and extract all investment-relevant signals:

${truncatedTranscript}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_analysis",
              description: "Extract structured investment analysis from earnings call transcript",
              parameters: {
                type: "object",
                properties: {
                  growth_drivers: { type: "array", items: { type: "string" }, description: "Key growth drivers mentioned" },
                  margin_drivers: { type: "array", items: { type: "string" }, description: "Margin improvement drivers" },
                  demand_outlook: { type: "string", description: "Overall demand outlook" },
                  capacity_expansion: { type: "string", description: "Capacity expansion plans" },
                  industry_tailwinds: { type: "array", items: { type: "string" }, description: "Industry tailwinds mentioned" },
                  risks: { type: "array", items: { type: "string" }, description: "Key risks mentioned" },
                  guidance: { type: "string", description: "Management guidance summary" },
                  important_quotes: { type: "array", items: { type: "string" }, description: "5-8 most important quotes from management" },
                  management_tone: { type: "string", enum: ["Bullish", "Neutral", "Cautious"], description: "Overall management tone" },
                  hidden_signals: { type: "array", items: { type: "string" }, description: "Hidden signals like operating leverage, pricing power" },
                  sentiment_score: { type: "integer", description: "Overall sentiment score 1-10" },
                  analysis_summary: { type: "string", description: "3-4 sentence investor summary" },
                  commitments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        statement: { type: "string" },
                        metric: { type: "string" },
                        target_value: { type: "string" },
                        timeline: { type: "string" },
                      },
                      required: ["statement"],
                    },
                    description: "Management commitments and targets mentioned",
                  },
                },
                required: ["growth_drivers", "risks", "management_tone", "sentiment_score", "analysis_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    console.log("AI response received");

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const analysis = JSON.parse(toolCall.function.arguments);
    console.log("Parsed analysis:", JSON.stringify(analysis).substring(0, 200));

    // Store analysis
    const { error: insertError } = await supabase.from("transcript_analysis").insert({
      stock_id,
      quarter,
      year,
      growth_drivers: analysis.growth_drivers || [],
      margin_drivers: analysis.margin_drivers || [],
      demand_outlook: analysis.demand_outlook || null,
      capacity_expansion: analysis.capacity_expansion || null,
      industry_tailwinds: analysis.industry_tailwinds || [],
      risks: analysis.risks || [],
      guidance: analysis.guidance || null,
      important_quotes: analysis.important_quotes || [],
      management_tone: analysis.management_tone || "Neutral",
      hidden_signals: analysis.hidden_signals || [],
      sentiment_score: analysis.sentiment_score || 5,
      analysis_summary: analysis.analysis_summary || null,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    // Store commitments if any
    const commitments = analysis.commitments || [];
    if (commitments.length > 0) {
      const { error: commitError } = await supabase.from("management_commitments").insert(
        commitments.map((c: any) => ({
          stock_id,
          quarter,
          statement: c.statement,
          metric: c.metric || null,
          target_value: c.target_value || null,
          timeline: c.timeline || null,
          status: "Pending",
        }))
      );
      if (commitError) console.error("Commitment insert error:", commitError);
    }

    return new Response(JSON.stringify({ success: true, analysis, commitments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-transcript error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
