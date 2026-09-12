import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ExtractError } from "./errors";

// Optional: with no Upstash credentials the app runs unlimited.
const enabled = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const limiter = enabled
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: false,
      prefix: "doc-extractor",
    })
  : null;

/**
 * `ip` comes from x-forwarded-for, which the client controls unless the platform
 * overwrites it — Vercel does. Behind any other proxy this limit is advisory.
 */
export async function checkRateLimit(ip: string) {
  if (!limiter) return;
  try {
    const { success } = await limiter.limit(ip);
    if (!success) throw new ExtractError("rate_limited");
  } catch (e) {
    // An Upstash outage must not take extraction down with it: fail open.
    if (e instanceof ExtractError) throw e;
  }
}
