import type {
  ListToolsResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

export type MCPWorkerStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface MCPWorkerCommand {
  type: "connect" | "disconnect" | "listTools" | "callTool";
  data?: {
    tool: string;
    input: { [key: string]: unknown };
  };
}

export type MCPWorkerResponse =
  | {
      type: "status";
      status: MCPWorkerStatus;
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
