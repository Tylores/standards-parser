import { normalizeSection } from './parser.js';
import { askLLM } from './llm.js';
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
export const CURATED_TERMS = {
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
export class SemanticLinker {
    topNTerms;
    curatedTerms;
    stopwords;
    constructor(topNTerms = 20, config) {
        this.topNTerms = topNTerms;
        this.curatedTerms = config?.curatedTerms || CURATED_TERMS;
        this.stopwords = config?.stopwords ? new Set(config.stopwords) : STOPWORDS;
    }
    buildKnowledgeGraph(ruleLedger, blocks) {
        const nodes = [];
        const edges = [];
        const insertedNodeIds = new Set();
        // 1. Identify Section Titles
        const sectionTitles = {};
        for (const block of blocks) {
            if (block.type === "heading") {
                sectionTitles[normalizeSection(block.section_number)] = block.heading_context[block.heading_context.length - 1];
            }
        }
        // 2. Extract Terms (curated + dynamic high-frequency terms)
        const extractedTerms = this.extractTerms(ruleLedger);
        // 3. Create Term Nodes
        const termPatterns = {};
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
            }
            else {
                termPatterns[term] = new RegExp(`\\b${this.escapeRegExp(term)}s?\\b`, 'i');
            }
        }
        // 4. Create Section Nodes and structural parent-child CONTAINS Edges
        const sectionsToCreate = new Set();
        for (const block of blocks) {
            if (block.section_number)
                sectionsToCreate.add(normalizeSection(block.section_number));
            for (const parent of block.parent_hierarchy || []) {
                if (parent)
                    sectionsToCreate.add(normalizeSection(parent));
            }
        }
        for (const rule of ruleLedger) {
            if (rule.section_number)
                sectionsToCreate.add(normalizeSection(rule.section_number));
            for (const parent of rule.parent_hierarchy || []) {
                if (parent)
                    sectionsToCreate.add(normalizeSection(parent));
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
                    if (aNum !== bNum)
                        return aNum - bNum;
                }
                else if (aVal !== bVal) {
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
        const termToReqs = {};
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
            // Requirement -> REFERENCES/CONSTRAINS/RECOMMENDS -> Term Edges
            const reqText = rule.text;
            for (const [term, pattern] of Object.entries(termPatterns)) {
                pattern.lastIndex = 0; // reset
                if (pattern.test(reqText)) {
                    const termId = `TERM-${term}`;
                    let edgeType = "REFERENCES";
                    if (rule.constraint_type === "Mandatory" || rule.constraint_type === "Prohibition") {
                        edgeType = "CONSTRAINS";
                    }
                    else if (rule.constraint_type === "Recommendation") {
                        edgeType = "RECOMMENDS";
                    }
                    else if (rule.constraint_type === "Permission") {
                        edgeType = "PERMITS";
                    }
                    edges.push({
                        source: reqId,
                        target: termId,
                        type: edgeType,
                        properties: {
                            context: "text_mention"
                        }
                    });
                    termToReqs[term].push(rule);
                }
            }
            // Requirement -> REFERENCES/IMPLEMENTS/DEPENDS_ON -> Section Edges (explicit references like "refer to Section 4.2")
            localSectionRefRegex.lastIndex = 0;
            let secMatch;
            while ((secMatch = localSectionRefRegex.exec(reqText)) !== null) {
                const refSec = normalizeSection(secMatch[1]);
                const refSecId = `SEC-${refSec}`;
                if (insertedNodeIds.has(refSecId)) {
                    const lowerText = reqText.toLowerCase();
                    let edgeType = "REFERENCES";
                    if (/\b(comply|conform|implement|according to|defined in)\b/i.test(lowerText)) {
                        edgeType = "IMPLEMENTS";
                    }
                    else if (/\b(require|depend|prerequisite|rely|relies)\b/i.test(lowerText)) {
                        edgeType = "DEPENDS_ON";
                    }
                    edges.push({
                        source: reqId,
                        target: refSecId,
                        type: edgeType,
                        properties: {
                            context: "explicit_section_ref"
                        }
                    });
                }
            }
            // Requirement -> REFERENCES/DEPENDS_ON/SUPERSEDES -> Requirement Edges (explicit references like "REQ-002")
            localReqRefRegex.lastIndex = 0;
            let reqMatch;
            while ((reqMatch = localReqRefRegex.exec(reqText)) !== null) {
                const refReq = reqMatch[1];
                if (refReq !== reqId) { // Avoid self-referencing
                    const lowerText = reqText.toLowerCase();
                    let edgeType = "REFERENCES";
                    if (/\b(depend|require|prerequisite|conditional|rely|relies)\b/i.test(lowerText)) {
                        edgeType = "DEPENDS_ON";
                    }
                    else if (/\b(supersede|replace|obsolete|deprecated)\b/i.test(lowerText)) {
                        edgeType = "SUPERSEDES";
                    }
                    edges.push({
                        source: reqId,
                        target: refReq,
                        type: edgeType,
                        properties: {
                            context: "explicit_requirement_ref"
                        }
                    });
                }
            }
        }
        // 6. Detect Potential rule conflicts (CONFLICTS_WITH)
        const conflictPairs = new Set();
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
                    const isOpposing = ((t1 === "Mandatory" && t2 === "Prohibition") ||
                        (t1 === "Prohibition" && t2 === "Mandatory"));
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
    extractTerms(ruleLedger) {
        const counter = {};
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
        const finalTerms = {};
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
        const sortedTerms = {};
        Object.entries(finalTerms)
            .sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => {
            sortedTerms[k] = v;
        });
        return sortedTerms;
    }
    escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    async refineSemanticEdges(kg, ctx, signal) {
        // Filter edges to refine: Requirement -> Requirement or Requirement -> Section
        const candidateEdges = kg.edges.filter(edge => {
            const isReqSource = edge.source.startsWith("REQ-");
            const isTargetReqOrSec = edge.target.startsWith("REQ-") || edge.target.startsWith("SEC-");
            const isContainOrConflict = edge.type === "CONTAINS" || edge.type === "CONFLICTS_WITH";
            return isReqSource && isTargetReqOrSec && !isContainOrConflict;
        });
        if (candidateEdges.length === 0) {
            return kg;
        }
        // Map requirement IDs to their text for prompt context
        const reqTextMap = {};
        for (const node of kg.nodes) {
            if (node.label === "Requirement" && node.properties?.text) {
                reqTextMap[node.id] = node.properties.text;
            }
        }
        const batchSize = 15;
        const refinedTypeMap = new Map(); // key: "source|target", value: refinedType
        for (let i = 0; i < candidateEdges.length; i += batchSize) {
            if (signal?.aborted) {
                throw new Error("Semantic edge refinement aborted by user request.");
            }
            const batch = candidateEdges.slice(i, i + batchSize);
            const batchPromptEdges = batch.map(e => ({
                source: e.source,
                target: e.target,
                text: reqTextMap[e.source] || ""
            })).filter(item => item.text !== "");
            if (batchPromptEdges.length === 0)
                continue;
            const systemPrompt = `You are an expert systems engineering and compliance analyst.
Your task is to analyze relationship edges between compliance requirements and other sections or requirements, and refine their edge types based on their context sentences.

Available Edge Types:
1. "DEPENDS_ON": If the source requirement explicitly depends on, requires, relies on, or is conditional on the target section/requirement to be met.
2. "IMPLEMENTS": If the source requirement implements, conforms to, complies with, or satisfies the specifications defined in the target section/requirement.
3. "SUPERSEDES": If the source requirement replaces, deprecates, or overrides the target section/requirement.
4. "REFERENCES": If it is just a neutral reference or mention (e.g., "refer to Section 4.2", "see REQ-001") without dependency or implementation obligations.

For each edge in the input, read the provided source requirement text and determine the most appropriate refined Edge Type.
You must output a JSON array of objects, each containing:
- "source": The source requirement ID.
- "target": The target section/requirement ID.
- "refinedType": The chosen edge type ("DEPENDS_ON", "IMPLEMENTS", "SUPERSEDES", or "REFERENCES").

Respond with valid JSON ONLY. Do not wrap in markdown or backticks.`;
            const userPrompt = `Here are the edges and their context sentences to refine:\n\n${JSON.stringify(batchPromptEdges, null, 2)}`;
            try {
                const text = await askLLM({ systemPrompt, userPrompt, signal }, ctx);
                if (!text) {
                    console.warn("No LLM context/keys found or LLM failed. Skipping semantic edge refinement.");
                    break;
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
                if (Array.isArray(parsed)) {
                    for (const item of parsed) {
                        const src = item.source;
                        const tgt = item.target;
                        const refType = item.refinedType;
                        const validTypes = ["DEPENDS_ON", "IMPLEMENTS", "SUPERSEDES", "REFERENCES"];
                        if (src && tgt && validTypes.includes(refType)) {
                            refinedTypeMap.set(`${src}|${tgt}`, refType);
                        }
                    }
                }
            }
            catch (err) {
                console.error(`Failed to refine semantic edges for batch starting at index ${i}:`, err.message);
            }
        }
        // Apply refinements to the Knowledge Graph
        const refinedEdges = kg.edges.map(edge => {
            const key = `${edge.source}|${edge.target}`;
            if (refinedTypeMap.has(key)) {
                return {
                    ...edge,
                    type: refinedTypeMap.get(key)
                };
            }
            return edge;
        });
        return {
            ...kg,
            edges: refinedEdges
        };
    }
}
