import { GoogleGenAI } from "@google/genai";

function historyToGemini(history) {
    const contents = [];

    for (let index = 0; index < history.length; index++) {
        const message = history[index];

        if (message.role === "user") {
            const parts = Array.isArray(message.content)
                ? message.content.map(part => {
                    if (part.type === "image") {
                        return {
                            inlineData: {
                                mimeType: part.mimeType,
                                data: part.data
                            }
                        };
                    }

                    return {
                        text: part.text
                    };
                })
                : [{ text: message.content }];

            contents.push({
                role: "user",
                parts
            });

            continue;
        }

        if (message.role === "assistant") {
            const parts = [];

            if (message.content) {
                parts.push({ text: message.content });
            }

            for (const toolCall of message.toolCalls || []) {
                const functionCallPart = {
                        functionCall: {
                            name: toolCall.name,
                            args: toolCall.args
                        }
                    };

                    if (toolCall.thoughtSignature) {
                        functionCallPart.thoughtSignature =
                            toolCall.thoughtSignature;
                    }

                    parts.push(functionCallPart);
            }

            contents.push({
                role: "model",
                parts
            });
            continue;
        }

        if (message.role === "tool") {
            const functionResponseParts = [];

            while (
                index < history.length &&
                history[index].role === "tool"
            ) {
                const toolMessage = history[index];

                functionResponseParts.push({
                    functionResponse: {
                        name: toolMessage.name,
                        response: {
                            result: toolMessage.result
                        }
                    }
                });

                index++;
            }

            index--;

            contents.push({
                role: "user",
                parts: functionResponseParts
            });
        }
    }

    return contents;
}

const HEDGE_AFTER_MS = Number(process.env.GEMINI_HEDGE_MS) || 5000;
const MAX_ATTEMPTS = 3;

function isTransient(error) {
    const status = Number(error?.status ?? error?.code);

    return (
        status === 429 ||
        status >= 500 ||
        /timeout|timed out|ECONN|ETIMEDOUT|fetch failed|overloaded|unavailable|RESOURCE_EXHAUSTED/i
            .test(String(error?.message))
    );
}

// Starts another identical request if the first is slow, and uses whichever finishes first
function hedgedRequest(makeRequest) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let started = 0;
        let failed = 0;
        let timer;

        const onSuccess = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };

        const onFailure = error => {
            failed++;
            if (settled) return;

            if (!isTransient(error)) {
                settled = true;
                clearTimeout(timer);
                reject(error);
                return;
            }

            if (failed === started) {
                clearTimeout(timer);

                if (started >= MAX_ATTEMPTS) {
                    settled = true;
                    reject(error);
                } else {
                    startAttempt();
                }
            }
        };

        const startAttempt = () => {
            if (settled) return;
            started++;
            makeRequest().then(onSuccess, onFailure);

            if (started < MAX_ATTEMPTS) {
                timer = setTimeout(startAttempt, HEDGE_AFTER_MS);
            }
        };

        startAttempt();
    });
}

export class GeminiProvider {
    constructor({
        apiKey = process.env.GEMINI_API_KEY,
        model = "gemini-3.5-flash-lite"
    } = {}) {
        this.client = new GoogleGenAI({ apiKey });
        this.model = model;
    }

    async generate({
        history,
        systemInstruction,
        tools
    }) {
        const contents = historyToGemini(history);

        const response = await hedgedRequest(() =>
            this.client.models.generateContent({
                model: this.model,
                contents,
                config: {
                    systemInstruction,
                    tools,
                    thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING || "MINIMAL" }
                }
            })
        );

        const modelContent = response.candidates?.[0]?.content;

        const toolCalls = (modelContent?.parts || [])
            .filter(part => part.functionCall)
            .map((part, index) => ({
                id: `gemini-call-${index}`,
                name: part.functionCall.name,
                args: part.functionCall.args || {}, 
                thoughtSignature: part.thoughtSignature
            }));

        return {
            text: response.text || "",
            toolCalls
        };
    }
}