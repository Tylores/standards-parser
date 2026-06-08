# IEEE Standards Parsing & Compliance Linker Pipeline (Pi Agent Extension)

A production-ready, modular TypeScript tool and Pi Agent extension for parsing dense IEEE technical standard PDFs, mining compliance requirements, extracting terminology concepts, compiling Knowledge Graph representations, and generating context-rich prompt payloads for LLM-driven compliance audits.

This package is designed to be loaded directly by Pi agents as an extension, providing them with semantic search, standard parsing, and structured engineering critique capabilities.

---

## 1. Pi Agent Extension Integration

This module is registered as a Pi package. When loaded by a Pi Agent, it automatically registers custom tools and slash commands.

### Registered Tools

- **`ieee_parse_pdf`**
  - **Description**: Parses an IEEE standard PDF to extract structured headings, paragraphs, lists, and tables, mines compliance rules, and constructs a semantic relation Knowledge Graph.
  - **Parameters**:
    - `pdf_path` (string, required): Relative or absolute path to the IEEE PDF standard file.
    - `output_dir` (string, optional): Folder path to save parsed outputs (default: `./output_ieee_parser`).

- **`ieee_audit_query`**
  - **Description**: Queries the active Knowledge Graph by section number, requirement ID, or technical term, and compiles an expert Systems Architect audit payload ready for analysis.
  - **Parameters**:
    - `query` (string, required): Search query: requirement ID (e.g. `REQ-001`), term (e.g. `heartbeat`), or section (e.g. `2.0`).
    - `output_dir` (string, optional): Folder path to load the knowledge graph from if not in-memory (default: `./output_ieee_parser`).

### Registered Slash Commands

- **`/ieee-parse <pdf_path> [output_dir]`**
  - Triggers the PDF parser, rule mining, and knowledge graph construction pipeline.
- **`/ieee-audit <query> [output_dir]`**
  - Queries the knowledge graph and outputs an LLM critique markdown payload (e.g., `audit_payload_<query>.md`) to the output folder.

---

## 2. Programmatic Usage (TypeScript / JavaScript)

You can also import and compose the pipeline components programmatically in your own TypeScript or Node.js scripts:

```typescript
import { PDFParser, buildHierarchyTree, treeToMarkdown } from './src/parser.js';
import { RuleMiner } from './src/ruleMiner.js';
import { SemanticLinker } from './src/semanticLinker.js';
import { RequirementAuditor } from './src/auditing.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

async function runPipeline() {
  const pdfPath = 'path/to/standard.pdf';
  const outputDir = './output_ieee_parser';

  // 1. Parse PDF to flat layout blocks
  const parser = new PDFParser(pdfPath);
  const blocks = await parser.parse();

  // 2. Reconstruct section tree hierarchy
  const tree = buildHierarchyTree(blocks);

  // 3. Mine deterministic compliance rules
  const miner = new RuleMiner();
  const ledger = miner.mineRules(blocks);

  // 4. Construct Semantic Knowledge Graph
  const linker = new SemanticLinker();
  const kg = linker.buildKnowledgeGraph(ledger, blocks);

  // 5. Generate LLM Audit prompt payload
  const auditor = new RequirementAuditor(kg);
  const payload = auditor.generateAuditPayload('REQ-001');

  // Save artifacts
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'knowledge_graph.json'), JSON.stringify(kg, null, 2));
  writeFileSync(join(outputDir, 'audit_payload_REQ-001.md'), payload);
}

runPipeline().catch(console.error);
```

---

## 3. Output Pipeline Artifacts

By default, all pipeline assets are written to `./output_ieee_parser`:

1. **`blocks.json`**: Flat list of extracted, cleaned text layout blocks (headings, paragraphs, lists, tables).
2. **`tree.json`**: Nested structural outlines showing document section parent-child hierarchy.
3. **`document_cleaned.md`**: Fully cleaned and reconstructed document text in Markdown.
4. **`ledger.json`**: Compliance requirements ledger containing IDs, constraint classifications, and hierarchies.
5. **`knowledge_graph.json`**: Standardized JSON containing graph nodes (`Requirement`, `Section`, `Term`) and edges (`CONTAINS`, `REFERENCES`, `CONFLICTS_WITH`).
6. **`audit_payload_<query>.md`**: Formatted prompt containing the queried target along with its direct structural parents, semantically linked rules, referenced terms, flagged contradictions, and system critique instructions.

---

## 4. Codebase Reference

If you are an AI developer or agent extending or working with this codebase, please follow these guidelines:

### File and Class Maps
- **Extension Registry**: [src/index.ts](file:///home/slay216/phd-dev/ieee_parser/src/index.ts) is the main entry point that registers the Pi tools and slash commands.
- **Parser Logic**: Adjust headers/footers cleaning patterns or block merging rules in [src/parser.ts](file:///home/slay216/phd-dev/ieee_parser/src/parser.ts). Key exports: [PDFParser](file:///home/slay216/phd-dev/ieee_parser/src/parser.ts#L85), [buildHierarchyTree](file:///home/slay216/phd-dev/ieee_parser/src/parser.ts#L14), and [treeToMarkdown](file:///home/slay216/phd-dev/ieee_parser/src/parser.ts).
- **Rule Extraction Patterns**: Modifying rule keywords (e.g., standard RFC conformance terms) or classification is done in [src/ruleMiner.ts](file:///home/slay216/phd-dev/ieee_parser/src/ruleMiner.ts). Key exports: [RuleMiner](file:///home/slay216/phd-dev/ieee_parser/src/ruleMiner.ts#L87) and [Rule](file:///home/slay216/phd-dev/ieee_parser/src/ruleMiner.ts#L75).
- **Concept & Stopwords Definitions**: Smart grid terms and dynamic terminology configuration are managed in [src/semanticLinker.ts](file:///home/slay216/phd-dev/ieee_parser/src/semanticLinker.ts). Key exports: [SemanticLinker](file:///home/slay216/phd-dev/ieee_parser/src/semanticLinker.ts#L76) and [KnowledgeGraph](file:///home/slay216/phd-dev/ieee_parser/src/semanticLinker.ts#L71).
- **System Prompt Templates**: The LLM audit critique prompt structure and evaluation instructions are defined in [src/auditing.ts](file:///home/slay216/phd-dev/ieee_parser/src/auditing.ts). Key exports: [RequirementAuditor](file:///home/slay216/phd-dev/ieee_parser/src/auditing.ts#L63).

### Development and Compilation
To compile the TypeScript source files, run:
```bash
npm run build # if configured, or run npx tsc
```
This will generate JavaScript files with declarations in the `./dist` folder as configured in [tsconfig.json](file:///home/slay216/phd-dev/ieee_parser/tsconfig.json).

To run a pipeline test:
```bash
node test_pipeline.js
```
