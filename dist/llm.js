export async function askLLM(request, ctx) {
    // 1. Try Pi Agent context if available
    if (ctx && (ctx.model || ctx.modelRegistry)) {
        try {
            // Dynamic import to prevent runtime crash in environments without Pi agent dependencies
            const { complete } = await import("@earendil-works/pi-ai");
            const model = ctx.model || ctx.modelRegistry.getAvailable()[0] || ctx.modelRegistry.getAll()[0];
            if (model) {
                const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
                const apiKey = auth.ok ? auth.apiKey : undefined;
                const headers = auth.ok ? auth.headers : undefined;
                const context = {
                    systemPrompt: request.systemPrompt,
                    messages: [{ role: "user", content: request.userPrompt, timestamp: Date.now() }]
                };
                const response = await complete(model, context, {
                    apiKey,
                    headers,
                    signal: request.signal
                });
                let text = "";
                for (const block of response.content) {
                    if (block.type === "text") {
                        text += block.text;
                    }
                }
                return text;
            }
        }
        catch (err) {
            console.warn("Failed to complete LLM request via Pi API, attempting direct API keys if available:", err.message);
        }
    }
    // 2. Try direct provider API keys from environment
    try {
        if (process.env.GEMINI_API_KEY) {
            return await callGemini(request);
        }
        if (process.env.OPENAI_API_KEY) {
            return await callOpenAI(request);
        }
        if (process.env.ANTHROPIC_API_KEY) {
            return await callAnthropic(request);
        }
    }
    catch (err) {
        console.error("LLM API call failed:", err.message);
    }
    return null;
}
async function callGemini(req) {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: req.systemPrompt }]
            },
            contents: [
                {
                    role: "user",
                    parts: [{ text: req.userPrompt }]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        }),
        signal: req.signal
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || null;
}
async function callOpenAI(req) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const url = `https://api.openai.com/v1/chat/completions`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: req.systemPrompt },
                { role: "user", content: req.userPrompt }
            ],
            response_format: { type: "json_object" }
        }),
        signal: req.signal
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    return text || null;
}
async function callAnthropic(req) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    const url = `https://api.anthropic.com/v1/messages`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey || "",
            "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
            model,
            system: req.systemPrompt,
            messages: [
                { role: "user", content: req.userPrompt }
            ],
            max_tokens: 4096
        }),
        signal: req.signal
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    const text = data.content?.[0]?.text;
    return text || null;
}
