#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { runGenericPipeline } from "./index.js";
import { RequirementAuditor } from "./auditing.js";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { KnowledgeGraph } from "./semanticLinker.js";

// Keep in-memory tracking of the last output directory in this session
let lastOutputDir: string = "./output_standard_parser";

const server = new Server(
  {
    name: "standards-parser",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register the list of tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "standard_parse_pdf",
        description: "Parses any technical standards PDF document, extracts layout blocks, mines compliance rules/requirements (including implicit requirements via LLM if provider keys are configured), and constructs a semantic Knowledge Graph.",
        inputSchema: {
          type: "object",
          properties: {
            pdf_path: {
              type: "string",
              description: "Relative or absolute path to the PDF standard file",
            },
            output_dir: {
              type: "string",
              description: "Relative or absolute path to save parsed outputs (default: './output_standard_parser')",
            },
            domain: {
              type: "string",
              enum: ["auto", "generic", "smartGrid", "security"],
              description: "Domain preset ('auto', 'generic', 'smartGrid', 'security'). Default is 'auto'.",
            },
            additional_domain_info: {
              type: "string",
              description: "Optional additional context about the standard or system architecture to include in the LLM analysis.",
            },
          },
          required: ["pdf_path"],
        },
      },
      {
        name: "standard_audit_query",
        description: "Queries the compliance Knowledge Graph using exact IDs or a flexible TF-IDF keyword search, compiling an expert audit payload ready for compliance review and LLM analysis.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query: requirement ID (e.g. 'REQ-001'), section (e.g. '2.0'), term (e.g. 'security'), or a general idea (e.g. 'transmission latency issues')",
            },
            output_dir: {
              type: "string",
              description: "Directory to load the knowledge graph from if not in memory (default: last output directory or './output_standard_parser')",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "standard_parse_pdf") {
      const pdfPath = args?.pdf_path as string;
      const outDir = (args?.output_dir as string) || "./output_standard_parser";
      const domain = (args?.domain as "auto" | "generic" | "smartGrid" | "security") || "auto";
      const additionalDomainInfo = args?.additional_domain_info as string;

      if (!pdfPath) {
        throw new McpError(ErrorCode.InvalidParams, "Missing pdf_path parameter");
      }

      // We run the pipeline. Since we are in the MCP server, ctx has process.cwd() as cwd,
      // and we don't have Pi agent specific UI elements.
      const ctx = {
        cwd: process.cwd(),
      };

      const results = await runGenericPipeline(pdfPath, outDir, ctx, {
        domain,
        additionalDomainInfo,
      });

      // Update the session's last output directory
      if (results.absOutputDir) {
        lastOutputDir = results.absOutputDir;
      }

      const nodeSummary = Object.entries(results.nodes)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");
      const edgeSummary = Object.entries(results.edges)
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join("\n");

      const summaryText = `Standards parsing completed successfully!
Detected Domain: ${results.detectedDomain.toUpperCase()}
Outputs saved to: ${results.absOutputDir}
Parsed ${results.blocksCount} layout blocks and mined ${results.rulesCount} compliance requirements.
Interactive Graph Explorer saved to: ${join(results.absOutputDir, "graph_explorer.html")}

Knowledge Graph Constructed:
Nodes:
${nodeSummary}
Edges:
${edgeSummary}`;

      return {
        content: [
          {
            type: "text",
            text: summaryText,
          },
        ],
      };
    }

    if (name === "standard_audit_query") {
      const query = args?.query as string;
      let searchDir = args?.output_dir as string;

      if (!query) {
        throw new McpError(ErrorCode.InvalidParams, "Missing query parameter");
      }

      if (!searchDir) {
        searchDir = lastOutputDir || "./output_standard_parser";
      }

      const resolvedGraphPath = resolve(process.cwd(), join(searchDir, "knowledge_graph.json"));
      if (!existsSync(resolvedGraphPath)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No active Knowledge Graph found in ${searchDir}. Please run 'standard_parse_pdf' first.`
        );
      }

      let graph: KnowledgeGraph;
      try {
        const parsed = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
        if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          graph = parsed as KnowledgeGraph;
        } else {
          throw new Error("Invalid graph JSON structure");
        }
      } catch (err: any) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to load knowledge graph from ${resolvedGraphPath}: ${err.message}`
        );
      }

      const activeConfig = graph.metadata?.config;
      const auditor = new RequirementAuditor(graph, activeConfig);
      const payload = auditor.generateAuditPayload(query);

      return {
        content: [
          {
            type: "text",
            text: payload,
          },
        ],
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  } catch (err: any) {
    if (err instanceof McpError) {
      throw err;
    }
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server using stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Standards Parser MCP Server running on stdio");
}

main().catch((err) => {
  console.error("MCP Server failed to start:", err);
  process.exit(1);
});
