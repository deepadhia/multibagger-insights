import { app } from "./app.js";
import { PORT } from "./config/env.js";

app.listen(PORT, () => {
  console.log(`Express backend listening on http://localhost:${PORT}`);
});

