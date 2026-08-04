import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      /**
       * Retry server faults, never client faults. Retrying a 403 or a 422 cannot succeed
       * — the request is wrong, not unlucky — and only triples the load and the latency
       * before the user sees the error.
       */
      retry: (failureCount, error) => {
        const status = /** @type {any} */ (error)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
});

export default queryClient;
