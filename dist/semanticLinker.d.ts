import { Block } from './parser.js';
import { Rule } from './ruleMiner.js';
export declare const STOPWORDS: Set<string>;
export declare const CURATED_TERMS: Record<string, RegExp>;
export declare const SECTION_REF_REGEX: RegExp;
export declare const REQ_REF_REGEX: RegExp;
export interface KGNode {
    id: string;
    label: "Term" | "Section" | "Requirement";
    properties: Record<string, any>;
}
export interface KGEdge {
    source: string;
    target: string;
    type: "CONTAINS" | "REFERENCES" | "CONFLICTS_WITH" | "CONSTRAINS" | "RECOMMENDS" | "PERMITS" | "DEPENDS_ON" | "IMPLEMENTS" | "SUPERSEDES";
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
export declare class SemanticLinker {
    private topNTerms;
    private curatedTerms;
    private stopwords;
    private actors;
    constructor(topNTerms?: number, config?: {
        curatedTerms?: Record<string, RegExp>;
        stopwords?: string[];
        actors?: string[];
    });
    buildKnowledgeGraph(ruleLedger: Rule[], blocks: Block[], ctx?: any, signal?: AbortSignal): Promise<KnowledgeGraph>;
    private extractTerms;
    private escapeRegExp;
    refineSemanticEdges(kg: KnowledgeGraph, ctx: any, signal?: AbortSignal): Promise<KnowledgeGraph>;
    extractTermsLLM(ruleLedger: Rule[], ctx: any, signal?: AbortSignal): Promise<Record<string, number>>;
    validateConflictsWithLLM(candidates: Array<{
        r1: Rule;
        r2: Rule;
        term: string;
    }>, ctx: any, signal?: AbortSignal): Promise<Array<{
        r1: Rule;
        r2: Rule;
        term: string;
        reason: string;
    }>>;
}
