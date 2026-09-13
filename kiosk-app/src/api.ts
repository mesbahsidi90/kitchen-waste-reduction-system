import axios from "axios";

export type WasteLogInput = {
  client_event_id: string;
  scale_id: string;
  weight_kg: number;
  category: string;
  reason: string;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1",
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
    ...(import.meta.env.VITE_DEVICE_TOKEN
      ? { Authorization: `Device ${import.meta.env.VITE_DEVICE_TOKEN}` }
      : {}),
  },
});

export async function createWasteLog(input: WasteLogInput) {
  await api.post("/waste-logs", input);
}
