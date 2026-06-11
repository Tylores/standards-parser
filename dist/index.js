import { Type } from "typebox";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PDFParser, buildHierarchyTree, treeToMarkdown } from "./parser.js";
import { RuleMiner } from "./ruleMiner.js";
import { SemanticLinker } from "./semanticLinker.js";
import { RequirementAuditor } from "./auditing.js";
import { detectDomainPreset, getDomainConfig, GENERAL_STOPWORDS, GENERIC_TEMPLATE } from "./presets.js";
import { complete } from "@earendil-works/pi-ai";
function parseArgsWithQuotes(args) {
    const matches = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    return matches ? matches.map(m => m.replace(/^['"]|['"]$/g, '')) : [];
}
async function inferDomainKnowledge(sampleText, ctx, signal) {
    const model = ctx.model || ctx.modelRegistry.getAvailable()[0] || ctx.modelRegistry.getAll()[0];
    if (!model) {
        return null;
    }
    try {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
        const apiKey = auth.ok ? auth.apiKey : undefined;
        const headers = auth.ok ? auth.headers : undefined;
        const systemPrompt = `You are an expert technical standards analyst and systems engineer.
Your task is to analyze the introductory pages of a technical standard or manual, and infer key domain knowledge to configure a compliance parser and auditor.

You must output a JSON object with the following fields:
1. "domainName": A short, clean name for the domain of this standard (e.g., "Smart Grid Communications", "Medical Device Safety", "Web Security", "General Systems Engineering").
2. "cleanHeaders": An array of strings representing running headers, footers, or standard numbers (e.g. ["IEEE Std 2030.5", "Energy Services Interface"]) that should be cleaned/ignored when parsing lines from pages. Keep them specific to this document's headers/footers.
3. "curatedTerms": An array of key domain-specific technical terms, protocols, metrics, or concepts (between 10 and 20 terms) that are critical in this standard. These will be used for keyword mapping. Examples: ["timeout", "heartbeat", "payload", "mTLS", "inverter"].
4. "roleDescription": A 1-2 sentence description of the systems architect/auditor role tailored to this domain (e.g. "Focus on ISO 26262 functional safety, hazard analysis, ASIL rating, fault tolerance...").

Response must be valid JSON ONLY. Do not wrap in markdown or backticks.`;
        const userPrompt = `Here is the sample text (first few pages) of the standard:\n\n${sampleText}`;
        const context = {
            systemPrompt,
            messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }]
        };
        const response = await complete(model, context, {
            apiKey,
            headers,
            signal
        });
        let text = "";
        for (const block of response.content) {
            if (block.type === "text") {
                text += block.text;
            }
        }
        let cleanText = text.trim();
        if (cleanText.startsWith("```json")) {
            cleanText = cleanText.substring(7);
        }
        else if (cleanText.startsWith("```")) {
            cleanText = cleanText.substring(3);
        }
        if (cleanText.endsWith("```")) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        const parsed = JSON.parse(cleanText.trim());
        if (parsed && typeof parsed === "object" && typeof parsed.domainName === "string") {
            return {
                domainName: parsed.domainName,
                cleanHeaders: Array.isArray(parsed.cleanHeaders) ? parsed.cleanHeaders : [],
                curatedTerms: Array.isArray(parsed.curatedTerms) ? parsed.curatedTerms : [],
                roleDescription: typeof parsed.roleDescription === "string" ? parsed.roleDescription : ""
            };
        }
    }
    catch (err) {
        console.error("Failed to infer domain knowledge using LLM, falling back to regex presets:", err.message);
    }
    return null;
}
export default function (pi) {
    // Reconstruct active state status on session start
    pi.on("session_start", async (_event, ctx) => {
        ctx.ui.notify("Standards PDF Parser & Auditor extension loaded!", "info");
    });
    // Helper function to run the full generic pipeline
    async function runGenericPipeline(pdfPath, outputDir, ctx, options) {
        const absPdfPath = resolve(ctx.cwd, pdfPath);
        if (!existsSync(absPdfPath)) {
            throw new Error(`Target PDF file not found at: ${pdfPath}`);
        }
        const absOutputDir = resolve(ctx.cwd, outputDir);
        mkdirSync(absOutputDir, { recursive: true });
        // Step 1: Detect standard domain preset or dynamically infer domain config
        const initialParser = new PDFParser(absPdfPath);
        let selectedDomain = options?.domain || "auto";
        let domainConfig;
        if (selectedDomain === "auto") {
            const sampleText = await initialParser.getSampleText(options?.signal);
            ctx.ui.notify("Pre-parsing PDF standard to infer domain knowledge...", "info");
            const inferred = await inferDomainKnowledge(sampleText, ctx, options?.signal);
            if (inferred) {
                ctx.ui.notify(`Successfully inferred domain: ${inferred.domainName}`, "info");
                selectedDomain = inferred.domainName;
                const curatedTermsRecord = {};
                for (const term of inferred.curatedTerms) {
                    const termClean = term.trim().toLowerCase();
                    if (!termClean)
                        continue;
                    const escaped = termClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    curatedTermsRecord[termClean] = new RegExp(`\\b${escaped}s?\\b`, 'i');
                }
                if (options?.additionalTerms) {
                    for (const [k, v] of Object.entries(options.additionalTerms)) {
                        curatedTermsRecord[k] = new RegExp(`\\b${v}s?\\b`, 'i');
                    }
                }
                const mergedStopwords = Array.from(new Set([...GENERAL_STOPWORDS, ...(options?.additionalStopwords || [])]));
                const mergedCleanHeaders = Array.from(new Set([...inferred.cleanHeaders, ...(options?.additionalCleanHeaders || [])]));
                domainConfig = {
                    name: inferred.domainName,
                    curatedTerms: curatedTermsRecord,
                    stopwords: mergedStopwords,
                    cleanHeaders: mergedCleanHeaders,
                    roleDescription: inferred.roleDescription,
                    auditTemplate: GENERIC_TEMPLATE,
                    additionalDomainInfo: options?.additionalDomainInfo
                };
            }
            else {
                ctx.ui.notify("Falling back to rule-based domain detection...", "warning");
                selectedDomain = detectDomainPreset(sampleText);
                domainConfig = getDomainConfig(selectedDomain, {
                    additionalTerms: options?.additionalTerms,
                    additionalStopwords: options?.additionalStopwords,
                    additionalCleanHeaders: options?.additionalCleanHeaders,
                    additionalDomainInfo: options?.additionalDomainInfo
                });
            }
        }
        else {
            domainConfig = getDomainConfig(selectedDomain, {
                additionalTerms: options?.additionalTerms,
                additionalStopwords: options?.additionalStopwords,
                additionalCleanHeaders: options?.additionalCleanHeaders,
                additionalDomainInfo: options?.additionalDomainInfo
            });
        }
        // Step 2: Parse PDF with custom clean headers
        const parser = new PDFParser(absPdfPath, domainConfig.cleanHeaders);
        const blocks = await parser.parse(options?.signal);
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
        // Persist path in session
        pi.appendEntry("standard-parser-state", { lastOutputDir: absOutputDir, domain: selectedDomain });
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
            output_dir: Type.Optional(Type.String({ description: "Relative or absolute path to save parsed outputs (default: './output_standard_parser')" })),
            domain: Type.Optional(Type.Union([
                Type.Literal("auto"),
                Type.Literal("generic"),
                Type.Literal("smartGrid"),
                Type.Literal("security")
            ], { description: "Domain preset ('auto', 'generic', 'smartGrid', 'security'). Default is 'auto'." })),
            additional_domain_info: Type.Optional(Type.String({ description: "Optional additional context about the standard or system architecture to include in the audit prompt." }))
        }),
        async execute(toolCallId, params, signal, onUpdate, ctx) {
            const outDir = params.output_dir || "./output_standard_parser";
            onUpdate?.({ content: [{ type: "text", text: "Starting standards parsing pipeline..." }], details: {} });
            try {
                const results = await runGenericPipeline(params.pdf_path, outDir, ctx, {
                    domain: params.domain,
                    additionalDomainInfo: params.additional_domain_info,
                    signal
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
                // Sanitize details by converting RegExp objects to string format for JSON serialization
                const serializedTerms = Object.fromEntries(Object.entries(results.domainConfig.curatedTerms).map(([k, v]) => [
                    k,
                    v instanceof RegExp ? v.source : String(v)
                ]));
                return {
                    content: [{ type: "text", text: summaryText }],
                    details: {
                        ...results,
                        domainConfig: {
                            ...results.domainConfig,
                            curatedTerms: serializedTerms
                        }
                    }
                };
            }
            catch (err) {
                return {
                    content: [{ type: "text", text: `Error: Standard Parser Pipeline failed: ${err.message}` }],
                    details: { error: err.message, success: false }
                };
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
            try {
                let searchDir = params.output_dir;
                if (!searchDir) {
                    // Find last output dir from session manager entries
                    for (const entry of ctx.sessionManager.getEntries()) {
                        if (entry.type === "custom" && entry.customType === "standard-parser-state") {
                            const data = entry.data;
                            if (data && typeof data.lastOutputDir === "string") {
                                searchDir = data.lastOutputDir;
                            }
                        }
                    }
                }
                if (!searchDir) {
                    searchDir = "./output_standard_parser";
                }
                const resolvedGraphPath = resolve(ctx.cwd, join(searchDir, "knowledge_graph.json"));
                let graph = null;
                if (existsSync(resolvedGraphPath)) {
                    try {
                        const parsed = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
                        if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
                            graph = parsed;
                        }
                    }
                    catch {
                        return {
                            content: [{ type: "text", text: `Error: Failed to load knowledge graph from ${resolvedGraphPath}` }],
                            details: { success: false }
                        };
                    }
                }
                if (!graph) {
                    return {
                        content: [{ type: "text", text: `Error: No active Knowledge Graph found in ${searchDir}. Please run 'standard_parse_pdf' first.` }],
                        details: { success: false }
                    };
                }
                const activeConfig = graph.metadata?.config;
                const auditor = new RequirementAuditor(graph, activeConfig);
                const payload = auditor.generateAuditPayload(params.query);
                return {
                    content: [{ type: "text", text: payload }],
                    details: { query: params.query, detectedDomain: graph.metadata?.detected_domain }
                };
            }
            catch (err) {
                return {
                    content: [{ type: "text", text: `Error: Standard Audit Query failed: ${err.message}` }],
                    details: { error: err.message, success: false }
                };
            }
        }
    });
    // Register Generic Slash Commands
    pi.registerCommand("standard-parse", {
        description: "Run the standards parsing pipeline on a PDF file",
        handler: async (args, ctx) => {
            const parts = args ? parseArgsWithQuotes(args) : [];
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
            const parts = parseArgsWithQuotes(args);
            const query = parts[0];
            let searchDir = parts[1];
            if (!searchDir) {
                // Find last output dir from session manager entries
                for (const entry of ctx.sessionManager.getEntries()) {
                    if (entry.type === "custom" && entry.customType === "standard-parser-state") {
                        const data = entry.data;
                        if (data && typeof data.lastOutputDir === "string") {
                            searchDir = data.lastOutputDir;
                        }
                    }
                }
            }
            if (!searchDir) {
                searchDir = "./output_standard_parser";
            }
            let graph = null;
            const resolvedGraphPath = resolve(ctx.cwd, join(searchDir, "knowledge_graph.json"));
            if (existsSync(resolvedGraphPath)) {
                try {
                    const parsed = JSON.parse(readFileSync(resolvedGraphPath, "utf8"));
                    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
                        graph = parsed;
                    }
                }
                catch {
                    ctx.ui.notify(`Failed to load knowledge graph from: ${resolvedGraphPath}`, "error");
                    return;
                }
            }
            if (!graph) {
                ctx.ui.notify("No active Knowledge Graph. Run '/standard-parse <pdf_path>' first.", "warning");
                return;
            }
            try {
                const activeConfig = graph.metadata?.config;
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
