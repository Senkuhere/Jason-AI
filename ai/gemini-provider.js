import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

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

// Exported so the fallback logic can tell a temporary Gemini problem from a real bug
export function isTransient(error) {
    const status = Number(error?.status ?? error?.code);

    return (
        status === 429 ||
        status >= 500 ||
        /timeout|timed out|ECONN|ETIMEDOUT|fetch failed|overloaded|unavailable|RESOURCE_EXHAUSTED/i
            .test(String(error?.message))
    );
}

// Starts another identical request if the first is slow, and uses whichever finishes first
// isProgressing(): returns true once an answer has started to arrive, so a slow-but-working stream
// is not duplicated
function hedgedRequest(makeRequest, isProgressing = () => false) {
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
                // Only start a duplicate request if nothing has come back yet
                timer = setTimeout(() => {
                    if (!isProgressing()) startAttempt();
                }, HEDGE_AFTER_MS);
            }
        };

        startAttempt();
    });
}

export class GeminiProvider {
    constructor({
        apiKey = process.env.GEMINI_API_KEY,
        model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
    } = {}) {
        this.client = new GoogleGenAI({ apiKey });
        this.model = model;
    }

    // Streaming version: asks for the answer in small pieces and hands each piece of TEXT to onText
    // the moment it arrives. Returns all the parts of the answer, like a normal request would.
    async streamParts({ contents, systemInstruction, tools, onText }) {
        let owner = null;          // which attempt is allowed to pass text on (a duplicate must not repeat it)
        let progressed = false;    // true as soon as any piece has arrived
        let attemptCounter = 0;

        return hedgedRequest(async () => {
            const attempt = ++attemptCounter;

            const stream = await this.client.models.generateContentStream({
                model: this.model,
                contents,
                config: {
                    systemInstruction,
                    tools,
                    thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING || "MINIMAL" }
                }
            });

            const collected = [];

            for await (const chunk of stream) {
                progressed = true;

                for (const part of chunk.candidates?.[0]?.content?.parts || []) {
                    collected.push(part);

                    // Spoken text only (Gemini's private "thought" parts are never shown)
                    if (part.text && !part.thought) {
                        if (owner === null) owner = attempt;   // the first attempt to produce text wins
                        if (owner === attempt) onText(part.text);
                    }
                }
            }

            return collected;
        }, () => progressed);
    }

    async generate({
        history,
        systemInstruction,
        tools,
        onText
    }) {
        const contents = historyToGemini(history);

        // Streaming is used only when the caller wants the text as it arrives.
        // JASON_STREAMING=off in .env switches it off completely.
        const streaming =
            typeof onText === "function" && process.env.JASON_STREAMING !== "off";

        let parts;

        if (streaming) {
            parts = await this.streamParts({ contents, systemInstruction, tools, onText });
        } else {
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

            parts = response.candidates?.[0]?.content?.parts || [];
        }

        const modelContent = { parts };

        const toolCalls = (modelContent?.parts || [])
            .filter(part => part.functionCall)
            .map((part, index) => ({
                // A random part makes every id unique across the whole request
                id: `gemini-call-${randomUUID().slice(0, 8)}-${index}`,
                name: part.functionCall.name,
                args: part.functionCall.args || {}, 
                thoughtSignature: part.thoughtSignature
            }));

        return {
            // Join the text parts by hand, because response.text prints a warning
            // whenever the reply also contains a tool call
            text: (modelContent?.parts || [])
                .filter(part => part.text && !part.thought)
                .map(part => part.text)
                .join(""),
            toolCalls
        };
    }
}