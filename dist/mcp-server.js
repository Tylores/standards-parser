#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { runGenericPipeline } from "./index.js";
import { RequirementAuditor } from "./auditing.js";
import { readFile, access } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { Type } from "typebox";
import { Value } from "typebox/value";
// Error guards to prevent crashing on unhandled promise rejections or exceptions
process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection in MCP server:", reason);
});
process.on("uncaughtException", (error) => {
    console.error("Uncaught exception in MCP server:", error);
});
// TypeBox schemas for input validation
const StandardParsePdfSchema = Type.Object({
    pdf_path: Type.String({ minLength: 1 }),
    output_dir: Type.Optional(Type.String()),
    domain: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("generic"),
        Type.Literal("smartGrid"),
        Type.Literal("security"),
    ])),
    additional_domain_info: Type.Optional(Type.String()),
});
const StandardAuditQuerySchema = Type.Object({
    query: Type.String({ minLength: 1 }),
    output_dir: Type.String({ minLength: 1 }),
});
const server = new Server({
    name: "standards-parser",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Helper to validate that resolved paths reside within the workspace base directory
function validateSafePath(baseDir, targetPath) {
    const resolvedPath = resolve(baseDir, targetPath);
    const rel = relative(baseDir, resolvedPath);
    const isSafe = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    if (!isSafe) {
        throw new McpError(ErrorCode.InvalidParams, `Access denied: path '${targetPath}' resolves outside the allowed base directory.`);
    }
    return resolvedPath;
}
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
                            default: "./output_standard_parser",
                        },
                        domain: {
                            type: "string",
                            enum: ["auto", "generic", "smartGrid", "security"],
                            description: "Domain preset ('auto', 'generic', 'smartGrid', 'security'). Default is 'auto'.",
                            default: "auto",
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
                            description: "Directory containing the parsed knowledge graph files (e.g., './output_standard_parser').",
                        },
                    },
                    required: ["query", "output_dir"],
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
            // 1. Boundary validation using TypeBox
            if (!Value.Check(StandardParsePdfSchema, args)) {
                const errors = [...Value.Errors(StandardParsePdfSchema, args)]
                    .map((e) => `${e.instancePath.slice(1)}: ${e.message}`)
                    .join(", ");
                throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${errors}`);
            }
            const validated = args;
            const rawPdfPath = validated.pdf_path;
            const rawOutDir = validated.output_dir || "./output_standard_parser";
            const domain = validated.domain || "auto";
            const additionalDomainInfo = validated.additional_domain_info;
            // 2. Safe path validation
            const baseDir = process.cwd();
            const pdfPath = validateSafePath(baseDir, rawPdfPath);
            const outDir = validateSafePath(baseDir, rawOutDir);
            const ctx = {
                cwd: baseDir,
            };
            const results = await runGenericPipeline(pdfPath, outDir, ctx, {
                domain,
                additionalDomainInfo,
            });
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
            // 1. Boundary validation using TypeBox
            if (!Value.Check(StandardAuditQuerySchema, args)) {
                const errors = [...Value.Errors(StandardAuditQuerySchema, args)]
                    .map((e) => `${e.instancePath.slice(1)}: ${e.message}`)
                    .join(", ");
                throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${errors}`);
            }
            const validated = args;
            const query = validated.query;
            const rawSearchDir = validated.output_dir;
            // 2. Safe path validation
            const baseDir = process.cwd();
            const searchDir = validateSafePath(baseDir, rawSearchDir);
            const resolvedGraphPath = resolve(baseDir, join(searchDir, "knowledge_graph.json"));
            // 3. Async existence check
            try {
                await access(resolvedGraphPath);
            }
            catch {
                throw new McpError(ErrorCode.InvalidParams, `No active Knowledge Graph found in ${searchDir}. Please run 'standard_parse_pdf' first.`);
            }
            // 4. Async file reading
            let graph;
            try {
                const fileContent = await readFile(resolvedGraphPath, "utf8");
                const parsed = JSON.parse(fileContent);
                if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
                    graph = parsed;
                }
                else {
                    throw new Error("Invalid graph JSON structure");
                }
            }
            catch (err) {
                throw new McpError(ErrorCode.InternalError, `Failed to load knowledge graph from ${resolvedGraphPath}: ${err.message}`);
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
        throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }
    catch (err) {
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
