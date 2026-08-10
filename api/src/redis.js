const Redis = require("ioredis");

// Single shared connection point. This is deliberately the one piece of
// state both services depend on, it is what Project 4's GitOps drift
// work watches, what Project 5's region drill has to survive losing,
// and what Project 6's ephemeral environments have to recreate cleanly
// every time.
//
// maxRetriesPerRequest and a bounded retryStrategy are not optional
// here: ioredis's defaults queue commands and retry reconnecting
// indefinitely, which means a route like /status that awaits a Redis
// call would hang rather than fail, exactly the wrong behavior for a
// health signal Project 5's evacuation drill needs to trust quickly.
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: 2,
  retryStrategy(times) {
    if (times > 5) return null; // stop retrying, let callers see a real error
    return Math.min(times * 200, 2000);
  },
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

const QUEUE_KEY = "gridstate:jobs";
const RESULTS_KEY_PREFIX = "gridstate:result:";

module.exports = { redis, QUEUE_KEY, RESULTS_KEY_PREFIX };
