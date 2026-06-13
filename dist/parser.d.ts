export declare const HEADING_REGEX: RegExp;
export declare const LIST_PREFIX_REGEX: RegExp;
export declare function normalizeSection(secNum: string): string;
export declare function isAncestorSection(ancestor: string, descendent: string): boolean;
export declare function isTableRow(line: string): boolean;
export declare function cleanPageLines(lines: string[], cleanHeaders?: string[]): string[];
export interface Block {
    id: string;
    type: "heading" | "list_item" | "table" | "paragraph";
    text: string;
    section_number: string;
    parent_hierarchy: string[];
    heading_context: string[];
    page_number: number;
    prefix?: string;
    rows?: string[];
}
export interface TreeNode {
    title: string;
    section: string;
    type: "root" | "section";
    children: TreeNode[];
    content: Block[];
}
export declare function validateHeadingsWithLLM(candidates: {
    id: number;
    line: string;
}[], ctx: any, signal?: AbortSignal): Promise<Set<number>>;
export declare class PDFParser {
    private pdfPath;
    private cleanHeaders?;
    constructor(pdfPath: string, cleanHeaders?: string[]);
    getSampleText(signal?: AbortSignal): Promise<string>;
    parse(signal?: AbortSignal, ctx?: any): Promise<Block[]>;
    private assembleBlocks;
}
export declare function buildHierarchyTree(blocks: Block[]): TreeNode;
export declare function treeToMarkdown(tree: TreeNode): string;
