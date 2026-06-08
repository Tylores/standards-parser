import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PDFParser, buildHierarchyTree, treeToMarkdown, Block } from "./parser.js";
import { RuleMiner, Rule } from "./ruleMiner.js";
import { SemanticLinker, KnowledgeGraph } from "./semanticLinker.js";
import { RequirementAuditor } from "./auditing.js";

export default function (pi: ExtensionAPI) {
  // Closure variable to keep the active Knowledge Graph in memory
  let activeGraph: KnowledgeGraph | null = null;
  let lastOutputDir: string = "./output_ieee_parser";

  // Reconstruct active graph from previous session entries if present
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("IEEE PDF Parser extension loaded!", "info");

    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "ieee-parser-state") {
        const data = entry.data as any;
        if (data && typeof data.lastOutputDir === "string") {
          lastOutputDir = data.lastOutputDir;
          const graphPath = join(lastOutputDir, "knowledge_graph.json");
          const resolvedPath = resolve(ctx.cwd, graphPath);
          if (existsSync(resolvedPath)) {
            try {
              activeGraph = JSON.parse(readFileSync(resolvedPath, "utf8"));
            } catch {
              // Ignore reconstruction errors
            }
          }
        }
      }
    }
  });

  // Helper function to run the full pipeline
  async function runPipeline(pdfPath: string, outputDir: string, ctx: any) {
    const absPdfPath = resolve(ctx.cwd, pdfPath);
    if (!existsSync(absPdfPath)) {
      throw new Error(`Target PDF file not found at: ${pdfPath}`);
    }

    const absOutputDir = resolve(ctx.cwd, outputDir);
    mkdirSync(absOutputDir, { recursive: true });

    // Step 1: Parse PDF
    const parser = new PDFParser(absPdfPath);
    const blocks = await parser.parse();

    const blocksPath = join(absOutputDir, "blocks.json");
    writeFileSync(blocksPath, JSON.stringify(blocks, null, 2), "utf8");

    const tree = buildHierarchyTree(blocks);
    const treePath = join(absOutputDir, "tree.json");
    writeFileSync(treePath, JSON.stringify(tree, null, 2), "utf8");

    const mdContent = treeToMarkdown(tree);
    const markdownPath = join(absOutputDir, "document_cleaned.md");
    writeFileSync(markdownPath, mdContent, "utf8");

    // Step 2: Mine Rules
    const miner = new RuleMiner();
    const ruleLedger = miner.mineRules(blocks);
    const ledgerPath = join(absOutputDir, "ledger.json");
    writeFileSync(ledgerPath, JSON.stringify(ruleLedger, null, 2), "utf8");

    // Step 3: Semantic Linker & Knowledge Graph
    const linker = new SemanticLinker();
    const kg = linker.buildKnowledgeGraph(ruleLedger, blocks);
    const graphPath = join(absOutputDir, "knowledge_graph.json");
    writeFileSync(graphPath, JSON.stringify(kg, null, 2), "utf8");

    // Update in-memory state
    activeGraph = kg;
    lastOutputDir = outputDir;

    // Persist path in session
    pi.appendEntry("ieee-parser-state", { lastOutputDir });

    // Node & Edge Counts
    const nodeCounts: Record<string, number> = {};
    for (const node of kg.nodes) {
      nodeCounts[node.label] = (nodeCounts[node.label] || 0) + 1;
    }
    const edgeCounts: Record<string, number> = {};
    for (const edge of kg.edges) {
      edgeCounts[edge.type] = (edgeCounts[edge.type] || 0) + 1;
    }

    return {
      blocksCount: blocks.length,
      rulesCount: ruleLedger.length,
      nodes: nodeCounts,
      edges: edgeCounts,
      absOutputDir
    };
  }

  // Register Custom Tools
  pi.registerTool({
    name: "ieee_parse_pdf",
    label: "IEEE Parse PDF",
    description: "Parses an IEEE standard PDF to extract structured headings, paragraphs, lists, and tables, mines compliance rules, and constructs a semantic relation Knowledge Graph.",
    parameters: Type.Object({
      pdf_path: Type.String({ description: "Relative or absolute path to the IEEE PDF standard file" }),
      output_dir: Type.Optional(Type.String({ description: "Relative path to save parsed outputs (default: './output_ieee_parser')" }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const outDir = params.output_dir || "./output_ieee_parser";
      onUpdate?.({ content: [{ type: "text", text: "Starting IEEE standards parsing pipeline..." }], details: {} });

      try {
        const results = await runPipeline(params.pdf_path, outDir, ctx);
        const nodeSummary = Object.entries(results.nodes).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
        const edgeSummary = Object.entries(results.edges).map(([k, v]) => `  - ${k}: ${v}`).join('\n');

        const summaryText = `IEEE standards parsing completed successfully!
Outputs saved to: ${results.absOutputDir}
Parsed ${results.blocksCount} layout blocks and mined ${results.rulesCount} compliance requirements.

Knowledge Graph Constructed:
Nodes:
${nodeSummary}
Edges:
${edgeSummary}`;

        return {
          content: [{ type: "text", text: summaryText }],
          details: { ...results }
        };
      } catch (err: any) {
        throw new Error(`IEEE Parser Pipeline failed: ${err.message}`);
      }
    }
  });

  pi.registerTool({
    name: "ieee_audit_query",
    label: "IEEE Audit Query",
    description: "Queries the active Knowledge Graph by section number, requirement ID, or technical term, and compiles an expert Systems Architect audit payload ready for analysis.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query: requirement ID (e.g. 'REQ-001'), term (e.g. 'heartbeat'), or section (e.g. '2.0')" }),
      output_dir: Type.Optional(Type.String({ description: "Directory to load the knowledge graph from if not in memory (default: './output_ieee_parser')" }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      let graph = activeGraph;

      if (!graph) {
        const searchDir = params.output_dir || lastOutputDir;
        const resolvedGraphPath = resolve(ctx.cwd, join(searchDir, "knowledge_graph.json"));
        if (existsSync(resolvedGraphPath)) {
          try {
            graph = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
            activeGraph = graph;
            lastOutputDir = searchDir;
          } catch {
            throw new Error(`Failed to load knowledge graph from ${resolvedGraphPath}`);
          }
        }
      }

      if (!graph) {
        throw new Error("No active Knowledge Graph found. Please run 'ieee_parse_pdf' first.");
      }

      const auditor = new RequirementAuditor(graph);
      const payload = auditor.generateAuditPayload(params.query);

      return {
        content: [{ type: "text", text: payload }],
        details: { query: params.query }
      };
    }
  });

  // Register Slash Commands
  pi.registerCommand("ieee-parse", {
    description: "Run the IEEE standards parsing pipeline on a PDF file",
    handler: async (args, ctx) => {
      const parts = args ? args.split(/\s+/) : [];
      if (parts.length === 0 || !parts[0]) {
        ctx.ui.notify("Usage: /ieee-parse <pdf_path> [output_dir]", "warning");
        return;
      }

      const pdfPath = parts[0];
      const outputDir = parts[1] || "./output_ieee_parser";

      ctx.ui.setStatus("ieee-parser", "Parsing PDF standards...");
      ctx.ui.notify(`Starting PDF parse for: ${pdfPath}`, "info");

      try {
        const results = await runPipeline(pdfPath, outputDir, ctx);
        ctx.ui.setStatus("ieee-parser", undefined); // Clear status
        ctx.ui.notify(`Parse successful! Saved outputs to ${outputDir}`, "info");

        const summary = `Parsed ${results.blocksCount} layout blocks, mined ${results.rulesCount} compliance rules, created ${Object.keys(results.nodes).length} node types.`;
        ctx.ui.notify(summary, "info");
      } catch (err: any) {
        ctx.ui.setStatus("ieee-parser", undefined);
        ctx.ui.notify(`IEEE Parser Error: ${err.message}`, "error");
      }
    }
  });

  pi.registerCommand("ieee-audit", {
    description: "Generate an audit payload for a requirement ID, term, or section",
    handler: async (args, ctx) => {
      const parts = args ? args.split(/\s+/) : [];
      if (parts.length === 0 || !parts[0]) {
        ctx.ui.notify("Usage: /ieee-audit <query> [output_dir]", "warning");
        return;
      }

      const query = parts[0];
      const searchDir = parts[1] || lastOutputDir;

      let graph = activeGraph;
      if (!graph) {
        const resolvedGraphPath = resolve(ctx.cwd, join(searchDir, "knowledge_graph.json"));
        if (existsSync(resolvedGraphPath)) {
          try {
            graph = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
            activeGraph = graph;
            lastOutputDir = searchDir;
          } catch {
            ctx.ui.notify(`Failed to load knowledge graph from: ${resolvedGraphPath}`, "error");
            return;
          }
        }
      }

      if (!graph) {
        ctx.ui.notify("No active Knowledge Graph. Run '/ieee-parse <pdf_path>' first.", "warning");
        return;
      }

      try {
        const auditor = new RequirementAuditor(graph);
        const payload = auditor.generateAuditPayload(query);

        const safeQueryName = query.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const auditFileName = `audit_payload_${safeQueryName}.md`;
        const destPath = join(searchDir, auditFileName);
        const absDestPath = resolve(ctx.cwd, destPath);

        writeFileSync(absDestPath, payload, "utf8");
        ctx.ui.notify(`Saved audit payload to: ${destPath}`, "info");
      } catch (err: any) {
        ctx.ui.notify(`IEEE Audit Error: ${err.message}`, "error");
      }
    }
  });
}
