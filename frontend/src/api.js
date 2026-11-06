// Every call goes to /api on the same origin; the httpOnly cookie rides along automatically.
export async function api(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error ?? 'Could not reach the server. Check your connection.'), { status: res.status, code: data?.code });
  return data;
}
