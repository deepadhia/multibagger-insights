import { z } from "zod";
import { importGeminiResponseToDb } from "../services/geminiImport.service.js";

const importPayloadSchema = z.object({
  stock_id: z.string().uuid(),
  quarter: z.string().min(1),
  // normalized Gemini payload generated in frontend
  payload: z.object({
    summary: z.string().nullable().optional(),
    dodged_questions: z.array(z.string()).default([]),
    red_flags: z.array(z.string()).default([]),
    metrics: z.record(z.unknown()).default({}),
    signals: z
      .object({
        bullish: z.array(z.string()).default([]),
        warnings: z.array(z.string()).default([]),
        bearish: z.array(z.string()).default([]),
      })
      .optional()
      .nullable(),
    key_changes: z.array(z.string()).default([]),
    thesis_status: z.string().nullable().optional(),
    thesis_status_reason: z.string().nullable().optional(),
    thesis_momentum: z.string().nullable().optional(),
    thesis_drift_status: z.string().nullable().optional(),
    confidence_score: z.number().int().min(0).max(100).nullable().optional(),
    promise_updates: z
      .array(
        z.object({
          id: z.string().uuid(),
          new_status: z.enum(["kept", "broken", "pending"]),
          resolved_in_quarter: z.string().nullable().optional(),
          evidence: z.string().optional(),
        }),
      )
      .default([]),
    new_promises: z
      .array(
        z.object({
          promise_text: z.string().min(1),
          made_in_quarter: z.string().min(1),
          target_deadline: z.string().nullable().optional(),
          confidence: z.enum(["high", "medium", "low"]).optional().nullable(),
        }),
      )
      .default([]),
    raw: z.unknown().optional(),
    // --- Signal Intelligence V6 ---
    primary_metric_momentum: z
      .object({
        direction: z.enum(["accelerating", "decelerating", "stable"]),
        reason: z.string().optional(),
      })
      .nullable()
      .optional(),
    thesis_dependency: z
      .object({
        driver: z.enum(["execution", "capacity_expansion", "demand_tailwind", "pricing"]),
        reliance: z.enum(["proven", "developing", "speculative"]),
        risk_level: z.enum(["low", "medium", "high"]),
      })
      .nullable()
      .optional(),
    execution_quality: z
      .object({
        applicable: z.boolean(),
        status: z.enum(["strong", "moderate", "weak", "NA"]),
        reason: z.string().optional(),
      })
      .nullable()
      .optional(),
    // note: other fields are ignored by this service for determinism
  }),
});

export async function importGeminiResponseHandler(req, res) {
  try {
    const body = await req.body;
    const parsed = importPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "Invalid import payload",
        details: parsed.error.issues,
      });
    }

    const result = await importGeminiResponseToDb({
      stockId: parsed.data.stock_id,
      quarter: parsed.data.quarter,
      payload: parsed.data.payload,
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("importGeminiResponseHandler error:", err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

