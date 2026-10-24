import { scheduleDue } from "../src/lib/queue";
import { db } from "../src/lib/db";

let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
while (running) {
  try {
    console.log(`${new Date().toISOString()} queued=${await scheduleDue()}`);
  } catch (error) {
    console.error(
      "Scheduler failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
  if (running)
    await Bun.sleep(
      Math.max(30, Number(process.env.SCHEDULER_INTERVAL_SECONDS) || 60) * 1000,
    );
}
await db.$disconnect();
