import type { DeviceCatalog, WasteLogInput } from "./api";

const QUEUE_KEY = "kitzon.pending-waste-events.v1";
const CATALOG_KEY = "kitzon.device-catalog.v1";
const MAX_PENDING_EVENTS = 500;

function readQueue(): WasteLogInput[] {
  try {
    const value = window.localStorage.getItem(QUEUE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(events: WasteLogInput[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
}

export function getPendingWasteLogs() {
  return readQueue();
}

export function queueWasteLog(input: WasteLogInput) {
  const events = readQueue();
  if (events.some((event) => event.client_event_id === input.client_event_id)) return events.length;
  if (events.length >= MAX_PENDING_EVENTS) {
    throw new Error("مساحة الحفظ المحلي ممتلئة. أعد الاتصال بالإنترنت لمزامنة العمليات.");
  }
  events.push(input);
  writeQueue(events);
  return events.length;
}

export function removePendingWasteLog(clientEventId: string) {
  const events = readQueue().filter((event) => event.client_event_id !== clientEventId);
  writeQueue(events);
  return events.length;
}

export function getCachedDeviceCatalog(): DeviceCatalog | null {
  try {
    const value = window.localStorage.getItem(CATALOG_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as DeviceCatalog;
    if (!parsed.scale_id || !Array.isArray(parsed.categories) || !Array.isArray(parsed.reasons)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheDeviceCatalog(catalog: DeviceCatalog) {
  window.localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
}

export function clearCachedDeviceCatalog() {
  window.localStorage.removeItem(CATALOG_KEY);
}
