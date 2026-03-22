import { resetInsightsForStock, resetAllJsonOutputs } from "../services/stocks.service.js";

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

/** POST /api/stocks/reset-all-json - wipe quarterly AI outputs + promise ledger for all stocks. */
export async function resetAllJsonOutputsHandler(_req, res) {
  try {
    await resetAllJsonOutputs();
    res.json({ ok: true });
  } catch (err) {
    console.error("reset-all-json error:", err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

