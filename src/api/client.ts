import type { DayDocument } from '../types/dayBook';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8787').replace(/\/$/, '');

export function isCloudConfigured() {
  return Boolean(
    import.meta.env.VITE_AUTH0_DOMAIN &&
      import.meta.env.VITE_AUTH0_CLIENT_ID &&
      import.meta.env.VITE_AUTH0_AUDIENCE &&
      import.meta.env.VITE_API_URL
  );
}

async function apiFetch(
  path: string,
  token: string | null,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function fetchDay(date: string, token: string): Promise<DayDocument | null> {
  const res = await apiFetch(`/api/days/${date}`, token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.day as DayDocument;
}

export async function listDays(token: string): Promise<DayDocument[]> {
  const res = await apiFetch('/api/days', token);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return (json.days || []) as DayDocument[];
}

export async function saveDay(date: string, day: DayDocument, token: string): Promise<DayDocument> {
  const res = await apiFetch(`/api/days/${date}`, token, {
    method: 'PUT',
    body: JSON.stringify(day),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.day as DayDocument;
}

export async function uploadSnapshot(
  date: string,
  context: string,
  file: Blob,
  token: string
): Promise<{ _id: string; context: string; createdAt: string }> {
  const form = new FormData();
  form.append('context', context);
  form.append('file', file, `${context}-${date}.png`);
  const res = await apiFetch(`/api/days/${date}/snapshots`, token, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.snapshot;
}

export async function listSnapshots(date: string, token: string) {
  const res = await apiFetch(`/api/days/${date}/snapshots`, token);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.snapshots || [];
}

export function snapshotUrl(id: string) {
  return `${API_URL}/api/snapshots/${id}`;
}
