const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function fetchLanguages() {
  const res = await fetch(`${API_BASE}/api/v1/languages`);
  if (!res.ok) throw new Error("Failed loading languages");
  return res.json();
}

export async function fetchCountries() {
  const res = await fetch(`${API_BASE}/api/v1/countries`);
  if (!res.ok) throw new Error("Failed loading countries");
  return res.json();
}

// channels: q, page, limit, validate, working_only
export async function fetchChannels(params: {
  q?: string;
  page?: number;
  limit?: number;
  validate?: boolean;
  working_only?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  qs.set("page", String(params.page ?? 1));
  qs.set("limit", String(params.limit ?? 24));
  if (params.validate) qs.set("validate", "true");
  if (params.working_only === false) qs.set("working_only", "false");
  const res = await fetch(`${API_BASE}/api/v1/channels?${qs.toString()}`);
  if (!res.ok) throw new Error("Failed loading channels");
  return res.json();
}


export async function fetchChannelsCount(params?: { q?: string }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  const query = qs.toString();
  const url = query ? `${API_BASE}/api/v1/channels/count?${query}` : `${API_BASE}/api/v1/channels/count`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed loading channels count");
  const data = await res.json();
  return data.total as number;
}
