import type {
  ListToolsResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export type WorkerStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface WorkerCommand {
  type: "connect" | "disconnect" | "listTools" | "callTool";
  data?: {
    tool: string;
    input: { [key: string]: unknown };
  };
}

export type WorkerResponse =
  | {
      type: "status";
      status: WorkerStatus;
    }
  | {
      type: "result";
      result: ListToolsResult | CallToolResult;
    }
  | {
      type: "error";
      error: string;
      details?: Record<string, unknown>;
    };
