import axios from "axios";

export type WasteLogInput = {
  client_event_id: string;
  scale_id: string;
  weight_kg: number;
  category: string;
  reason: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  color?: string;
};

export type DeviceCatalog = {
  scale_id: string;
  categories: CatalogItem[];
  reasons: CatalogItem[];
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

const DEVICE_TOKEN_KEY = "kitzon.device-token";

export function getDeviceToken() {
  return window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? import.meta.env.VITE_DEVICE_TOKEN ?? "";
}

export function clearDeviceToken() {
  window.localStorage.removeItem(DEVICE_TOKEN_KEY);
}

function deviceAuthorization() {
  const token = getDeviceToken();
  return token ? { headers: { Authorization: `Device ${token}` } } : undefined;
}

export async function createWasteLog(input: WasteLogInput) {
  await api.post("/waste-logs", input, deviceAuthorization());
}

export async function getDeviceCatalog() {
  const response = await api.get<{ data: DeviceCatalog }>("/catalog", deviceAuthorization());
  return response.data.data;
}

export async function claimDevice(pairingCode: string) {
  const response = await api.post<{ data: { device_token: string; device_code: string; device_name: string } }>(
    "/devices/claim",
    { pairingCode },
  );
  window.localStorage.setItem(DEVICE_TOKEN_KEY, response.data.data.device_token);
  return response.data.data;
}

export function isDeviceUnauthorized(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function isRetryableWasteLogError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true;
  return error.response.status === 408 || error.response.status === 429 || error.response.status >= 500;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  return (error.response?.data as { error?: { message?: string } } | undefined)?.error?.message ?? fallback;
}
