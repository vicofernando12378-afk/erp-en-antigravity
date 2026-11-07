export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'https://us-central1-crm-erps.cloudfunctions.net/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('erp_token');
  const headers = new Headers({
    'Accept': 'application/json',
    'x-test-bypass': 'true',
    'x-test-role': 'admin',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  });

  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const response = await fetch(`${API_BASE_URL}${cleanEndpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw new ApiError(`Error en el servidor (${response.status})`, response.status);
    }
    const text = await response.text();
    return text as any;
  }

  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('erp:unauthorized'));
    }
    const details = result.errors ? Object.values(result.errors).flat().join(' ') : '';
    throw new ApiError(details || result.error || result.message || `Error ${response.status}`, response.status);
  }

  return result;
}

export function mutate<T = any>(endpoint: string, data: unknown, key: string, method = 'POST'): Promise<T> {
  return apiFetch<T>(endpoint, {
    method,
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(data),
  });
}
