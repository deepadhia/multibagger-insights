import { resetInsightsForStock } from "../services/stocks.service.js";

export async function resetInsightsHandler(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing stock id" });
  }

  try {
    await resetInsightsForStock(id);
    res.json({ ok: true });
  } catch (err) {
    console.error("reset-insights error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

