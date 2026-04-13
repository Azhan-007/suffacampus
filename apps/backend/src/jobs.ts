import { startWorkers, stopWorkers } from "./workers";
import { createLogger } from "./utils/logger";

const log = createLogger("jobs");

let jobsStarted = false;

export function startCronJobs(): void {
  if (jobsStarted) {
    log.debug("Cron jobs already running; skipping duplicate start");
    return;
  }

  startWorkers();
  jobsStarted = true;
  log.info("Cron jobs started");
}

export function stopCronJobs(): void {
  if (!jobsStarted) {
    log.debug("Cron jobs already stopped; skipping duplicate stop");
    return;
  }

  stopWorkers();
  jobsStarted = false;
  log.info("Cron jobs stopped");
}
