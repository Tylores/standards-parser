import { PDFParser, buildHierarchyTree, treeToMarkdown } from './dist/parser.js';
import { RuleMiner } from './dist/ruleMiner.js';
import { SemanticLinker } from './dist/semanticLinker.js';
import { RequirementAuditor } from './dist/auditing.js';
import { detectDomainPreset, getDomainConfig } from './dist/presets.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

async function test() {
  const pdfPath = '/home/slay216/phd-dev/sources/Slay and Bass - 2021 - An Energy Service Interface for Distributed Energy Resources.pdf';
  const outputDir = './output_generic_parser';

  console.log('--- STEP 1: INITIAL PASS FOR DOMAIN AUTO-DETECTION ---');
  const initialParser = new PDFParser(pdfPath);
  const sampleText = await initialParser.getSampleText();
  const detectedPreset = detectDomainPreset(sampleText);
  console.log('Auto-detected preset:', detectedPreset);

  const domainConfig = getDomainConfig(detectedPreset, {
    additionalDomainInfo: "Target system: local distribution grid with microgrids and DER management."
  });
  console.log('Using Curated Terms Count:', Object.keys(domainConfig.curatedTerms).length);

  console.log('--- STEP 2: PARSING PDF WITH DOMAIN HEADERS ---');
  const parser = new PDFParser(pdfPath, domainConfig.cleanHeaders);
  const blocks = await parser.parse();
  console.log('Parsed blocks count:', blocks.length);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'blocks.json'), JSON.stringify(blocks, null, 2), 'utf8');

  const tree = buildHierarchyTree(blocks);
  writeFileSync(join(outputDir, 'tree.json'), JSON.stringify(tree, null, 2), 'utf8');

  const md = treeToMarkdown(tree);
  writeFileSync(join(outputDir, 'document_cleaned.md'), md, 'utf8');
  console.log('Cleaned Markdown generated, length:', md.length);

  console.log('--- STEP 3: MINING RULES ---');
  const miner = new RuleMiner();
  const ledger = miner.mineRules(blocks);
  console.log('Mined rules count:', ledger.length);
  writeFileSync(join(outputDir, 'ledger.json'), JSON.stringify(ledger, null, 2), 'utf8');

  console.log('--- STEP 4: SEMANTIC LINKING WITH DOMAIN TERMS ---');
  const linker = new SemanticLinker(20, {
    curatedTerms: domainConfig.curatedTerms,
    stopwords: domainConfig.stopwords
  });
  const kg = linker.buildKnowledgeGraph(ledger, blocks);
  console.log('Nodes count:', kg.nodes.length);
  console.log('Edges count:', kg.edges.length);
  writeFileSync(join(outputDir, 'knowledge_graph.json'), JSON.stringify(kg, null, 2), 'utf8');

  console.log('--- STEP 5: FLEXIBLE TF-IDF AUDITING (GENERAL QUERY) ---');
  const auditor = new RequirementAuditor(kg, domainConfig);

  // Let's test a general query idea (not an exact ID match)
  const generalQuery = 'how is communication latency or timeout handled';
  console.log(`Executing flexible audit search for: "${generalQuery}"`);
  
  const payload = auditor.generateAuditPayload(generalQuery);
  writeFileSync(join(outputDir, `audit_payload_general_query.md`), payload, 'utf8');
  console.log('Audit payload generated for general query, length:', payload.length);
  console.log('\n--- SUCCESS! ALL PIPELINE STEPS COMPLETED ---');
}

test().catch(console.error);
