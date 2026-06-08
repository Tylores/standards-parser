import { KnowledgeGraph, KGNode, KGEdge } from './semanticLinker.js';

export const AUDIT_PROMPT_TEMPLATE = `You are an expert Systems Architect and Senior Security Engineer specializing in smart grid communications, mTLS security, and IEEE 2030.5 / SEP 2 protocol implementation.

Your task is to audit the selected requirement(s) extracted from a dense technical standard, analyzing them for semantic consistency, ambiguity, and implementation feasibility.

================================================================================
1. TARGET REQUIREMENT(S) TO AUDIT
================================================================================
{target_requirements}

================================================================================
2. HIERARCHICAL & STRUCTURAL CONTEXT
================================================================================
{structural_context}

================================================================================
3. SEMANTICALLY & STRUCTURALLY LINKED RULES
================================================================================
{linked_rules}

================================================================================
4. KEY CONCEPTS & TERMS INVOLVED
================================================================================
{referenced_terms}

================================================================================
5. AUTOMATICALLY FLAGGED POTENTIAL CONFLICTS
================================================================================
{potential_conflicts}

================================================================================
CRITIQUE INSTRUCTIONS FOR THE LLM AUDITOR:
================================================================================
Perform a rigorous, production-grade critique covering the following areas:

1. **Ambiguity & Testability Analysis**:
   - Assess if the requirement uses vague words (e.g., "appropriate", "efficient", "rapidly") without defining quantitative metrics or ranges.
   - Determine if the requirement can be verified via automated conformance testing.

2. **Logical Consistency & Conflict Resolution**:
   - Evaluate the target requirement against the linked rules and potential conflicts.
   - Identify contradictions (e.g., a "shall" contradicting a "shall not" or "may" on the same term in a different section).
   - Pinpoint gaps or omissions in the surrounding context.

3. **Smart Grid & IEEE 2030.5 Protocol Feasibility**:
   - Discuss how this requirement affects system state machines, transaction integrity, transport security (mTLS), messaging latency, or payloads (e.g., XML/EXI structures in IEEE 2030.5).
   - Highlight potential race conditions, timing failures (timeouts, heartbeats), or security vulnerabilities introduced by this specification.

4. **Proposed Revisions**:
   - Draft a revised version of the target requirement(s) that removes all ambiguities and resolves any identified contradictions.
   - Provide concrete, deterministic, and clear language.
`;

export interface AuditContext {
  targets: KGNode[];
  linked_requirements: KGNode[];
  linked_sections: KGNode[];
  linked_terms: KGNode[];
  conflicts: KGEdge[];
}

export class RequirementAuditor {
  private kg: KnowledgeGraph;
  private nodes: Record<string, KGNode>;
  private outEdges: Record<string, KGEdge[]>;
  private inEdges: Record<string, KGEdge[]>;
  private domainConfig?: any;

  constructor(knowledgeGraph: KnowledgeGraph, domainConfig?: any) {
    this.kg = knowledgeGraph;
    this.domainConfig = domainConfig;
    this.nodes = {};
    for (const node of knowledgeGraph.nodes) {
      this.nodes[node.id] = node;
    }

    // Build index of edges for fast traversal
    this.outEdges = {};
    this.inEdges = {};
    for (const edge of knowledgeGraph.edges) {
      const src = edge.source;
      const tgt = edge.target;

      if (!this.outEdges[src]) this.outEdges[src] = [];
      this.outEdges[src].push(edge);

      if (!this.inEdges[tgt]) this.inEdges[tgt] = [];
      this.inEdges[tgt].push(edge);
    }
  }

