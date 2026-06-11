import { Block, normalizeSection } from './parser.js';
import { Rule } from './ruleMiner.js';

// List of common English stopwords to exclude from dynamic terminology extraction
export const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
  'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
  'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
  'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'll', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no',
  'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 're', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'shouldnt', 'so', 'some', 'such', 'than',
  'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they',
  'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 've',
  'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens',
  'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt',
  'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'shall', 'should',
  'may', 'must', 'can', 'could', 'would', 'shouldnt', 'mustnt', 'shallnt', 'definition', 'definitions', 'annex',
  'clause', 'section', 'paragraph', 'table', 'figure', 'document', 'documents', 'standard', 'standards', 'ieee'
]);

// Curated IEEE standard technical terms with singular/plural regex support
export const CURATED_TERMS: Record<string, RegExp> = {
  "timeout": /\btimeouts?\b/i,
  "heartbeat": /\bheartbeats?\b/i,
  "payload": /\bpayloads?\b/i,
  "register": /\bregisters?\b/i,
  "interface": /\binterfaces?\b/i,
  "device": /\bdevices?\b/i,
  "service": /\bservices?\b/i,
  "agreement": /\bagreements?\b/i,
  "protocol": /\bprotocols?\b/i,
  "client": /\bclients?\b/i,
  "server": /\bservers?\b/i,
  "security": /\bsecurity\b/i,
  "der": /\bders?\b/i,
  "voltage": /\bvoltages?\b/i,
  "frequency": /\bfrequenc(?:y|ies)\b/i,
  "power": /\bpowers?\b/i,
  "load": /\bloads?\b/i,
  "storage": /\bstorages?\b/i,
  "generation": /\bgenerations?\b/i,
  "inverter": /\binverters?\b/i,
  "connection": /\bconnections?\b/i,
  "capacity": /\bcapacities|capacity\b/i,
  "mtls": /\bmtls\b/i,
  "gateway": /\bgateways?\b/i,
  "telemetry": /\btelemetr(?:y|ies)\b/i
};

// Regex to detect explicit cross-references to other sections/clauses
export const SECTION_REF_REGEX = /\b(?:Section|Clause|Annex)\s+((?:Annex\s+[A-Z]|[A-Z]|\d+)(?:\.\d+)*)\b/gi;

// Regex to detect explicit cross-references to other requirements (e.g. "REQ-001")
export const REQ_REF_REGEX = /\b(REQ-\d+)\b/g;

export interface KGNode {
  id: string;
  label: "Term" | "Section" | "Requirement";
  properties: Record<string, any>;
}

export interface KGEdge {
  source: string;
  target: string;
  type: "CONTAINS" | "REFERENCES" | "CONFLICTS_WITH";
  properties: Record<string, any>;
}

export interface KnowledgeGraph {
  nodes: KGNode[];
  edges: KGEdge[];
  metadata?: {
    detected_domain?: string;
    config?: {
      name: string;
      roleDescription: string;
      stopwords: string[];
      additionalDomainInfo?: string;
      auditTemplate: string;
    };
  };
}

export class SemanticLinker {
  private topNTerms: number;
  private curatedTerms: Record<string, RegExp>;
  private stopwords: Set<string>;

  constructor(topNTerms = 20, config?: { curatedTerms?: Record<string, RegExp>; stopwords?: string[] }) {
    this.topNTerms = topNTerms;
    this.curatedTerms = config?.curatedTerms || CURATED_TERMS;
    this.stopwords = config?.stopwords ? new Set(config.stopwords) : STOPWORDS;
  }

  buildKnowledgeGraph(ruleLedger: Rule[], blocks: Block[]): KnowledgeGraph {
    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];
    const insertedNodeIds = new Set<string>();

    // 1. Identify Section Titles
    const sectionTitles: Record<string, string> = {};
    for (const block of blocks) {
      if (block.type === "heading") {
        sectionTitles[normalizeSection(block.section_number)] = block.heading_context[block.heading_context.length - 1];
      }
    }

    // 2. Extract Terms (curated + dynamic high-frequency terms)
    const extractedTerms = this.extractTerms(ruleLedger);

