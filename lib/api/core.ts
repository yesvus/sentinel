export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

type CacheEntry = { expiresAt: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

function cacheLifetime(path: string) {
  if (path === "/api/projects") return 60_000;
  if (path.startsWith("/api/sessions?")) return 30_000;
  if (path === "/api/notes") return 30_000;
  if (path === "/api/tasks") return 30_000;
  if (path.startsWith("/api/reports/weekly?")) return 10 * 60_000;
  return 0;
}

export function clearApiCache() {
  cacheGeneration += 1;
  responseCache.clear();
  inFlightRequests.clear();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const lifetime = method === "GET" ? cacheLifetime(path) : 0;
  if (method !== "GET") clearApiCache();
  const cached = responseCache.get(path);
  if (lifetime && cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = lifetime ? inFlightRequests.get(path) : null;
  if (pending) return pending as Promise<T>;

  const requestGeneration = cacheGeneration;
  const request = (async () => {
    const res = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      if (res.status === 401) clearApiCache();
      const responseBody = await res.json().catch(() => ({}));
      throw new ApiError(res.status, responseBody.error ?? "Something went wrong", responseBody);
    }

    if (res.status === 204) return undefined as T;
    const value = await res.json() as T;
    if (lifetime && requestGeneration === cacheGeneration) {
      responseCache.set(path, { expiresAt: Date.now() + lifetime, value });
    }
    return value;
  })();
  if (lifetime) inFlightRequests.set(path, request);
  try {
    return await request;
  } finally {
    if (lifetime && inFlightRequests.get(path) === request) inFlightRequests.delete(path);
  }
}