  queryContext(query: string): AuditContext | null {
    const queryStrip = query.trim();
    let targetNodes: KGNode[] = [];

    // 1. Resolve query to exact node match if possible
    if (queryStrip in this.nodes) {
      targetNodes.push(this.nodes[queryStrip]);
    } else {
      // Try matching Term name (e.g. TERM-termname) or Section number (e.g. SEC-secnum)
      const termId = `TERM-${queryStrip.toLowerCase()}`;
      const secId = `SEC-${queryStrip}`;
      if (termId in this.nodes) {
        targetNodes.push(this.nodes[termId]);
      } else if (secId in this.nodes) {
        targetNodes.push(this.nodes[secId]);
      } else {
        // Try exact match on term names or sections
        for (const node of Object.values(this.nodes)) {
          const label = node.label;
          const props = node.properties || {};
          if (label === "Term" && props.name?.toLowerCase() === queryStrip.toLowerCase()) {
            targetNodes.push(node);
          } else if (label === "Section" && props.section_number === queryStrip) {
            targetNodes.push(node);
          }
        }
      }
    }

    // 2. Flexible Audit Search (Token Overlap / TF-IDF Ranking)
    if (targetNodes.length === 0) {
      const stopwords = this.domainConfig?.stopwords || [];
      const queryTokens = queryStrip
        .toLowerCase()
        .split(/[^a-zA-Z0-9_\-\.]+/)
        .filter(t => t.length > 1 && !stopwords.includes(t));

      if (queryTokens.length > 0) {
        const scoredNodes = Object.values(this.nodes).map(node => {
          let score = 0;
          const props = node.properties || {};

          if (node.label === "Requirement") {
            const text = (props.text || "").toLowerCase();
            for (const token of queryTokens) {
              if (text.includes(token)) {
                score += 2.0; // High weight for requirement text matches
              }
            }
          } else if (node.label === "Section") {
            const title = (props.title || "").toLowerCase();
            const secNum = (props.section_number || "").toLowerCase();
            for (const token of queryTokens) {
              if (secNum === token) {
                score += 4.0; // Extremely high weight for exact section number match
              } else if (title.includes(token)) {
                score += 1.5; // Medium weight for section title match
              }
            }
          } else if (node.label === "Term") {
            const name = (props.name || "").toLowerCase();
            for (const token of queryTokens) {
              if (name === token) {
                score += 3.0; // High weight for term match
              } else if (name.includes(token)) {
                score += 1.0;
              }
            }
          }

          return { node, score };
        });

        // Filter out zero-score items and sort by score descending
        const matches = scoredNodes
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score);

        if (matches.length > 0) {
          // Take up to 3 top-scoring nodes to provide rich, blended target context
          targetNodes = matches.slice(0, 3).map(m => m.node);
        }
      }
    }

    if (targetNodes.length === 0) {
      return null;
    }

    const linkedRequirements: KGNode[] = [];
    const linkedSections: KGNode[] = [];
    const linkedTerms: KGNode[] = [];
    const conflicts: KGEdge[] = [];

    const visited = new Set<string>(targetNodes.map(n => n.id));

    // 2. Gather context based on query node type
    for (const targetNode of targetNodes) {
      const nodeId = targetNode.id;
      const nodeLabel = targetNode.label;

      // Case A: Query is a Requirement node
      if (nodeLabel === "Requirement") {
        // Get the section containing it (Incoming CONTAINS)
        for (const edge of this.inEdges[nodeId] || []) {
          if (edge.type === "CONTAINS" && edge.source.startsWith("SEC-")) {
            const secNode = this.nodes[edge.source];
            if (secNode && !visited.has(secNode.id)) {
              linkedSections.push(secNode);
              visited.add(secNode.id);
            }
          }
        }

        // Check outgoing edges for REFERENCES and CONFLICTS_WITH
        for (const edge of this.outEdges[nodeId] || []) {
          const targetId = edge.target;
          const edgeType = edge.type;

          if (edgeType === "REFERENCES" && targetId.startsWith("TERM-")) {
            const termNode = this.nodes[targetId];
            if (termNode && !visited.has(targetId)) {
              linkedTerms.push(termNode);
              visited.add(targetId);

              // Find peer requirements referencing this term
              for (const peerEdge of this.inEdges[targetId] || []) {
                const peerId = peerEdge.source;
                if (peerId !== nodeId && peerId.startsWith("REQ-")) {
                  const peerReq = this.nodes[peerId];
                  if (peerReq && !visited.has(peerId)) {
                    linkedRequirements.push(peerReq);
                    visited.add(peerId);
                  }
                }
              }
            }
          } else if (edgeType === "REFERENCES" && targetId.startsWith("SEC-")) {
            const refSec = this.nodes[targetId];
            if (refSec && !visited.has(targetId)) {
              linkedSections.push(refSec);
              visited.add(targetId);
            }
          } else if (edgeType === "REFERENCES" && targetId.startsWith("REQ-")) {
            const refReq = this.nodes[targetId];
            if (refReq && !visited.has(targetId)) {
              linkedRequirements.push(refReq);
              visited.add(targetId);
            }
          } else if (edgeType === "CONFLICTS_WITH") {
            conflicts.push(edge);
            const peerId = edge.target;
            const peerNode = this.nodes[peerId];
            if (peerNode && !visited.has(peerId)) {
              linkedRequirements.push(peerNode);
              visited.add(peerId);
            }
          }
        }

        // Check incoming edges for conflicts
        for (const edge of this.inEdges[nodeId] || []) {
          if (edge.type === "CONFLICTS_WITH") {
            conflicts.push(edge);
            const peerId = edge.source;
            const peerNode = this.nodes[peerId];
            if (peerNode && !visited.has(peerId)) {
              linkedRequirements.push(peerNode);
              visited.add(peerId);
            }
          }
        }

      // Case B: Query is a Term node
      } else if (nodeLabel === "Term") {
        // Find all requirements referencing this term (Incoming REFERENCES)
        for (const edge of this.inEdges[nodeId] || []) {
          if (edge.type === "REFERENCES" && edge.source.startsWith("REQ-")) {
            const reqNode = this.nodes[edge.source];
            if (reqNode && !visited.has(reqNode.id)) {
              linkedRequirements.push(reqNode);
              visited.add(reqNode.id);

              // Also get the section of that requirement
              for (const secEdge of this.inEdges[reqNode.id] || []) {
                if (secEdge.type === "CONTAINS" && secEdge.source.startsWith("SEC-")) {
                  const secNode = this.nodes[secEdge.source];
                  if (secNode && !visited.has(secNode.id)) {
                    linkedSections.push(secNode);
                    visited.add(secNode.id);
                  }
                }
              }
            }
          }
        }

      // Case C: Query is a Section node
      } else if (nodeLabel === "Section") {
        // Find all requirements contained (Outgoing CONTAINS to Requirement)
        for (const edge of this.outEdges[nodeId] || []) {
          const targetId = edge.target;
          if (edge.type === "CONTAINS") {
            if (targetId.startsWith("REQ-")) {
              const reqNode = this.nodes[targetId];
              if (reqNode && !visited.has(targetId)) {
                linkedRequirements.push(reqNode);
                visited.add(targetId);
              }
            } else if (targetId.startsWith("SEC-")) {
              const childSec = this.nodes[targetId];
              if (childSec && !visited.has(targetId)) {
                linkedSections.push(childSec);
                visited.add(targetId);
              }
            }
          }
        }
      }
    }