    // 3. Create Term Nodes
    const termPatterns: Record<string, RegExp> = {};
    for (const [term, freq] of Object.entries(extractedTerms)) {
      const nodeId = `TERM-${term}`;
      nodes.push({
        id: nodeId,
        label: "Term",
        properties: {
          name: term,
          frequency: freq
        }
      });
      insertedNodeIds.add(nodeId);

      // Map term string to compile patterns for matching
      if (term in this.curatedTerms) {
        termPatterns[term] = this.curatedTerms[term];
      } else {
        termPatterns[term] = new RegExp(`\\b${this.escapeRegExp(term)}s?\\b`, 'i');
      }
    }

    // 4. Create Section Nodes and structural parent-child CONTAINS Edges
    const sectionsToCreate = new Set<string>();
    for (const block of blocks) {
      if (block.section_number) sectionsToCreate.add(normalizeSection(block.section_number));
      for (const parent of block.parent_hierarchy || []) {
        if (parent) sectionsToCreate.add(normalizeSection(parent));
      }
    }
    for (const rule of ruleLedger) {
      if (rule.section_number) sectionsToCreate.add(normalizeSection(rule.section_number));
      for (const parent of rule.parent_hierarchy || []) {
        if (parent) sectionsToCreate.add(normalizeSection(parent));
      }
    }

