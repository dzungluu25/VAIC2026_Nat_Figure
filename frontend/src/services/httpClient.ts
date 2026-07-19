const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const NETWORK_ERROR_MESSAGE = `Không kết nối được backend tại ${API_BASE_URL}. Kiểm tra backend có đang chạy và port/API URL có đúng không.`;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
};

/** JSON request/response helper shared by every REST call (login, non-streaming orchestrate, traces lookup). */
export const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    throw new ApiError(error instanceof TypeError ? NETWORK_ERROR_MESSAGE : String(error), 0);
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
};

/** Multipart POST helper (file uploads) — no Content-Type header set manually so the browser fills in the multipart boundary itself. */
export const apiFetchMultipart = async <T>(path: string, formData: FormData, token: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: undefined,
    });
  } catch (error) {
    throw new ApiError(error instanceof TypeError ? NETWORK_ERROR_MESSAGE : String(error), 0);
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
};

/** Raw streaming POST helper — returns the fetch Response so callers can read the NDJSON body incrementally. */
export const apiFetchStream = async (path: string, body: unknown, token: string, signal?: AbortSignal): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError(error instanceof TypeError ? NETWORK_ERROR_MESSAGE : String(error), 0);
  }

  if (!response.ok || !response.body) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  return response;
};
