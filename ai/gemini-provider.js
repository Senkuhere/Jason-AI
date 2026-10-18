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

export class GeminiProvider {
    constructor({
        apiKey = process.env.GEMINI_API_KEY,
        model = "gemini-3.1-flash-lite"
    } = {}) {
        this.client = new GoogleGenAI({ apiKey });
        this.model = model;
    }

    async generate({
        history,
        systemInstruction,
        tools
    }) {
        const response = await this.client.models.generateContent({
            model: this.model,
            contents: historyToGemini(history),
            config: {
                systemInstruction,
                tools
            }
        });

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