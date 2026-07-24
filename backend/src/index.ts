import "dotenv/config";
import { app } from "./app.js";
import { initDb } from "./db.js";
import { createSocketServer } from "./socket.js";

const PORT = process.env.PORT ?? 4000;

initDb().then(() => {
  const server = app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
  createSocketServer(server);
});
