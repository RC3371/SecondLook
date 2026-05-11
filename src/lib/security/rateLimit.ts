type RateLimitRecord = {
  count: number;
  windowStartMs: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

const bucket = new Map<string, RateLimitRecord>();

export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = bucket.get(key);

  if (!existing || now - existing.windowStartMs >= options.windowMs) {
    bucket.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.limit) {
    const retryMs = options.windowMs - (now - existing.windowStartMs);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
    };
  }

  existing.count += 1;
  bucket.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitStore() {
  bucket.clear();
}
