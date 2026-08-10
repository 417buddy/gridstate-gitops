const express = require("express");
const Redis = require("ioredis");
const client = require("prom-client");

const REGION = process.env.REGION || "unknown";
const PORT = process.env.PORT || 3001;
const QUEUE_KEY = "gridstate:jobs";
const RESULTS_KEY_PREFIX = "gridstate:result:";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: 2,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
});
redis.on("error", (err) => console.error("Redis connection error:", err.message));

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const jobsProcessedTotal = new client.Counter({
  name: "gridstate_jobs_processed_total",
  help: "Total jobs processed by this worker",
  registers: [register],
});
const jobProcessingSeconds = new client.Histogram({
  name: "gridstate_job_processing_seconds",
  help: "Time taken to process a job",
  buckets: [0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

let lastJobProcessedAt = null;

// A small HTTP server alongside the queue consumer purely for /healthz
// and /metrics, this is what lets Project 4's GitOps drift detection and
// Project 5's chaos testing observe the worker, not just the API.
const app = express();
app.get("/healthz", (req, res) =>
  res.json({ status: "ok", region: REGION, lastJobProcessedAt })
);
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
app.listen(PORT, () => console.log(`GridState worker (${REGION}) health server on ${PORT}`));

async function processJob(job) {
  // Deliberately simple "processing": the point of this app is the
  // infrastructure around it, not the job logic itself.
  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));
  return { id: job.id, status: "completed", processedAt: new Date().toISOString(), region: REGION };
}

async function loop() {
  console.log(`GridState worker (${REGION}) starting consume loop`);
  while (true) {
    try {
      // Blocking pop with a timeout, so this loop does not busy-wait
      // against Redis when the queue is empty.
      const popped = await redis.brpop(QUEUE_KEY, 5);
      if (!popped) continue;

      const job = JSON.parse(popped[1]);
      const stopTimer = jobProcessingSeconds.startTimer();
      const result = await processJob(job);
      stopTimer();

      await redis.set(`${RESULTS_KEY_PREFIX}${job.id}`, JSON.stringify(result), "EX", 3600);
      jobsProcessedTotal.inc();
      lastJobProcessedAt = result.processedAt;
    } catch (err) {
      console.error("Worker loop error:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

loop();
