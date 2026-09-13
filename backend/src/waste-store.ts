export type WasteLogInput = {
  client_event_id: string;
  scale_id: string;
  weight_kg: number;
  category: string;
  reason: string;
};

export type WasteLog = WasteLogInput & {
  id: string | number;
  created_at: string;
};

export type WasteSummary = {
  total_weight_kg: number;
  total_count: number;
  categories: Array<{ category: string; weight_kg: number; count: number }>;
};

export type RequestContext = {
  accessToken?: string;
  deviceToken?: string;
};

export type ListWasteLogsQuery = { limit: number; offset: number };

export interface WasteStore {
  create(
    input: WasteLogInput,
    context: RequestContext,
  ): Promise<{ log: WasteLog; replayed: boolean }>;
  list(
    query: ListWasteLogsQuery,
    context: RequestContext,
  ): Promise<{ logs: WasteLog[]; total: number }>;
  summary(context: RequestContext): Promise<WasteSummary>;
  ready(): Promise<void>;
  close(): Promise<void>;
}

export class ApplicationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
