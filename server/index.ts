import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { watchEnvInDev } from "./env.js";
import { handleItinerary } from "./itinerary.js";
import { handleNotionPage } from "./notionPage.js";

watchEnvInDev();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "../dist");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "trip-flow" });
});

app.get("/api/itinerary", handleItinerary);
app.get("/api/pages/:key", handleNotionPage);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[trip-flow] server listening on http://localhost:${PORT}`);
});

