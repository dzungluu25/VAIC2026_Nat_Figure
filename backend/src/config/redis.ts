import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis client connection error:", err);
});

// Immediately connect to Redis
redisClient.connect().then(() => {
  console.log("Connected to Redis successfully.");
}).catch((err) => {
  console.error("Failed to connect to Redis during startup:", err);
});
