import { GeminiProvider,
         isTransient 
} from "./gemini-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { chooseProvider } from "./model-router.js";


const providers = {
    gemini: new GeminiProvider(),
    openai: process.env.OPENAI_API_KEY
        ? new OpenAIProvider()
        : null
};

// Tries Gemini first. OpenAI is only asked when Gemini is slow or has a temporary failure.
class FallbackProvider {
    constructor(primary, backup, afterMs) {
        this.primary = primary;     // Gemini: free and usually fast
        this.backup = backup;       // OpenAI: costs credits, so only used when needed
        this.afterMs = afterMs;     // how long to wait for Gemini before also asking OpenAI
    }

    async generate(args) {
        // If OpenAI already handled an earlier step of this request, let it finish the request.
        // Switching back to Gemini in the middle could confuse its tool-call history.
        const openAiAlreadyUsed = (args.history || []).some(message =>
            (message.toolCalls || []).some(call => call.provider === "openai")
        );

        if (openAiAlreadyUsed) {
            return this.backup.generate(args);
        }

        return new Promise((resolve, reject) => {
            let settled = false;          // true once we have an answer or a final error
            let backupStarted = false;
            let primaryError = null;
            let backupError = null;

            // Settles the request exactly once, and cancels the timer
            const finish = (action, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                action(value);
            };

            // Asks OpenAI (only once per step)
            const startBackup = reason => {
                if (backupStarted || settled) return;
                backupStarted = true;

                console.warn(`[Jason] Gemini ${reason}. Asking OpenAI as well.`);

                this.backup.generate(args).then(
                    value => {
                        console.warn("[Jason] OpenAI answered first.");
                        finish(resolve, value);
                    },
                    error => {
                        backupError = error;

                        // Both failed: report the Gemini error, which is the one that matters
                        if (primaryError) finish(reject, primaryError);
                    }
                );
            };

            // If Gemini is still silent after afterMs, bring in OpenAI as well
            const timer = setTimeout(
                () => startBackup(`has not answered after ${this.afterMs / 1000} seconds`),
                this.afterMs
            );

            this.primary.generate(args).then(
                value => finish(resolve, value),
                error => {
                    primaryError = error;

                    // Real bugs (a bad request, for example) must not silently spend OpenAI credits
                    if (!isTransient(error)) {
                        finish(reject, error);
                        return;
                    }

                    if (!backupStarted) {
                        startBackup("failed with a temporary error");
                    } else if (backupError) {
                        // OpenAI had already failed, and now Gemini failed too
                        finish(reject, primaryError);
                    }
                }
            );
        });
    }
}

// Gemini with OpenAI as a safety net (only when an OpenAI key exists).
// Set OPENAI_FALLBACK=off to disable it. GEMINI_FALLBACK_AFTER_MS changes the 4 second wait.
const geminiWithBackup =
    providers.openai && process.env.OPENAI_FALLBACK !== "off"
        ? new FallbackProvider(
            providers.gemini,
            providers.openai,
            Number(process.env.GEMINI_FALLBACK_AFTER_MS) || 4000
        )
        : providers.gemini;
        
export async function getProviderForRequest(userMessage) {
    const routingMode =
        process.env.MODEL_ROUTING_MODE || "auto";

    if (routingMode === "gemini") {
        return {
            name: "gemini",
            provider: geminiWithBackup,
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
            provider: geminiWithBackup,
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
            provider: geminiWithBackup,
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