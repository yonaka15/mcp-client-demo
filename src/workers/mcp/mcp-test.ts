import type { MCPWorkerResponse, MCPWorkerStatus } from "./mcp-types";

import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

class MCPWorkerTester {
  private worker: Worker;
  private outputDiv!: HTMLElement;
  private statusDiv!: HTMLElement;
  private connectBtn!: HTMLButtonElement;
  private disconnectBtn!: HTMLButtonElement;
  private listToolsBtn!: HTMLButtonElement;
  private toolSelect!: HTMLSelectElement;
  private toolInput!: HTMLTextAreaElement;
  private executeToolBtn!: HTMLButtonElement;

  constructor() {
    this.worker = new Worker(new URL("./mcp-worker.ts", import.meta.url), {
      type: "module",
    });
    this.setupElements();
    this.setupWorkerHandlers();
    this.setupEventListeners();
  }

  private setupElements(): void {
    const elements = {
      outputDiv: document.getElementById("output"),
      statusDiv: document.getElementById("status"),
      connectBtn: document.getElementById("connectBtn"),
      disconnectBtn: document.getElementById("disconnectBtn"),
      listToolsBtn: document.getElementById("listToolsBtn"),
      toolSelect: document.getElementById("toolSelect"),
      toolInput: document.getElementById("toolInput"),
      executeToolBtn: document.getElementById("executeToolBtn"),
    };

    // Validate all elements exist
    Object.entries(elements).forEach(([key, element]) => {
      if (!element) throw new Error(`Element ${key} not found`);
    });

    // Assign elements
    this.outputDiv = elements.outputDiv as HTMLElement;
    this.statusDiv = elements.statusDiv as HTMLElement;
    this.connectBtn = elements.connectBtn as HTMLButtonElement;
    this.disconnectBtn = elements.disconnectBtn as HTMLButtonElement;
    this.listToolsBtn = elements.listToolsBtn as HTMLButtonElement;
    this.toolSelect = elements.toolSelect as HTMLSelectElement;
    this.toolInput = elements.toolInput as HTMLTextAreaElement;
    this.executeToolBtn = elements.executeToolBtn as HTMLButtonElement;

    // Initial state
    this.disconnectBtn.disabled = true;
    this.listToolsBtn.disabled = true;
    this.toolSelect.disabled = true;
    this.toolInput.disabled = true;
    this.executeToolBtn.disabled = true;
  }

  private setupWorkerHandlers(): void {
    this.worker.onmessage = (e: MessageEvent<MCPWorkerResponse>) => {
      const response = e.data;
      this.log("Worker response:", response);

      switch (response.type) {
        case "status":
          this.handleStatusUpdate(response.status);
          break;
        case "result": {
          const result = response.result;
          // List Tools response
          if ("tools" in result) {
            const validatedResult = ListToolsResultSchema.parse(result);
            this.updateToolList(validatedResult);
            if (result._meta) {
              this.log("Metadata:", result._meta);
            }
            if (result.nextCursor) {
              this.log("Next cursor:", result.nextCursor);
            }
          }
          this.handleResult(result);
          break;
        }
        case "error":
          this.handleError(response.error);
          break;
      }
    };

    this.worker.onerror = (error: ErrorEvent) => {
      this.log("Worker error:", error.message);
      this.updateStatus("error");
    };
  }

  private updateToolList(result: ListToolsResult): void {
    this.toolSelect.innerHTML = "";

    result.tools.forEach((tool) => {
      const option = document.createElement("option");
      option.value = tool.name;
      option.textContent = tool.name;
      if (tool.description) {
        option.title = tool.description;
      }
      this.toolSelect.appendChild(option);

      // Update input template when tool is selected
      if (tool.inputSchema.properties) {
        const template = JSON.stringify(
          Object.fromEntries(
            Object.entries(tool.inputSchema.properties).map(([key, schema]) => [
              key,
              this.getSchemaDefaultValue(schema as any),
            ])
          ),
          null,
          2
        );

        if (this.toolSelect.value === tool.name) {
          this.toolInput.value = template;
        }
      }
    });

    // Add tool change handler
    this.toolSelect.onchange = () => {
      const selectedTool = result.tools.find(
        (t) => t.name === this.toolSelect.value
      );
      if (selectedTool?.inputSchema.properties) {
        const template = JSON.stringify(
          Object.fromEntries(
            Object.entries(selectedTool.inputSchema.properties).map(
              ([key, schema]) => [
                key,
                this.getSchemaDefaultValue(schema as any),
              ]
            )
          ),
          null,
          2
        );
        this.toolInput.value = template;
      } else {
        this.toolInput.value = "{}";
      }
    };
  }

