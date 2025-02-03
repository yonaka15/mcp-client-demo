// Base response structure for all workers
export interface BaseResponse {
  type: string;
  error?: string;
  details?: Record<string, unknown>;
}

// Base command structure for all workers
export interface BaseCommand {
  type: string;
  data?: Record<string, unknown>;
}

// Common status types for workers
export type WorkerBaseStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
