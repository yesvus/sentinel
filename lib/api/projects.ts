import { api } from "./core";

export type Project = {
  id: number;
  name: string;
  icon: string | null;
  description: string | null;
  resources: string | null;
  parentId: number | null;
  pinned: boolean;
  archived: boolean;
  path: string;
  depth: number;
  sortOrder: number;
  lastUsedAt: string | null;
};

export const projects = {
  list: () => api<Project[]>("/api/v1/projects"),
  create: (name: string, icon?: string | null, description?: string | null) =>
    api<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify({ name, icon, description }) }),
  rename: (
    id: number,
    name: string,
    icon?: string | null,
    description?: string | null,
    parentId?: number | null,
    resources?: string | null,
  ) =>
    api<Project>(`/api/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, icon, description, parentId, resources }),
    }),
  move: (id: number, parentId: number | null, position: number) =>
    api<Project>(`/api/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ parentId, position }),
    }),
  updateState: (id: number, details: { pinned?: boolean; archived?: boolean }) =>
    api<Project>(`/api/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(details) }),
  remove: (id: number) => api<void>(`/api/v1/projects/${id}`, { method: "DELETE" }),
};