  private getSchemaDefaultValue(schema: { type: string; default?: any }): any {
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case "string":
        return "";
      case "number":
        return 0;
      case "boolean":
        return false;
      case "object":
        return {};
      case "array":
        return [];
      default:
        return null;
    }
  }

  private setupEventListeners(): void {
    this.connectBtn.addEventListener("click", () => {
      this.log("Connecting to MCP server...");
      this.worker.postMessage({ type: "connect" });
    });

    this.disconnectBtn.addEventListener("click", () => {
      this.log("Disconnecting from MCP server...");
      this.worker.postMessage({ type: "disconnect" });
    });

    this.listToolsBtn.addEventListener("click", () => {
      this.log("Listing available tools...");
      this.worker.postMessage({ type: "listTools" });
    });

    this.executeToolBtn.addEventListener("click", () => {
      const toolName = this.toolSelect.value;
      let input;
      try {
        input = this.toolInput.value ? JSON.parse(this.toolInput.value) : {};
      } catch (e) {
        this.log("Invalid JSON input:", e);
        return;
      }

      this.log(`Executing tool: ${toolName}`, input);
      this.worker.postMessage({
        type: "callTool",
        data: {
          tool: toolName,
          input,
        },
      });
    });
  }

  private handleStatusUpdate(status: MCPWorkerStatus): void {
    this.updateStatus(status);
    switch (status) {
      case "connected":
        this.connectBtn.disabled = true;
        this.disconnectBtn.disabled = false;
        this.listToolsBtn.disabled = false;
        this.toolSelect.disabled = false;
        this.toolInput.disabled = false;
        this.executeToolBtn.disabled = false;
        break;
      case "disconnected":
      case "error":
        this.connectBtn.disabled = false;
        this.disconnectBtn.disabled = true;
        this.listToolsBtn.disabled = true;
        this.toolSelect.disabled = true;
        this.toolInput.disabled = true;
        this.executeToolBtn.disabled = true;
        break;
    }
  }

  private handleResult(result: unknown): void {
    this.log("Operation result:", result);
  }

  private handleError(error: string): void {
    this.log("Operation error:", error);
    this.updateStatus("error");
  }

  private updateStatus(status: MCPWorkerStatus): void {
    this.statusDiv.textContent = `Status: ${
      status.charAt(0).toUpperCase() + status.slice(1)
    }`;
    this.statusDiv.style.background = this.getStatusColor(status);
  }

  private getStatusColor(status: MCPWorkerStatus): string {
    const colors = {
      connected: "#e8f5e9",
      connecting: "#fff3e0",
      disconnected: "#f5f5f5",
      error: "#ffebee",
    };
    return colors[status] || "#f5f5f5";
  }

  private log(...args: any[]): void {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    console.log(`[${timestamp}]`, ...args);

    const message = args
      .map((arg) => {
        if (arg === null) return "null";
        if (arg === undefined) return "undefined";
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return "[Object]";
          }
        }
        return String(arg);
      })
      .join(" ");

    this.outputDiv.textContent = `[${timestamp}] ${message}\n${this.outputDiv.textContent}`;
  }
}

window.addEventListener("load", () => {
  try {
    new MCPWorkerTester();
    console.log("MCP Worker tester initialized");
  } catch (error) {
    console.error("Failed to initialize MCP worker tester:", error);
  }
});
