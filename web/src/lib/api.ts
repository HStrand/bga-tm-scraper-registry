import axios from "axios";
import type { InternalAxiosRequestConfig, AxiosHeaders } from "axios";

// Optional base URL for Azure Functions (recommended in production)
const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;
// Optional functions key (sent as x-functions-key)
const FUNCTIONS_KEY = import.meta.env.VITE_FUNCTIONS_KEY as string | undefined;

// Build absolute URL from a possibly-relative path
export function apiUrl(path: string): string {
  // If path is already absolute, return as-is
  try {
    // new URL throws if not absolute
    // eslint-disable-next-line no-new
    new URL(path);
    return path;
  } catch {
    // Relative: resolve against API_BASE or current origin
    const base = API_BASE || window.location.origin;
    return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/").toString();
  }
}

// Shared axios instance with interceptors
export const api = axios.create();

// Request interceptor to normalize URL and apply x-functions-key
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (config.url) {
    config.url = apiUrl(config.url);
  }
  // Inject functions key if provided and not explicitly overridden
  if (FUNCTIONS_KEY) {
    const headers = (config.headers as AxiosHeaders) || ({} as AxiosHeaders);
    if (!headers.get?.("x-functions-key")) {
      headers.set?.("x-functions-key", FUNCTIONS_KEY);
    }
    config.headers = headers;
  }
  return config;
});
