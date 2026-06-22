import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { watchEnvInDev } from "./env.js";
import { authRouteHandlers } from "./auth/routes.js";
import { handleItinerary, handleTripItinerary, handleItineraryItemContent, handleTripItineraryItemContent } from "./itinerary.js";
import { handleNotionPage, handleTripNotionPage } from "./notionPage.js";
import { handleTripDetail, handleTripsList } from "./trips/handlers.js";
import { requireAuth } from "./auth/middleware.js";

watchEnvInDev();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "../dist");
const distIndex = path.join(distDir, "index.html");
const serveFrontend = fs.existsSync(distIndex);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, service: "trip-flow" });
});

app.get("/api/trips", requireAuth, handleTripsList);
app.get("/api/trips/:slug", handleTripDetail);
app.get("/api/trips/:slug/itinerary/:flowId/content", handleTripItineraryItemContent);
app.get("/api/trips/:slug/itinerary", handleTripItinerary);
app.get("/api/trips/:slug/pages/:key", handleTripNotionPage);

app.get("/api/itinerary/:flowId/content", handleItineraryItemContent);
app.get("/api/itinerary", handleItinerary);
app.get("/api/pages/:key", handleNotionPage);

app.post("/api/auth/login", authRouteHandlers.login);
app.post("/api/auth/refresh", authRouteHandlers.refresh);
app.post("/api/auth/logout", authRouteHandlers.logout);
app.get("/api/auth/me", ...authRouteHandlers.me);
app.get("/api/trips/:slug/ticket", ...authRouteHandlers.tripTicket);

app.get("/api/ticket", ...authRouteHandlers.ticket);

if (serveFrontend) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(distIndex);
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[trip-flow] server listening on http://localhost:${PORT}${serveFrontend ? " (serving dist)" : ""}`,
  );
});

