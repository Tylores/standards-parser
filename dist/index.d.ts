import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export declare function runGenericPipeline(pdfPath: string, outputDir: string, ctx: any, options?: {
    domain?: "auto" | "generic" | "smartGrid" | "security";
    additionalTerms?: Record<string, string>;
    additionalStopwords?: string[];
    additionalCleanHeaders?: string[];
    additionalDomainInfo?: string;
    signal?: AbortSignal;
}, pi?: any): Promise<{
    blocksCount: number;
    rulesCount: number;
    nodes: Record<string, number>;
    edges: Record<string, number>;
    absOutputDir: string;
    detectedDomain: string;
    domainConfig: import("./presets.js").DomainConfig & {
        additionalDomainInfo?: string;
    };
}>;
export default function (pi: ExtensionAPI): void;
