import { Block } from './parser.js';
export declare const BOUNDARY_REGEX: RegExp;
export declare const ABBREVIATION_PATTERN: RegExp;
export declare const RULE_PATTERNS: Record<string, RegExp[]>;
export declare function splitSentences(text: string): string[];
export interface Rule {
    id: string;
    section_number: string;
    parent_hierarchy: string[];
    heading_context: string[];
    constraint_type: "Prohibition" | "Mandatory" | "Recommendation" | "Permission";
    all_matched_constraints: string[];
    text: string;
    source_block_id: string;
    page_number: number;
}
export declare class RuleMiner {
    private reqCounter;
    private lastValidSection;
    constructor(startId?: number);
    mineRules(blocks: Block[]): Rule[];
    private analyzeSentence;
}
