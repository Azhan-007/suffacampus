import "dotenv/config";
import pino from "pino";
import {
  initNotificationQueueWorker,
  shutdownNotificationQueueWorker,
} from "../services/notification-queue.service";

const log = pino({ name: "notification-worker" });

async function main() {
  await initNotificationQueueWorker();
  log.info("Notification worker started");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      log.info({ signal }, "Shutting down notification worker");
      try {
        await shutdownNotificationQueueWorker();
        process.exit(0);
      } catch (err) {
        log.error({ err }, "Failed to shut down notification worker cleanly");
        process.exit(1);
      }
    });
  }
}

void main().catch((err) => {
  log.error({ err }, "Notification worker failed to start");
  process.exit(1);
});