    return {
      targets: targetNodes,
      linked_requirements: linkedRequirements,
      linked_sections: linkedSections,
      linked_terms: linkedTerms,
      conflicts
    };
  }

  generateAuditPayload(query: string): string {
    const ctx = this.queryContext(query);
    if (!ctx) {
      return `Error: No matching node found for query '${query}' in the Knowledge Graph.`;
    }

    // Format targets
    const targetsMd: string[] = [];
    for (const target of ctx.targets) {
      const label = target.label;
      const props = target.properties;
      if (label === "Requirement") {
        targetsMd.push(`- **${target.id}** [${props.constraint_type} in Section ${props.section_number}, Page ${props.page_number}]:\n  "${props.text}"`);
      } else if (label === "Term") {
        targetsMd.push(`- **Term '${props.name}'**: Mentions frequency = ${props.frequency}`);
      } else if (label === "Section") {
        targetsMd.push(`- **Section ${props.section_number}**: "${props.title}"`);
      }
    }
    const targetRequirementsStr = targetsMd.join('\n');

    // Format structural hierarchy
    const hierarchyMd: string[] = [];
    for (const sec of ctx.linked_sections) {
      const props = sec.properties;
      hierarchyMd.push(`- Section ${props.section_number}: "${props.title}"`);
    }
    const structuralContextStr = hierarchyMd.length > 0 ? hierarchyMd.join('\n') : "No direct structural context linked.";

    // Format linked rules
    const rulesMd: string[] = [];
    for (const req of ctx.linked_requirements) {
      const props = req.properties;
      rulesMd.push(`- **${req.id}** [Section ${props.section_number} - ${props.constraint_type}]: "${props.text}"`);
    }
    const linkedRulesStr = rulesMd.length > 0 ? rulesMd.join('\n') : "No semantically or structurally linked requirements found.";

    // Format terms
    const termsMd: string[] = [];
    for (const term of ctx.linked_terms) {
      const props = term.properties;
      termsMd.push(`- **${props.name}** (Frequency: ${props.frequency})`);
    }
    const referencedTermsStr = termsMd.length > 0 ? termsMd.join('\n') : "No specific technical terms mapped.";

    // Format conflicts
    const conflictsMd: string[] = [];
    for (const edge of ctx.conflicts) {
      const props = edge.properties || {};
      conflictsMd.push(`- Conflict between **${edge.source}** and **${edge.target}** on term **'${props.shared_term}'**:\n  *Reason: ${props.reason}*`);
    }
    const potentialConflictsStr = conflictsMd.length > 0 ? conflictsMd.join('\n') : "No explicit conflicts detected in this context segment.";

    // Fill template
    let payload = this.domainConfig?.auditTemplate || AUDIT_PROMPT_TEMPLATE;
    payload = payload.replace('{role_description}', this.domainConfig?.roleDescription || "Focus on overall clarity, deterministic behavior, testability, and structural completeness of the engineering requirements.");
    
    const addDomainInfo = this.domainConfig?.additionalDomainInfo;
    const addDomainInfoSec = addDomainInfo 
      ? `================================================================================\n6. ADDITIONAL DOMAIN & TARGET ENVIRONMENT INFO\n================================================================================\n${addDomainInfo}\n`
      : "";
    payload = payload.replace('{additional_domain_info_section}', addDomainInfoSec);

    payload = payload.replace('{target_requirements}', targetRequirementsStr);
    payload = payload.replace('{structural_context}', structuralContextStr);
    payload = payload.replace('{linked_rules}', linkedRulesStr);
    payload = payload.replace('{referenced_terms}', referencedTermsStr);
    payload = payload.replace('{potential_conflicts}', potentialConflictsStr);

    return payload;
  }
}