    const sortedSections = Array.from(sectionsToCreate).sort((a, b) => {
      const cleanA = a.replace(/^Annex\s+/i, '');
      const cleanB = b.replace(/^Annex\s+/i, '');
      const aParts = cleanA.split('.');
      const bParts = cleanB.split('.');
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || "";
        const bVal = bParts[i] || "";
        const aNum = parseInt(aVal, 10);
        const bNum = parseInt(bVal, 10);
        const isANum = !isNaN(aNum);
        const isBNum = !isNaN(bNum);
        if (isANum && isBNum) {
          if (aNum !== bNum) return aNum - bNum;
        } else if (aVal !== bVal) {
          return aVal.localeCompare(bVal);
        }
      }
      return 0;
    });

    for (const sec of sortedSections) {
      if (!sec || sec === "UNKNOWN") {
        continue;
      }
      const secId = `SEC-${sec}`;
      const title = sectionTitles[sec] || `Section ${sec}`;

      nodes.push({
        id: secId,
        label: "Section",
        properties: {
          section_number: sec,
          title
        }
      });
      insertedNodeIds.add(secId);

      // Structural containment edges
      const parts = sec.split('.');
      if (parts.length > 1) {
        const parentSec = parts.slice(0, -1).join('.');
        if (sectionsToCreate.has(parentSec)) {
          edges.push({
            source: `SEC-${parentSec}`,
            target: secId,
            type: "CONTAINS",
            properties: {}
          });
        }
      }
    }

    // 5. Create Requirement Nodes and map relationship Edges
    const termToReqs: Record<string, Rule[]> = {};
    for (const term of Object.keys(termPatterns)) {
      termToReqs[term] = [];
    }

    const localSectionRefRegex = new RegExp(SECTION_REF_REGEX.source, SECTION_REF_REGEX.flags);
    const localReqRefRegex = new RegExp(REQ_REF_REGEX.source, REQ_REF_REGEX.flags);

    for (const rule of ruleLedger) {
      const reqId = rule.id;
      nodes.push({
        id: reqId,
        label: "Requirement",
        properties: {
          text: rule.text,
          constraint_type: rule.constraint_type,
          section_number: rule.section_number,
          page_number: rule.page_number
        }
      });
      insertedNodeIds.add(reqId);

      // Section -> CONTAINS -> Requirement Edge
      const secId = `SEC-${normalizeSection(rule.section_number)}`;
      if (insertedNodeIds.has(secId)) {
        edges.push({
          source: secId,
          target: reqId,
          type: "CONTAINS",
          properties: {}
        });
      }

      // Requirement -> REFERENCES -> Term Edges
      const reqText = rule.text;
      for (const [term, pattern] of Object.entries(termPatterns)) {
        pattern.lastIndex = 0; // reset
        if (pattern.test(reqText)) {
          const termId = `TERM-${term}`;
          edges.push({
            source: reqId,
            target: termId,
            type: "REFERENCES",
            properties: {
              context: "text_mention"
            }
          });
          termToReqs[term].push(rule);
        }
      }

      // Requirement -> REFERENCES -> Section Edges (explicit references like "refer to Section 4.2")
      localSectionRefRegex.lastIndex = 0;
      let secMatch;
      while ((secMatch = localSectionRefRegex.exec(reqText)) !== null) {
        const refSec = normalizeSection(secMatch[1]);
        const refSecId = `SEC-${refSec}`;
        if (insertedNodeIds.has(refSecId)) {
          edges.push({
            source: reqId,
            target: refSecId,
            type: "REFERENCES",
            properties: {
              context: "explicit_section_ref"
            }
          });
        }
      }

      // Requirement -> REFERENCES -> Requirement Edges (explicit references like "REQ-002")
      localReqRefRegex.lastIndex = 0;
      let reqMatch;
      while ((reqMatch = localReqRefRegex.exec(reqText)) !== null) {
        const refReq = reqMatch[1];
        if (refReq !== reqId) { // Avoid self-referencing
          edges.push({
            source: reqId,
            target: refReq,
            type: "REFERENCES",
            properties: {
              context: "explicit_requirement_ref"
            }
          });
        }
      }
    }

    // 6. Detect Potential rule conflicts (CONFLICTS_WITH)
    const conflictPairs = new Set<string>();
    for (const [term, reqs] of Object.entries(termToReqs)) {
      if (reqs.length < 2) {
        continue;
      }

      for (let idx1 = 0; idx1 < reqs.length; idx1++) {
        for (let idx2 = idx1 + 1; idx2 < reqs.length; idx2++) {
          const r1 = reqs[idx1];
          const r2 = reqs[idx2];

          // Check for opposing constraints
          const t1 = r1.constraint_type;
          const t2 = r2.constraint_type;
          const isOpposing = (
            (t1 === "Mandatory" && t2 === "Prohibition") ||
            (t1 === "Prohibition" && t2 === "Mandatory")
          );

          if (isOpposing) {
            const sortedIds = [r1.id, r2.id].sort();
            const pairKey = sortedIds.join('|');
            if (!conflictPairs.has(pairKey)) {
              conflictPairs.add(pairKey);
              edges.push({
                source: r1.id,
                target: r2.id,
                type: "CONFLICTS_WITH",
                properties: {
                  reason: `Opposing compliance keywords ('${t1}' vs '${t2}') referencing common concept '${term}'`,
                  shared_term: term
                }
              });
            }
          }
        }
      }
    }

    return {
      nodes,
      edges
    };
  }

  private extractTerms(ruleLedger: Rule[]): Record<string, number> {
    const counter: Record<string, number> = {};
    for (const rule of ruleLedger) {
      const text = rule.text.toLowerCase();
      const words = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
      for (const w of words) {
        if (!this.stopwords.has(w)) {
          counter[w] = (counter[w] || 0) + 1;
        }
      }
    }

    // Grab high-frequency words
    const sortedWords = Object.entries(counter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.topNTerms)
      .map(entry => entry[0]);

    // Merge curated list and dynamic list
    const finalTerms: Record<string, number> = {};
    for (const word of Object.keys(this.curatedTerms)) {
      const pattern = this.curatedTerms[word];
      let totalMatches = 0;
      for (const rule of ruleLedger) {
        pattern.lastIndex = 0;
        if (pattern.test(rule.text)) {
          totalMatches++;
        }
      }
      finalTerms[word] = totalMatches;
    }

    for (const dWord of sortedWords) {
      if (!(dWord in finalTerms)) {
        finalTerms[dWord] = counter[dWord];
      }
    }

    // Sort terms by frequency
    const sortedTerms: Record<string, number> = {};
    Object.entries(finalTerms)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => {
        sortedTerms[k] = v;
      });

    return sortedTerms;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
