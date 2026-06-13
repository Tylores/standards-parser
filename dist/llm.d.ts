export interface LLMRequest {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
}
export declare function askLLM(request: LLMRequest, ctx?: any): Promise<string | null>;
