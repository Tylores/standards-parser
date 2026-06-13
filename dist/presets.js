// Common general English stopwords
export const GENERAL_STOPWORDS = [
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
    'clause', 'section', 'paragraph', 'table', 'figure', 'document', 'documents', 'standard', 'standards'
];
export const GENERIC_TEMPLATE = `You are an expert Systems Architect and Senior Systems Engineer specializing in standards analysis, compliance engineering, and high-integrity system specifications.

{role_description}

Your task is to audit the selected requirement(s) extracted from a technical standard, analyzing them for semantic consistency, ambiguity, implementation feasibility, and conformity to systems engineering best practices.

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

{additional_domain_info_section}

================================================================================
CRITIQUE INSTRUCTIONS FOR THE LLM AUDITOR:
================================================================================
Perform a rigorous, production-grade critique covering the following areas:

1. **Ambiguity & Testability Analysis**:
   - Assess if the requirement uses vague, non-measurable words (e.g., "appropriate", "efficient", "rapidly", "highly secure") without defining quantitative metrics or ranges.
   - Determine if the requirement can be verified via automated conformance testing.

2. **Logical Consistency & Conflict Resolution**:
   - Evaluate the target requirement against the linked rules and potential conflicts.
   - Identify contradictions (e.g., a "shall" contradicting a "shall not" or "may" on the same concept/term in a different section).
   - Pinpoint gaps or omissions in the surrounding context.

3. **System Architectural & Implementation Feasibility**:
   - Discuss how this requirement affects system state machines, processing flows, transport overhead, latency constraints, or data payload structures.
   - Highlight potential race conditions, edge-case timing failures, or performance bottlenecks introduced by this specification.

4. **Proposed Revisions**:
   - Draft a revised version of the target requirement(s) that removes all ambiguities and resolves any identified contradictions.
   - Provide concrete, deterministic, and clear systems-engineering language.
`;
export const PRESETS = {
    generic: {
        name: "generic",
        curatedTerms: {
            "conformance": /\bconformances?\b/i,
            "compliance": /\bcompliances?\b/i,
            "requirement": /\brequirements?\b/i,
            "specification": /\bspecifications?\b/i,
            "verification": /\bverifications?\b/i,
            "validation": /\bvalidations?\b/i,
            "system": /\bsystems?\b/i,
            "process": /\bprocesses?\b/i,
            "interface": /\binterfaces?\b/i,
            "parameter": /\bparameters?\b/i,
            "performance": /\bperformances?\b/i,
            "implementation": /\bimplementations?\b/i,
            "compatibility": /\bcompatibilities|compatibility\b/i
        },
        stopwords: [...GENERAL_STOPWORDS],
        cleanHeaders: ["standard", "section", "page"],
        roleDescription: "Focus on overall clarity, deterministic behavior, testability, and structural completeness of the engineering requirements.",
        auditTemplate: GENERIC_TEMPLATE,
        actors: ["client", "server", "device", "system", "user", "application"]
    },
    smartGrid: {
        name: "smartGrid",
        curatedTerms: {
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
        },
        stopwords: [...GENERAL_STOPWORDS, "ieee"],
        cleanHeaders: ["energy services interface", "ieee std", "prepared by"],
        roleDescription: "Focus on smart grid communications, mTLS security, transport mechanisms, latency constraints, and IEEE 2030.5 / SEP 2 protocol implementation (such as XML/EXI structures).",
        auditTemplate: GENERIC_TEMPLATE,
        actors: ["client", "server", "device", "system", "user", "application", "gateway", "inverter"]
    },
    security: {
        name: "security",
        curatedTerms: {
            "security": /\bsecurit(?:y|ies)\b/i,
            "authentication": /\bauthentications?\b/i,
            "authorization": /\bauthorizations?\b/i,
            "encryption": /\bencryptions?\b/i,
            "cryptography": /\bcryptograph(?:y|ies)\b/i,
            "tls": /\btls\b/i,
            "certificate": /\bcertificates?\b/i,
            "credentials": /\bcredentials?\b/i,
            "access": /\baccess\b/i,
            "policy": /\bpolic(?:y|ies)\b/i,
            "vulnerability": /\bvulnerabilit(?:y|ies)\b/i,
            "audit": /\baudits?\b/i,
            "token": /\btokens?\b/i,
            "handshake": /\bhandshakes?\b/i,
            "session": /\bsessions?\b/i,
            "integrity": /\bintegrity\b/i,
            "confidentiality": /\bconfidentiality\b/i
        },
        stopwords: [...GENERAL_STOPWORDS, "security", "standard", "iso", "rfc"],
        cleanHeaders: ["security", "confidential", "proprietary", "iso", "rfc"],
        roleDescription: "Focus on threat modeling, cryptographic assurance, identity federation, secure transport, access controls, vulnerability mitigation, and data protection policies.",
        auditTemplate: GENERIC_TEMPLATE,
        actors: ["client", "server", "device", "system", "user", "application", "administrator", "subject", "object"]
    }
};
/**
 * Automatically detects the domain preset from the parsed text of the document
 */
export function detectDomainPreset(text) {
    const lowercaseText = text.toLowerCase();
    // Count keyword indicators
    const indicators = {
        smartGrid: 0,
        security: 0
    };
    // Smart Grid indicators
    const gridWords = ["2030.5", "smart grid", "der", "inverter", "telemetry", "voltage", "ieee std"];
    for (const word of gridWords) {
        if (lowercaseText.includes(word))
            indicators.smartGrid += 1.5;
    }
    const gridRegexes = [/\bieee\s+\d+\b/i, /\bsep\s*2\b/i, /\bvoltage\b/i];
    for (const regex of gridRegexes) {
        if (regex.test(lowercaseText))
            indicators.smartGrid += 1.0;
    }
    // Security indicators
    const securityWords = ["iso 27001", "oauth", "tls", "cryptographic", "cybersecurity", "confidentiality", "rbac", "authentication"];
    for (const word of securityWords) {
        if (lowercaseText.includes(word))
            indicators.security += 1.5;
    }
    const securityRegexes = [/\baccess\s+control\b/i, /\bsecure\s+transport\b/i];
    for (const regex of securityRegexes) {
        if (regex.test(lowercaseText))
            indicators.security += 1.0;
    }
    if (indicators.smartGrid > 1 && indicators.smartGrid >= indicators.security) {
        return "smartGrid";
    }
    else if (indicators.security > 1 && indicators.security > indicators.smartGrid) {
        return "security";
    }
    return "generic";
}
/**
 * Builds a dynamic config, merging standard preset with custom options
 */
export function getDomainConfig(presetName, options) {
    const preset = PRESETS[presetName] || PRESETS.generic;
    const mergedCuratedTerms = { ...preset.curatedTerms };
    if (options?.additionalTerms) {
        for (const [k, v] of Object.entries(options.additionalTerms)) {
            mergedCuratedTerms[k] = typeof v === 'string' ? new RegExp(`\\b${v}s?\\b`, 'i') : v;
        }
    }
    const mergedStopwords = Array.from(new Set([...preset.stopwords, ...(options?.additionalStopwords || [])]));
    const mergedCleanHeaders = Array.from(new Set([...preset.cleanHeaders, ...(options?.additionalCleanHeaders || [])]));
    const mergedActors = Array.from(new Set([...(preset.actors || []), ...(options?.additionalActors || [])]));
    return {
        ...preset,
        curatedTerms: mergedCuratedTerms,
        stopwords: mergedStopwords,
        cleanHeaders: mergedCleanHeaders,
        actors: mergedActors,
        additionalDomainInfo: options?.additionalDomainInfo
    };
}
