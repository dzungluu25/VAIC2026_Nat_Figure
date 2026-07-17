import { redisClient } from "../../config/redis";

/**
 * Get cached policy text or query answers from Redis.
 * Safely falls back if Redis is offline or throws errors.
 */
export const getCachedPolicy = async (query: string): Promise<string | null> => {
  try {
    if (!redisClient.isOpen) {
      return null;
    }
    const cached = await redisClient.get(`policy-cache:${query}`);
    if (cached) {
      console.log(`[Redis Cache Hit] Retrieved policy query for: "${query}"`);
      return cached;
    }
  } catch (error) {
    console.warn("Redis: failed to read cache query, skipping:", error);
  }
  return null;
};

/**
 * Cache policy text or query answers in Redis with a 1-hour expiration.
 * Safely falls back if Redis is offline or throws errors.
 */
export const setCachedPolicy = async (query: string, result: string): Promise<void> => {
  try {
    if (!redisClient.isOpen) {
      return;
    }
    // Cache for 3600 seconds (1 hour)
    await redisClient.setEx(`policy-cache:${query}`, 3600, result);
    console.log(`[Redis Cache Set] Cached policy query for: "${query}"`);
  } catch (error) {
    console.warn("Redis: failed to write cache query, skipping:", error);
  }
};
