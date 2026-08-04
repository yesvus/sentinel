import { api } from "./core";

export type ApiToken = {
  id: number;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreatedApiToken = ApiToken & { token: string };

export const apiTokens = {
  list: () => api<ApiToken[]>("/api/v1/auth/tokens"),
  create: (details: { name: string; expiresAt?: string | null }) =>
    api<CreatedApiToken>("/api/v1/auth/tokens", { method: "POST", body: JSON.stringify(details) }),
  revoke: (id: number) => api<void>(`/api/v1/auth/tokens/${id}`, { method: "DELETE" }),
};
