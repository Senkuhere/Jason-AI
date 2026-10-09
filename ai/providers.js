import { GeminiProvider } from "./gemini-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { chooseProvider } from "./model-router.js";

const providers = {
    gemini: new GeminiProvider(),
    openai: process.env.OPENAI_API_KEY
        ? new OpenAIProvider()
        : null
};

export async function getProviderForRequest(userMessage) {
    const routingMode =
        process.env.MODEL_ROUTING_MODE || "auto";

    if (routingMode === "gemini") {
        return {
            name: "gemini",
            provider: providers.gemini,
            decision: {
                provider: "gemini",
                complexity: "normal",
                reason: "Gemini was selected by configuration."
            }
        };
    }

    if (routingMode === "openai") {
        if (!providers.openai) {
            throw new Error(
                "OpenAI routing was requested, but OPENAI_API_KEY is missing."
            );
        }

        return {
            name: "openai",
            provider: providers.openai,
            decision: {
                provider: "openai",
                complexity: "complex",
                reason: "OpenAI was selected by configuration."
            }
        };
    }

    let decision;

    try {
        decision = await chooseProvider(userMessage);
    } catch (error) {
        console.error(
            "Model routing failed. Falling back to Gemini:",
            error.message
        );

        return {
            name: "gemini",
            provider: providers.gemini,
            decision: {
                provider: "gemini",
                complexity: "normal",
                reason: "Routing failed, so Gemini was used as fallback."
            }
        };
    }

    if (
        decision.provider === "openai" &&
        providers.openai
    ) {
        return {
            name: "openai",
            provider: providers.openai,
            decision
        };
    }

    return {
        name: "gemini",
        provider: providers.gemini,
        decision
    };
}