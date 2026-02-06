"use client";

export type ApiError = {
  status: number;
  message: string;
  body?: any;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, API_BASE);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const error: ApiError = {
      status: res.status,
      message: (body && (body.detail || body.message)) || res.statusText,
      body,
    };
    throw error;
  }
  return body as T;
}

export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const url = buildUrl(path, query);
  const res = await fetch(url, { method: "GET" });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body?: Record<string, any>,
  query?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const url = buildUrl(path, query);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
  return handleResponse<T>(res);
}
