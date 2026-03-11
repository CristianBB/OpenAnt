export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> };
  if (init?.body) {
    headers["Content-Type"] ??= "application/json";
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
