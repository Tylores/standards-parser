# Generic Standards Parsing & Compliance Linker Pipeline (Pi Agent Extension)

A production-ready, modular TypeScript tool and Pi Agent extension for parsing dense technical standard PDFs, mining compliance requirements, extracting terminology concepts, compiling Knowledge Graph representations, and generating context-rich prompt payloads for LLM-driven compliance audits.

This package is designed to be loaded directly by Pi agents as an extension, providing them with semantic search, standard parsing, and structured engineering critique capabilities across **any type of standards document** (IEEE, ISO, RFC, etc.) with automatic standard detection.

---

## 1. Installation

To install this extension in your Pi Agent workspace, run:

```bash
pi install git:github.com/Tylores/standards-parser
```

---

## 2. Model Context Protocol (MCP) Server Integration

This parser is fully compatible with the **Model Context Protocol (MCP)**. This allows it to be loaded dynamically as an MCP Server by any agent harness that supports the protocol, including:
- **Claude Code**
- **Cursor**
- **Windsurf**
- **Antigravity / Gemini CLI**
- **Cline / Roo Code**
- **OpenCode**

### 1. Build the Server
Ensure you build the TypeScript source before starting the MCP server:
```bash
npm run build
```

### 2. Configure in Agent Harnesses

#### Claude Code
Add the tool to your `claude_config.json` (usually located at `~/.claude/config.json`):
```json
{
  "mcpServers": {
    "standards-parser": {
      "command": "node",
      "args": ["/absolute/path/to/standards-parser/dist/mcp-server.js"]
    }
  }
}
```
Or run the CLI command:
```bash
claude mcp add standards-parser node /absolute/path/to/standards-parser/dist/mcp-server.js
```

#### GitHub Copilot CLI
Add the server to your `~/.copilot/mcp-config.json` configuration file:
```json
{
  "mcpServers": {
    "standards-parser": {
      "command": "node",
      "args": ["/absolute/path/to/standards-parser/dist/mcp-server.js"]
    }
  }
}
```
Or run `/mcp add` interactively within a Copilot CLI session and follow the prompts.

#### OpenCode CLI
Add the server to your `opencode.json` (either global `~/.config/opencode/opencode.json` or project-specific) in the `mcp` section:
```json
{
  "mcp": {
    "standards-parser": {
      "type": "local",
      "command": ["node", "/absolute/path/to/standards-parser/dist/mcp-server.js"],
      "enabled": true
    }
  }
}
```
Or run `opencode mcp add` in your terminal for an interactive configuration prompt.

#### Antigravity CLI
Add the server under `mcpServers` in your Antigravity configuration file (typically `~/.config/antigravity/mcp.json` or `~/.antigravity/config.json`):
```json
{
  "mcpServers": {
    "standards-parser": {
      "command": "node",
      "args": ["/absolute/path/to/standards-parser/dist/mcp-server.js"]
    }
  }
}
```

#### Cursor / Windsurf / Cline / Roo Code
Configure it visually in the GUI:
- **Type**: `stdio`
- **Name**: `standards-parser`
- **Command**: `node`
- **Arguments**: `/absolute/path/to/standards-parser/dist/mcp-server.js`

### 3. LLM Configuration (Optional)
When running outside the Pi agent environment, the parser can still use an LLM for implicit rule mining and semantic edge refinement. It will detect and use any of the following environment variables:
- `GEMINI_API_KEY` (Gemini API)
- `OPENAI_API_KEY` (OpenAI API)
- `ANTHROPIC_API_KEY` (Anthropic API)

If no keys are found in the environment, the parser will gracefully fall back to rules-based and regex-based operations, ensuring the core parser, terminology extraction, vis.js graph generation, and TF-IDF auditing still run at 100% functionality without failing.

---

## 3. Pi Agent Extension Integration

This module is registered as a Pi package. When loaded by a Pi Agent, it automatically registers custom tools and slash commands.

### Registered Tools

#### **`standard_parse_pdf`**
- **Description**: Parses any standards PDF document to extract layout blocks, mines rules/requirements (using a hybrid regex and LLM-based pass for implicit requirements), automatically detects the standard type, and constructs a semantic Knowledge Graph.
- **Parameters**:
  - `pdf_path` (string, required): Relative or absolute path to the PDF standard file.
  - `output_dir` (string, optional): Folder path to save parsed outputs (default: `./output_standard_parser`).
  - `domain` (string, optional): Domain preset (`'auto'`, `'generic'`, `'smartGrid'`, `'security'`). Default is `'auto'`.
  - `additional_domain_info` (string, optional): Optional additional context about the standard or system architecture to include in the audit prompt.

#### **`standard_audit_query`**
- **Description**: Queries the active Knowledge Graph using exact IDs or a flexible TF-IDF keyword search (general ideas), compiling an expert audit payload ready for LLM analysis.
- **Parameters**:
  - `query` (string, required): Search query: requirement ID (e.g. `REQ-001`), section (e.g. `2.0`), term (e.g. `security`), or a general idea (e.g. `handling transmission latency`).
  - `output_dir` (string, optional): Folder path to load the knowledge graph from if not in-memory (default: `./output_standard_parser`).

### Registered Slash Commands

- **`/standard-parse <pdf_path> [output_dir] [domain]`**
  - Triggers the PDF standards parser, rule mining, and auto-detect domain pipeline.
- **`/standard-audit <query_or_idea> [output_dir]`**
  - Queries the knowledge graph using exact ID or TF-IDF matching and outputs an LLM critique markdown payload (e.g., `audit_payload_<query>.md`) to the output folder.

