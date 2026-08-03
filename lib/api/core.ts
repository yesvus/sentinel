export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

type CacheEntry = { generation: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const DOMAINS: Record<string, string[]> = {
  sessions: ["/api/sessions", "/api/reports/weekly"],
  projects: ["/api/projects"],
  tasks: ["/api/tasks"],
  notes: ["/api/notes"],
};

function domainFor(path: string) {
  for (const [domain, prefixes] of Object.entries(DOMAINS)) {
    if (prefixes.some((p) => path.startsWith(p))) return domain;
  }
  return null;
}

const domainGenerations: Record<string, number> = {};

function generation(path: string) {
  const domain = domainFor(path);
  if (!domain) return 0;
  return domainGenerations[domain] ?? 0;
}

function invalidateDomain(domain: string) {
  domainGenerations[domain] = (domainGenerations[domain] ?? 0) + 1;
  for (const [key] of responseCache) {
    if (domainFor(key) === domain) responseCache.delete(key);
  }
}

function invalidateSessionRelated() {
  invalidateDomain("sessions");
}

export function clearApiCache() {
  for (const domain of Object.keys(DOMAINS)) invalidateDomain(domain);
  inFlightRequests.clear();
}

export function invalidateApiCache() {
  for (const domain of Object.keys(DOMAINS)) invalidateDomain(domain);
}

function cacheLifetime(path: string) {
  if (domainFor(path) === "sessions") return 30_000;
  if (domainFor(path) === "reports") return 10 * 60_000;
  return 10 * 60_000;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? "GET";
  const domain = domainFor(path);
  const lifetime = method === "GET" ? cacheLifetime(path) : 0;

  if (method !== "GET") {
    if (domain) invalidateDomain(domain);
    if (path.startsWith("/api/sessions") || path.startsWith("/api/session-tasks")) {
      invalidateSessionRelated();
    }
    inFlightRequests.delete(path);
  }

  const cached = responseCache.get(path);
  if (lifetime && cached && cached.generation === generation(path)) return cached.value as T;
  const pending = lifetime ? inFlightRequests.get(path) : null;
  if (pending) return pending as Promise<T>;

  const requestGen = generation(path);
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
    if (lifetime && generation(path) === requestGen) {
      responseCache.set(path, { generation: requestGen, value });
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