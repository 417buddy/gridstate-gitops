const express = require("express");
const { z } = require("zod");
const { redis, QUEUE_KEY, RESULTS_KEY_PREFIX } = require("./redis");
const { register, metricsMiddleware, jobsSubmittedTotal } = require("./metrics");

const app = express();
const PORT = process.env.PORT || 3000;
const REGION = process.env.REGION || "unknown";

const jobSchema = z.object({
  type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional(),
});

app.use(express.json());
app.use(metricsMiddleware);

app.post("/jobs", async (req, res) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid job data" });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = { id: jobId, ...parsed.data, submittedAt: new Date().toISOString() };

  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  jobsSubmittedTotal.inc();

  res.status(202).json({ id: jobId, status: "queued" });
});

app.get("/jobs/:id", async (req, res) => {
  const result = await redis.get(`${RESULTS_KEY_PREFIX}${req.params.id}`);
  if (!result) {
    return res.status(202).json({ id: req.params.id, status: "pending" });
  }
  res.json(JSON.parse(result));
});

// The real signal Project 4's drift detection and Project 5's region
// drill both watch: how deep is the backlog, and is this region even
// reachable right now.
app.get("/status", async (req, res) => {
  try {
    const queueDepth = await redis.llen(QUEUE_KEY);
    res.json({ region: REGION, redis: "connected", queueDepth });
  } catch (err) {
    res.status(503).json({ region: REGION, redis: "unreachable", error: err.message });
  }
});

app.get("/healthz", (req, res) => res.json({ status: "ok", region: REGION }));

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  console.log(`GridState API (${REGION}) listening on ${PORT}`);
});

module.exports = app;
