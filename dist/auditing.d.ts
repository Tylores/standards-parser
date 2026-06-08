import { KnowledgeGraph, KGNode, KGEdge } from './semanticLinker.js';
export declare const AUDIT_PROMPT_TEMPLATE = "You are an expert Systems Architect and Senior Security Engineer specializing in smart grid communications, mTLS security, and IEEE 2030.5 / SEP 2 protocol implementation.\n\nYour task is to audit the selected requirement(s) extracted from a dense technical standard, analyzing them for semantic consistency, ambiguity, and implementation feasibility.\n\n================================================================================\n1. TARGET REQUIREMENT(S) TO AUDIT\n================================================================================\n{target_requirements}\n\n================================================================================\n2. HIERARCHICAL & STRUCTURAL CONTEXT\n================================================================================\n{structural_context}\n\n================================================================================\n3. SEMANTICALLY & STRUCTURALLY LINKED RULES\n================================================================================\n{linked_rules}\n\n================================================================================\n4. KEY CONCEPTS & TERMS INVOLVED\n================================================================================\n{referenced_terms}\n\n================================================================================\n5. AUTOMATICALLY FLAGGED POTENTIAL CONFLICTS\n================================================================================\n{potential_conflicts}\n\n================================================================================\nCRITIQUE INSTRUCTIONS FOR THE LLM AUDITOR:\n================================================================================\nPerform a rigorous, production-grade critique covering the following areas:\n\n1. **Ambiguity & Testability Analysis**:\n   - Assess if the requirement uses vague words (e.g., \"appropriate\", \"efficient\", \"rapidly\") without defining quantitative metrics or ranges.\n   - Determine if the requirement can be verified via automated conformance testing.\n\n2. **Logical Consistency & Conflict Resolution**:\n   - Evaluate the target requirement against the linked rules and potential conflicts.\n   - Identify contradictions (e.g., a \"shall\" contradicting a \"shall not\" or \"may\" on the same term in a different section).\n   - Pinpoint gaps or omissions in the surrounding context.\n\n3. **Smart Grid & IEEE 2030.5 Protocol Feasibility**:\n   - Discuss how this requirement affects system state machines, transaction integrity, transport security (mTLS), messaging latency, or payloads (e.g., XML/EXI structures in IEEE 2030.5).\n   - Highlight potential race conditions, timing failures (timeouts, heartbeats), or security vulnerabilities introduced by this specification.\n\n4. **Proposed Revisions**:\n   - Draft a revised version of the target requirement(s) that removes all ambiguities and resolves any identified contradictions.\n   - Provide concrete, deterministic, and clear language.\n";
export interface AuditContext {
    targets: KGNode[];
    linked_requirements: KGNode[];
    linked_sections: KGNode[];
    linked_terms: KGNode[];
    conflicts: KGEdge[];
}
export declare class RequirementAuditor {
    private kg;
    private nodes;
    private outEdges;
    private inEdges;
    private domainConfig?;
    constructor(knowledgeGraph: KnowledgeGraph, domainConfig?: any);
    queryContext(query: string): AuditContext | null;
    generateAuditPayload(query: string): string;
}
