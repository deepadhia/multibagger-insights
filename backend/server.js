import { app } from "./app.js";
import { PORT } from "./config/env.js";
import { isDriveConfigured } from "./services/drive.service.js";

app.listen(PORT, () => {
  console.log(`Express backend listening on http://localhost:${PORT}`);
  console.log("--- Backend env ---");
  console.log("  Database: configured (DATABASE_URL set)");
  console.log(`  Port: ${PORT}`);
  console.log(
    isDriveConfigured()
      ? "  Google Drive: configured"
      : "  Google Drive: not configured (optional; set GOOGLE_DRIVE_FOLDER_ID and service account to enable uploads)"
  );
});

