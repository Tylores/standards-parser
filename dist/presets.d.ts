export interface DomainConfig {
    name: string;
    curatedTerms: Record<string, RegExp>;
    stopwords: string[];
    cleanHeaders: string[];
    roleDescription: string;
    auditTemplate: string;
}
export declare const GENERAL_STOPWORDS: string[];
export declare const GENERIC_TEMPLATE = "You are an expert Systems Architect and Senior Systems Engineer specializing in standards analysis, compliance engineering, and high-integrity system specifications.\n\n{role_description}\n\nYour task is to audit the selected requirement(s) extracted from a technical standard, analyzing them for semantic consistency, ambiguity, implementation feasibility, and conformity to systems engineering best practices.\n\n================================================================================\n1. TARGET REQUIREMENT(S) TO AUDIT\n================================================================================\n{target_requirements}\n\n================================================================================\n2. HIERARCHICAL & STRUCTURAL CONTEXT\n================================================================================\n{structural_context}\n\n================================================================================\n3. SEMANTICALLY & STRUCTURALLY LINKED RULES\n================================================================================\n{linked_rules}\n\n================================================================================\n4. KEY CONCEPTS & TERMS INVOLVED\n================================================================================\n{referenced_terms}\n\n================================================================================\n5. AUTOMATICALLY FLAGGED POTENTIAL CONFLICTS\n================================================================================\n{potential_conflicts}\n\n{additional_domain_info_section}\n\n================================================================================\nCRITIQUE INSTRUCTIONS FOR THE LLM AUDITOR:\n================================================================================\nPerform a rigorous, production-grade critique covering the following areas:\n\n1. **Ambiguity & Testability Analysis**:\n   - Assess if the requirement uses vague, non-measurable words (e.g., \"appropriate\", \"efficient\", \"rapidly\", \"highly secure\") without defining quantitative metrics or ranges.\n   - Determine if the requirement can be verified via automated conformance testing.\n\n2. **Logical Consistency & Conflict Resolution**:\n   - Evaluate the target requirement against the linked rules and potential conflicts.\n   - Identify contradictions (e.g., a \"shall\" contradicting a \"shall not\" or \"may\" on the same concept/term in a different section).\n   - Pinpoint gaps or omissions in the surrounding context.\n\n3. **System Architectural & Implementation Feasibility**:\n   - Discuss how this requirement affects system state machines, processing flows, transport overhead, latency constraints, or data payload structures.\n   - Highlight potential race conditions, edge-case timing failures, or performance bottlenecks introduced by this specification.\n\n4. **Proposed Revisions**:\n   - Draft a revised version of the target requirement(s) that removes all ambiguities and resolves any identified contradictions.\n   - Provide concrete, deterministic, and clear systems-engineering language.\n";
export declare const PRESETS: Record<string, DomainConfig>;
/**
 * Automatically detects the domain preset from the parsed text of the document
 */
export declare function detectDomainPreset(text: string): keyof typeof PRESETS;
/**
 * Builds a dynamic config, merging standard preset with custom options
 */
export declare function getDomainConfig(presetName: string, options?: {
    additionalTerms?: Record<string, string | RegExp>;
    additionalStopwords?: string[];
    additionalCleanHeaders?: string[];
    additionalDomainInfo?: string;
}): DomainConfig & {
    additionalDomainInfo?: string;
};
