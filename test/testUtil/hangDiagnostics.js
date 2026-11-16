/*
 * mocha root hook for #76: on trixie / node 24 the process sometimes stays alive after mocha printed its summary.
 * If it is still alive a while after the last test, print what keeps it alive and exit with a failure,
 * instead of leaving the job to run until the workflow timeout.
 * The timer is unref'ed, so it never keeps a healthy process alive.
 */
import { execSync } from "node:child_process";

const waitMs = 20000;

export const mochaHooks = {
  afterAll() {
    const timer = setTimeout(()=>{
      console.error(`=== the process is still alive ${waitMs / 1000}s after the last test (#76)`);
      console.error("active resources:", JSON.stringify(process.getActiveResourcesInfo()));

      for (const h of process._getActiveHandles()) {
        console.error("handle:", h.constructor?.name, "pid=", h.pid ?? "-", "spawnargs=", JSON.stringify(h.spawnargs ?? null), "fd=", h.fd ?? "-");
      }
      try {
        console.error(execSync("ps -eo pid,ppid,stat,etime,args --forest").toString());
      } catch (e) {
        console.error(`ps failed: ${e.message}`);
      }
      //mocha overrides the exit code in its own exit handler, so process.exit(99) would still exit with 0
      process.kill(process.pid, "SIGKILL");
    }, waitMs);
    timer.unref();
  }
};
