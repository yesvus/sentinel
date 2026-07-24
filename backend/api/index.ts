import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../src/app.js";
import { initDb } from "../src/db.js";

let dbReady: Promise<void> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!dbReady) {
    dbReady = initDb();
  }
  await dbReady;

  // @ts-expect-error Express request handlers are compatible with Vercel's Node runtime
  return app(req, res);
}
