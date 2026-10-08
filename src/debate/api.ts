import type { CreateDebateRequest, DebateJobStatus, DebateListItem } from '../../shared/debate-types';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Erreur serveur : ${res.status}`);
  return body as T;
}

export const listDebates = () => request<DebateListItem[]>('/api/debates');

export const getDebate = (id: string) => request<DebateJobStatus>(`/api/debates/${encodeURIComponent(id)}`);

export const createDebate = (body: CreateDebateRequest, adminToken?: string) =>
  request<DebateJobStatus>('/api/debates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'x-admin-token': adminToken } : {}) },
    body: JSON.stringify(body),
  });
