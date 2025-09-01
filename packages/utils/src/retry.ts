export type RetryOptions = {
  maxAttempts?: number; // total attempts including the first
  initialDelayMs?: number; // base delay for backoff
  backoffMultiplier?: number; // exponential multiplier
  isRetryable?: (error: unknown) => boolean; // predicate to decide retry
  onRetry?: (info: { attempt: number; error: unknown; nextDelayMs: number }) => void;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 2,
    isRetryable = () => true,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      onRetry?.({ attempt, error, nextDelayMs: delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

