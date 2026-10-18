import { GoogleGenAI } from "@google/genai";

const routerClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

function parseRoutingDecision(text) {
    try {
        const decision = JSON.parse(text);

        if (!["gemini", "openai"].includes(decision.provider)) {
            throw new Error("Invalid provider.");
        }

        if (!["normal", "complex"].includes(decision.complexity)) {
            throw new Error("Invalid complexity.");
        }

        return decision;
    } catch {
        return {
            provider: "gemini",
            complexity: "normal",
            reason: "Routing decision could not be parsed.",
            confidence: 0
        };
    }
}

export async function chooseProvider(userMessage) {
    const routingPrompt = `
Classify this request for a personal AI assistant.

Choose "gemini" for:
- Normal conversation
- Straightforward questions
- Using API tools like weather or web search
- Memory operations
- Simple file reads or edits
- Basic tool use

Choose "openai" for:
- Complex reasoning
- Difficult debugging
- System architecture
- Multi-file implementation
- Large website or application development
- Multi-stage technical work
- Tasks requiring sustained planning

Prefer Gemini whenever both providers are suitable.

Return only valid JSON:
{
  "provider": "gemini" or "openai",
  "complexity": "normal" or "complex",
  "reason": "short explanation",
  "confidence": 0.0
}

User request:
${userMessage}
`;

    const response = await routerClient.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: routingPrompt,
        config: {
            responseMimeType: "application/json"
        }
    });

    return parseRoutingDecision(response.text || "");
}