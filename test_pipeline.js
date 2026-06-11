import { PDFParser, buildHierarchyTree, treeToMarkdown } from './src/parser.js';
import { RuleMiner } from './src/ruleMiner.js';
import { SemanticLinker } from './src/semanticLinker.js';
import { RequirementAuditor } from './src/auditing.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

async function test() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("Error: Missing target PDF standard file for testing.");
    console.error("Usage: node test_pipeline.js <path_to_pdf_file>");
    process.exit(1);
  }
  const outputDir = './output_ieee_parser';

  console.log('--- STEP 1: PARSING PDF ---');
  const parser = new PDFParser(pdfPath);
  const blocks = await parser.parse();
  console.log('Parsed blocks count:', blocks.length);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'blocks.json'), JSON.stringify(blocks, null, 2), 'utf8');

  const tree = buildHierarchyTree(blocks);
  writeFileSync(join(outputDir, 'tree.json'), JSON.stringify(tree, null, 2), 'utf8');

  const md = treeToMarkdown(tree);
  writeFileSync(join(outputDir, 'document_cleaned.md'), md, 'utf8');
  console.log('Cleaned Markdown generated, length:', md.length);

  console.log('--- STEP 2: MINING RULES ---');
  const miner = new RuleMiner();
  const ledger = miner.mineRules(blocks);
  console.log('Mined rules count:', ledger.length);
  writeFileSync(join(outputDir, 'ledger.json'), JSON.stringify(ledger, null, 2), 'utf8');

  console.log('--- STEP 3: SEMANTIC LINKING ---');
  const linker = new SemanticLinker();
  const kg = linker.buildKnowledgeGraph(ledger, blocks);
  console.log('Nodes count:', kg.nodes.length);
  console.log('Edges count:', kg.edges.length);
  writeFileSync(join(outputDir, 'knowledge_graph.json'), JSON.stringify(kg, null, 2), 'utf8');

  console.log('--- STEP 4: AUDITING ---');
  const auditor = new RequirementAuditor(kg);
  const payload = auditor.generateAuditPayload('REQ-001');
  writeFileSync(join(outputDir, 'audit_payload_REQ-001.md'), payload, 'utf8');
  console.log('Audit payload generated for REQ-001, length:', payload.length);
}

test().catch(console.error);