---

## 4. Programmatic Usage (TypeScript / JavaScript)

You can import and compose the pipeline components programmatically in your own TypeScript or Node.js scripts:

```typescript
import { PDFParser, buildHierarchyTree, treeToMarkdown } from './dist/parser.js';
import { RuleMiner } from './dist/ruleMiner.js';
import { SemanticLinker } from './dist/semanticLinker.js';
import { generateExplorerHtml } from './dist/visualizer.js';
import { RequirementAuditor } from './dist/auditing.js';
import { detectDomainPreset, getDomainConfig } from './dist/presets.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function runPipeline() {
  const pdfPath = 'path/to/standard.pdf';
  const outputDir = './output_generic_parser';

  // 1. Detect standard domain preset
  const initialParser = new PDFParser(pdfPath);
  const sampleText = await initialParser.getSampleText();
  const detectedPreset = detectDomainPreset(sampleText); // 'generic' | 'smartGrid' | 'security'

  const domainConfig = getDomainConfig(detectedPreset, {
    additionalDomainInfo: "Target system: custom secure distributed architecture."
  });

  // 2. Parse PDF to flat layout blocks
  const parser = new PDFParser(pdfPath, domainConfig.cleanHeaders);
  const blocks = await parser.parse();

  // 3. Reconstruct section tree hierarchy
  const tree = buildHierarchyTree(blocks);

  // 4. Mine compliance rules (hybrid regex + LLM)
  const miner = new RuleMiner();
  const ledger = miner.mineRules(blocks);
  // (Optional: call miner.mineImplicitRules(...) with context if LLM is available)

  // 5. Construct Semantic Knowledge Graph with dynamic preset
  const linker = new SemanticLinker(20, {
    curatedTerms: domainConfig.curatedTerms,
    stopwords: domainConfig.stopwords
  });
  let kg = linker.buildKnowledgeGraph(ledger, blocks);
  // (Optional: call linker.refineSemanticEdges(...) with context if LLM is available)

  // 6. Generate interactive visualizer HTML explorer
  const explorerHtml = generateExplorerHtml(kg);

  // 7. Generate LLM Audit prompt payload using flexible search query
  const auditor = new RequirementAuditor(kg, domainConfig);
  const payload = auditor.generateAuditPayload('handling transport security');

  // Save artifacts
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'knowledge_graph.json'), JSON.stringify(kg, null, 2), 'utf8');
  writeFileSync(join(outputDir, 'graph_explorer.html'), explorerHtml, 'utf8');
  writeFileSync(join(outputDir, 'audit_payload_general_query.md'), payload, 'utf8');
}

runPipeline().catch(console.error);
```

---

## 5. Output Pipeline Artifacts

By default, all pipeline assets are written to `./output_standard_parser`:

1. **`blocks.json`**: Flat list of extracted, cleaned text layout blocks (headings, paragraphs, lists, tables).
2. **`tree.json`**: Nested structural outlines showing document section parent-child hierarchy.
3. **`document_cleaned.md`**: Fully cleaned and reconstructed document text in Markdown.
4. **`ledger.json`**: Compliance requirements ledger containing IDs, constraint classifications, and hierarchies.
5. **`knowledge_graph.json`**: Standardized JSON containing graph nodes (`Requirement`, `Section`, `Term`), edges (`CONTAINS`, `CONFLICTS_WITH`, `CONSTRAINS`, `RECOMMENDS`, `PERMITS`, `DEPENDS_ON`, `IMPLEMENTS`, `SUPERSEDES`, `REFERENCES`), and metadata details about the active domain preset.
6. **`graph_explorer.html`**: Sleek dark-mode interactive browser visualizer utilizing Vis.js force-directed physics layout with sidebar search, filtering, and connection highlighting capabilities.
7. **`audit_payload_<query>.md`**: Formatted prompt containing the queried target along with its direct structural parents, semantically linked rules, referenced terms, flagged contradictions, custom domain details, and system critique instructions.

---

## 6. Codebase Reference

If you are an AI developer or agent extending or working with this codebase, please follow these guidelines:

### File and Class Maps
- **Extension Registry**: [src/index.ts](./src/index.ts) is the main entry point that registers the Pi tools and slash commands.
- **Domain Presets & Auto-detection**: [src/presets.ts](./src/presets.ts) defines generic, smartGrid, and security vocabularies and prompts.
- **Parser Logic**: Adjust headers/footers cleaning patterns or block merging rules in [src/parser.ts](./src/parser.ts).
- **Rule Extraction Patterns**: Modifying rule keywords or classification is done in [src/ruleMiner.ts](./src/ruleMiner.ts) (regex patterns & LLM-based implicit requirement mining).
- **Concept & Stopwords Definitions**: Curated terms and dynamic terminology configuration are managed in [src/semanticLinker.ts](./src/semanticLinker.ts) (including typed semantic edge mapping).
- **Interactive Graph Visualizer**: [src/visualizer.ts](./src/visualizer.ts) compiles the Knowledge Graph into a standalone Vis.js force-directed dark-mode web explorer.
- **System Prompt Templates & Search Ranking**: The LLM audit critique prompt structure and flexible TF-IDF query search are defined in [src/auditing.ts](./src/auditing.ts).

### Development and Compilation
To compile the TypeScript source files, run:
```bash
npx -p typescript tsc
```
This will generate JavaScript files with declarations in the `./dist` folder as configured in [tsconfig.json](./tsconfig.json).

To run the pipeline test:
```bash
npm test
```
