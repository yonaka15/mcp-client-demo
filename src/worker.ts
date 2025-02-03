/// <reference lib="webworker" />

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { WorkerCommand, WorkerResponse, WorkerStatus } from "./types";

declare const self: DedicatedWorkerGlobalScope;

const debugLog = (message: string, ...args: any[]): void => {
  const timestamp = new Date().toISOString();
  console.log(`[MCP Worker ${timestamp}] ${message}`, ...args);
};

class MCPWorker {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  constructor() {
    debugLog("MCPWorker initialized");
  }

  private async connect(): Promise<void> {
    try {
      debugLog("Creating transport");
      // Connect to local Pyodide server
      const url = new URL("http://localhost:3020/sse");
      this.transport = new SSEClientTransport(url);

      debugLog("Creating client");
      this.client = new Client(
        {
          name: "mcp-client-demo",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      debugLog("Connecting to server");
      await this.client.connect(this.transport);
      debugLog("Connected successfully");

      this.sendStatus("connected");
    } catch (error) {
      debugLog("Connection error:", error);
      this.handleError(error);
    }
  }

  private async listTools(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error("Client not connected");
      }

      debugLog("Listing tools");
      const result = await this.client.listTools();
      debugLog("Tools:", result);

      // Send the ListToolsResult directly
      this.sendResult(result);
    } catch (error) {
      debugLog("List tools error:", error);
      this.handleError(error);
    }
  }

  private async callTool(
    toolName: string,
    input?: Record<string, unknown>
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new Error("Client not connected");
      }

      debugLog(`Calling tool ${toolName} with input:`, input);

      // リクエストの構築と検証
      const toolRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: input,
        },
      };
      const validatedRequest = CallToolRequestSchema.parse(toolRequest);

      // ツールの実行
      const rawResult = await this.client.callTool(validatedRequest.params);
      debugLog("Tool execution result:", rawResult);

      // レスポンスの検証と構築
      const validatedResult = CallToolResultSchema.parse(rawResult);
      const workerResponse: WorkerResponse = {
        type: "result",
        result: validatedResult,
      };

      self.postMessage(workerResponse);
    } catch (error) {
      debugLog("Tool execution error:", error);
      this.handleError(error);
    }
  }

  public async handleCommand(command: WorkerCommand): Promise<void> {
    debugLog("Handling command:", command);

    try {
      switch (command.type) {
        case "connect":
          await this.connect();
          break;

        case "callTool":
          if (command.data?.tool && command.data?.input) {
            await this.callTool(command.data.tool, command.data.input);
          } else {
            throw new Error("Missing tool name or input");
          }
          break;

        case "listTools":
          await this.listTools();
          break;

        case "disconnect":
          await this.disconnect();
          break;

        default:
          throw new Error(`Unknown command type: ${(command as any).type}`);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.client) {
        debugLog("Disconnecting");
        await this.client.close();
        this.client = null;
        this.transport = null;
        debugLog("Disconnected");

        this.sendStatus("disconnected");
      }
    } catch (error) {
      debugLog("Disconnect error:", error);
      this.handleError(error);
    }
  }

  private sendStatus(status: WorkerStatus): void {
    const response: WorkerResponse = {
      type: "status",
      status,
    };
    debugLog("Sending status:", response);
    self.postMessage(response);
  }

  private sendResult(result: ListToolsResult | CallToolResult): void {
    const response: WorkerResponse = {
      type: "result",
      result,
    };
    debugLog("Sending result:", response);
    self.postMessage(response);
  }

  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog("Error:", errorMessage);

    const response: WorkerResponse = {
      type: "error",
      error: errorMessage,
    };
    self.postMessage(response);
  }
}

// Initialize worker and set up message handler
const worker = new MCPWorker();

self.addEventListener("message", (event: MessageEvent<WorkerCommand>) => {
  debugLog("Received message:", event.data);
  worker.handleCommand(event.data).catch((error) => {
    debugLog("Unhandled error:", error);
  });
});
