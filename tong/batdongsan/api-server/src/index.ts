import "./load-env";
import { httpServer as app } from "./app";
import { startBotServiceSupervisor } from "./lib/bot-services";
import { startPropertyDataRefreshScheduler } from "./lib/property-data-refresh";

const rawPort = process.env["API_SERVER_PORT"] ?? process.env["PORT"] ?? "3001";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await startBotServiceSupervisor();
} catch (error) {
  console.error("[bot-supervisor] Failed to initialize", error);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startPropertyDataRefreshScheduler();
});
