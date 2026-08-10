const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const jobsSubmittedTotal = new client.Counter({
  name: "gridstate_jobs_submitted_total",
  help: "Total jobs submitted to the queue",
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  res.on("finish", () => {
    const route = req.route ? req.route.path : req.path;
    httpRequestsTotal.inc({ method: req.method, route, status: res.statusCode });
  });
  next();
}

module.exports = { register, metricsMiddleware, jobsSubmittedTotal };
