import { Type } from "typebox";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PDFParser, buildHierarchyTree, treeToMarkdown } from "./parser.js";
import { RuleMiner } from "./ruleMiner.js";
import { SemanticLinker } from "./semanticLinker.js";
import { RequirementAuditor } from "./auditing.js";
import { detectDomainPreset, getDomainConfig } from "./presets.js";
export default function (pi) {
    // Closure variable to keep the active Knowledge Graph in memory
    let activeGraph = null;
    let lastOutputDir = "./output_standard_parser";
    // Reconstruct active graph from previous session entries if present
    pi.on("session_start", async (_event, ctx) => {
        ctx.ui.notify("Standards PDF Parser & Auditor extension loaded!", "info");
        for (const entry of ctx.sessionManager.getEntries()) {
            if (entry.type === "custom" && entry.customType === "standard-parser-state") {
                const data = entry.data;
                if (data && typeof data.lastOutputDir === "string") {
                    lastOutputDir = data.lastOutputDir;
                    const graphPath = join(lastOutputDir, "knowledge_graph.json");
                    const resolvedPath = resolve(ctx.cwd, graphPath);
                    if (existsSync(resolvedPath)) {
                        try {
                            activeGraph = JSON.parse(readFileSync(resolvedPath, "utf8"));
                        }
                        catch {
                            // Ignore reconstruction errors
                        }
                    }
                }
            }
        }
    });
    // Helper function to run the full generic pipeline
    async function runGenericPipeline(pdfPath, outputDir, ctx, options) {
        const absPdfPath = resolve(ctx.cwd, pdfPath);
        if (!existsSync(absPdfPath)) {
            throw new Error(`Target PDF file not found at: ${pdfPath}`);
        }
        const absOutputDir = resolve(ctx.cwd, outputDir);
        mkdirSync(absOutputDir, { recursive: true });
        // Step 1: Detect standard domain preset if set to "auto"
        const initialParser = new PDFParser(absPdfPath);
        let selectedDomain = options?.domain || "auto";
        if (selectedDomain === "auto") {
            const sampleText = await initialParser.getSampleText();
            selectedDomain = detectDomainPreset(sampleText);
        }
        const domainConfig = getDomainConfig(selectedDomain, {
            additionalTerms: options?.additionalTerms,
            additionalStopwords: options?.additionalStopwords,
            additionalCleanHeaders: options?.additionalCleanHeaders,
            additionalDomainInfo: options?.additionalDomainInfo
        });
        // Step 2: Parse PDF with custom clean headers
        const parser = new PDFParser(absPdfPath, domainConfig.cleanHeaders);
        const blocks = await parser.parse();
        const blocksPath = join(absOutputDir, "blocks.json");
        writeFileSync(blocksPath, JSON.stringify(blocks, null, 2), "utf8");
        const tree = buildHierarchyTree(blocks);
        const treePath = join(absOutputDir, "tree.json");
        writeFileSync(treePath, JSON.stringify(tree, null, 2), "utf8");
        const mdContent = treeToMarkdown(tree);
        const markdownPath = join(absOutputDir, "document_cleaned.md");
        writeFileSync(markdownPath, mdContent, "utf8");
        // Step 3: Mine Rules
        const miner = new RuleMiner();
        const ruleLedger = miner.mineRules(blocks);
        const ledgerPath = join(absOutputDir, "ledger.json");
        writeFileSync(ledgerPath, JSON.stringify(ruleLedger, null, 2), "utf8");
        // Step 4: Semantic Linker & Knowledge Graph
        const linker = new SemanticLinker(20, {
            curatedTerms: domainConfig.curatedTerms,
            stopwords: domainConfig.stopwords
        });
        const kg = linker.buildKnowledgeGraph(ruleLedger, blocks);
        // Save metadata inside knowledge graph JSON
        kg.metadata = {
            detected_domain: selectedDomain,
            config: {
                name: domainConfig.name,
                roleDescription: domainConfig.roleDescription,
                stopwords: domainConfig.stopwords,
                additionalDomainInfo: domainConfig.additionalDomainInfo,
                auditTemplate: domainConfig.auditTemplate
            }
        };
        const graphPath = join(absOutputDir, "knowledge_graph.json");
        writeFileSync(graphPath, JSON.stringify(kg, null, 2), "utf8");
        // Update in-memory state
        activeGraph = kg;
        lastOutputDir = outputDir;
        // Persist path in session
        pi.appendEntry("standard-parser-state", { lastOutputDir, domain: selectedDomain });
        // Node & Edge Counts
        const nodeCounts = {};
        for (const node of kg.nodes) {
            nodeCounts[node.label] = (nodeCounts[node.label] || 0) + 1;
        }
        const edgeCounts = {};
        for (const edge of kg.edges) {
            edgeCounts[edge.type] = (edgeCounts[edge.type] || 0) + 1;
        }
        return {
            blocksCount: blocks.length,
            rulesCount: ruleLedger.length,
            nodes: nodeCounts,
            edges: edgeCounts,
            absOutputDir,
            detectedDomain: selectedDomain,
            domainConfig
        };
    }
    // Register Custom Tools
    pi.registerTool({
        name: "standard_parse_pdf",
        label: "Standard Parse PDF",
        description: "Parses any standards PDF document to extract layout blocks, mines rules/requirements, automatically detects the standard type, and constructs a semantic Knowledge Graph.",
        parameters: Type.Object({
            pdf_path: Type.String({ description: "Relative or absolute path to the PDF standard file" }),
            output_dir: Type.Optional(Type.String({ description: "Relative path to save parsed outputs (default: './output_standard_parser')" })),
            domain: Type.Optional(Type.String({ description: "Domain preset ('auto', 'generic', 'smartGrid', 'security'). Default is 'auto'." })),
            additional_domain_info: Type.Optional(Type.String({ description: "Optional additional context about the standard or system architecture to include in the audit prompt." }))
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
            const outDir = params.output_dir || "./output_standard_parser";
            onUpdate?.({ content: [{ type: "text", text: "Starting standards parsing pipeline..." }], details: {} });
            try {
                const results = await runGenericPipeline(params.pdf_path, outDir, ctx, {
                    domain: params.domain,
                    additionalDomainInfo: params.additional_domain_info
                });
                const nodeSummary = Object.entries(results.nodes).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
                const edgeSummary = Object.entries(results.edges).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
                const summaryText = `Standards parsing completed successfully!
Detected Domain: ${results.detectedDomain.toUpperCase()}
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
            }
            catch (err) {
                throw new Error(`Standard Parser Pipeline failed: ${err.message}`);
            }
        }
    });
    pi.registerTool({
        name: "standard_audit_query",
        label: "Standard Audit Query",
        description: "Queries the active Knowledge Graph using exact IDs or a flexible TF-IDF keyword search (general ideas), compiling an expert audit payload ready for LLM analysis.",
        parameters: Type.Object({
            query: Type.String({ description: "Search query: requirement ID (e.g. 'REQ-001'), section (e.g. '2.0'), term (e.g. 'security'), or a general idea (e.g. 'transmission latency issues')" }),
            output_dir: Type.Optional(Type.String({ description: "Directory to load the knowledge graph from if not in memory (default: './output_standard_parser')" }))
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
            let graph = activeGraph;
            let activeConfig = graph?.metadata?.config;
            if (!graph) {
                const searchDir = params.output_dir || lastOutputDir;
                const resolvedGraphPath = resolve(ctx.cwd, join(searchDir, "knowledge_graph.json"));
                if (existsSync(resolvedGraphPath)) {
                    try {
                        graph = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
                        activeGraph = graph;
                        lastOutputDir = searchDir;
                        activeConfig = graph?.metadata?.config;
                    }
                    catch {
                        throw new Error(`Failed to load knowledge graph from ${resolvedGraphPath}`);
                    }
                }
            }
            if (!graph) {
                throw new Error("No active Knowledge Graph found. Please run 'standard_parse_pdf' first.");
            }
            const auditor = new RequirementAuditor(graph, activeConfig);
            const payload = auditor.generateAuditPayload(params.query);
            return {
                content: [{ type: "text", text: payload }],
                details: { query: params.query, detectedDomain: graph?.metadata?.detected_domain }
            };
        }
    });
    // Register Generic Slash Commands
    pi.registerCommand("standard-parse", {
        description: "Run the standards parsing pipeline on a PDF file",
        handler: async (args, ctx) => {
            const parts = args ? args.split(/\s+/) : [];
            if (parts.length === 0 || !parts[0]) {
                ctx.ui.notify("Usage: /standard-parse <pdf_path> [output_dir] [domain]", "warning");
                return;
            }
            const pdfPath = parts[0];
            const outputDir = parts[1] || "./output_standard_parser";
            const domain = (parts[2] || "auto");
            ctx.ui.setStatus("standard-parser", "Parsing PDF standards...");
            ctx.ui.notify(`Starting PDF parse for: ${pdfPath}`, "info");
            try {
                const results = await runGenericPipeline(pdfPath, outputDir, ctx, { domain });
                ctx.ui.setStatus("standard-parser", undefined);
                ctx.ui.notify(`Parse successful! Auto-detected domain: ${results.detectedDomain.toUpperCase()}`, "info");
                const summary = `Parsed ${results.blocksCount} layout blocks, mined ${results.rulesCount} compliance rules. Saved outputs to ${outputDir}`;
                ctx.ui.notify(summary, "info");
            }
            catch (err) {
                ctx.ui.setStatus("standard-parser", undefined);
                ctx.ui.notify(`Standard Parser Error: ${err.message}`, "error");
            }
        }
    });
    pi.registerCommand("standard-audit", {
        description: "Generate an audit payload using flexible query searching",
        handler: async (args, ctx) => {
            if (!args) {
                ctx.ui.notify("Usage: /standard-audit <query_or_idea> [output_dir]", "warning");
                return;
            }
            const parts = args.split(/\s+/);
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
                    }
                    catch {
                        ctx.ui.notify(`Failed to load knowledge graph from: ${resolvedGraphPath}`, "error");
                        return;
                    }
                }
            }
            if (!graph) {
                ctx.ui.notify("No active Knowledge Graph. Run '/standard-parse <pdf_path>' first.", "warning");
                return;
            }
            try {
                const activeConfig = graph?.metadata?.config;
                const auditor = new RequirementAuditor(graph, activeConfig);
                const payload = auditor.generateAuditPayload(query);
                const safeQueryName = query.replace(/[^a-zA-Z0-9_\-]/g, "_");
                const auditFileName = `audit_payload_${safeQueryName}.md`;
                const destPath = join(searchDir, auditFileName);
                const absDestPath = resolve(ctx.cwd, destPath);
                writeFileSync(absDestPath, payload, "utf8");
                ctx.ui.notify(`Saved audit payload to: ${destPath}`, "info");
            }
            catch (err) {
                ctx.ui.notify(`Standard Audit Error: ${err.message}`, "error");
            }
        }
    });
}
