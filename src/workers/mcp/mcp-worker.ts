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
import type {
  MCPWorkerCommand,
  MCPWorkerResponse,
  MCPWorkerStatus,
} from "./mcp-types";

declare const self: DedicatedWorkerGlobalScope;

// Enhanced debugging with log levels
const LogLevel = {
  DEBUG: "DEBUG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const;

type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const log = (level: LogLevel, message: string, ...args: any[]): void => {
  const timestamp = new Date().toISOString();
  console.log(`[MCP Worker ${timestamp}] [${level}] ${message}`, ...args);
};

class MCPWorker {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatInterval: number | null = null;
  private status: MCPWorkerStatus = "disconnected";
  private readonly reconnectDelay = 5000; // 5 seconds
  private readonly heartbeatDelay = 30000; // 30 seconds

  constructor(
    private readonly serverUrl: string = "http://localhost:3020/sse"
  ) {
    log(LogLevel.INFO, "MCPWorker initialized");
    this.setupHeartbeat();
  }

  private setStatus(newStatus: MCPWorkerStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.sendStatus(newStatus);
    }
  }

  private setupHeartbeat(): void {
    if (this.heartbeatInterval) {
      self.clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = self.setInterval(() => {
      if (this.status === "connected" && this.client) {
        this.checkConnection();
      }
    }, this.heartbeatDelay);
  }

  private async checkConnection(): Promise<void> {
    try {
      await this.client?.listTools();
    } catch (error) {
      log(LogLevel.WARN, "Connection check failed:", error);
      await this.handleConnectionFailure();
    }
  }

  private async handleConnectionFailure(): Promise<void> {
    this.setStatus("error");
    await this.disconnect();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.reconnectTimer) {
      this.reconnectTimer = self.setTimeout(async () => {
        log(LogLevel.INFO, "Attempting to reconnect...");
        await this.connect();
        this.reconnectTimer = null;
      }, this.reconnectDelay);
    }
  }

  private async connect(): Promise<void> {
    try {
      if (this.status === "connected") {
        return;
      }

      this.setStatus("connecting");
      log(LogLevel.INFO, "Creating transport");

      const url = new URL(this.serverUrl);
      this.transport = new SSEClientTransport(url);

      log(LogLevel.INFO, "Creating client");
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

      log(LogLevel.INFO, "Connecting to server");
      await this.client.connect(this.transport);
      log(LogLevel.INFO, "Connected successfully");

      this.setStatus("connected");
    } catch (error) {
      log(LogLevel.ERROR, "Connection error:", error);
      await this.handleConnectionFailure();
      throw error;
    }
  }

  private async listTools(): Promise<void> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    try {
      log(LogLevel.INFO, "Listing tools");
      const result = await this.client.listTools();
      log(LogLevel.DEBUG, "Tools:", result);
      this.sendResult(result);
    } catch (error) {
      log(LogLevel.ERROR, "List tools error:", error);
      throw error;
    }
  }

  private async callTool(
    toolName: string,
    input?: Record<string, unknown>
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    try {
      log(LogLevel.INFO, `Calling tool ${toolName} with input:`, input);

      const toolRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: input,
        },
      };

      const validatedRequest = CallToolRequestSchema.parse(toolRequest);
      const rawResult = await this.client.callTool(validatedRequest.params);
      const validatedResult = CallToolResultSchema.parse(rawResult);

      log(LogLevel.DEBUG, "Tool execution result:", validatedResult);
      this.sendResult(validatedResult);
    } catch (error) {
      log(LogLevel.ERROR, "Tool execution error:", error);
      throw error;
    }
  }

  public async handleCommand(command: MCPWorkerCommand): Promise<void> {
    log(LogLevel.INFO, "Handling command:", command);

    try {
      switch (command.type) {
        case "connect":
          await this.connect();
          break;

        case "callTool":
          if (!command.data?.tool) {
            throw new Error("Missing tool name");
          }
          await this.callTool(command.data.tool, command.data.input);
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
      if (this.heartbeatInterval) {
        self.clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.reconnectTimer) {
        self.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.client) {
        log(LogLevel.INFO, "Disconnecting");
        await this.client.close();
        this.client = null;
        this.transport = null;
        log(LogLevel.INFO, "Disconnected");
      }

      this.setStatus("disconnected");
    } catch (error) {
      log(LogLevel.ERROR, "Disconnect error:", error);
      throw error;
    }
  }

  private sendStatus(status: MCPWorkerStatus): void {
    const response: MCPWorkerResponse = {
      type: "status",
      status,
    };
    log(LogLevel.DEBUG, "Sending status:", response);
    self.postMessage(response);
  }

  private sendResult(result: ListToolsResult | CallToolResult): void {
    const response: MCPWorkerResponse = {
      type: "result",
      result,
    };
    log(LogLevel.DEBUG, "Sending result:", response);
    self.postMessage(response);
  }

  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails =
      error instanceof Error ? { stack: error.stack } : undefined;

    log(LogLevel.ERROR, "Error:", errorMessage, errorDetails);

    const response: MCPWorkerResponse = {
      type: "error",
      error: errorMessage,
      details: errorDetails,
    };
    self.postMessage(response);
  }
}

// Initialize worker and set up message handler
const worker = new MCPWorker();

self.addEventListener("message", (event: MessageEvent<MCPWorkerCommand>) => {
  log(LogLevel.DEBUG, "Received message:", event.data);
  worker.handleCommand(event.data).catch((error) => {
    log(LogLevel.ERROR, "Unhandled error:", error);
  });
});
