import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleItinerary } from "./itinerary.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "trip-flow" });
});

app.get("/api/itinerary", handleItinerary);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[trip-flow] server listening on http://localhost:${PORT}`);
})

