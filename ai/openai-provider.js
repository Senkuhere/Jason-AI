import OpenAI from "openai";

function normalizeSchema(schema) {
    if (!schema || typeof schema !== "object") {
        return schema;
    }

    const normalized = { ...schema };

    if (typeof normalized.type === "string") {
        normalized.type = normalized.type.toLowerCase();
    }

    if (normalized.properties) {
        normalized.properties = Object.fromEntries(
            Object.entries(normalized.properties).map(
                ([name, property]) => [
                    name,
                    normalizeSchema(property)
                ]
            )
        );
    }
    if (normalized.items) {
        normalized.items = normalizeSchema(normalized.items);
    }

    return normalized;
}

function convertToolsForOpenAI(toolDefinitions) {
    const declarations = toolDefinitions.flatMap(
        definition => definition.functionDeclarations || []
    );

    return declarations.map(declaration => ({
        type: "function",
        function: {
            name: declaration.name,
            description: declaration.description,
            parameters: normalizeSchema(declaration.parameters)
        }
    }));
}

function historyToOpenAI(history, systemInstruction) {
    const messages = [
        {
            role: "system",
            content: systemInstruction
        }
    ];

    for (const message of history) {
        if (message.role === "user") {
            const content = Array.isArray(message.content)
                ? message.content.map(part => {
                    if (part.type === "image") {
                        return {
                            type: "image_url",
                            image_url: {
                                url:
                                    `data:${part.mimeType};base64,` +
                                    part.data
                            }
                        };
                    }

                    return {
                        type: "text",
                        text: part.text
                    };
                })
                : message.content;

            messages.push({
                role: "user",
                content
            });
        }

        if (message.role === "assistant") {
            messages.push({
                role: "assistant",
                content: message.content || null,
                tool_calls: (message.toolCalls || []).map(toolCall => ({
                    id: toolCall.id,
                    type: "function",
                    function: {
                        name: toolCall.name,
                        arguments: JSON.stringify(toolCall.args || {})
                    }
                }))
            });
        }

        if (message.role === "tool") {
            messages.push({
                role: "tool",
                tool_call_id: message.toolCallId,
                content: JSON.stringify(message.result)
            });
        }
    }

    return messages;
}

export class OpenAIProvider {
    constructor({
        apiKey = process.env.OPENAI_API_KEY,
        model = process.env.OPENAI_MODEL
    } = {}) {
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not configured.");
        }

        if (!model) {
            throw new Error("OPENAI_MODEL is not configured.");
        }

        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    async generate({
        history,
        systemInstruction,
        tools
    }) {
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: historyToOpenAI(history, systemInstruction),
            tools: convertToolsForOpenAI(tools),
            tool_choice: "auto"
        });

        const message = response.choices[0]?.message;

        const toolCalls = (message?.tool_calls || []).map(toolCall => {
            let args = {};

            try {
                args = JSON.parse(
                    toolCall.function.arguments || "{}"
                );
            } catch {
                throw new Error(
                    `OpenAI returned invalid arguments for "${toolCall.function.name}".`
                );
            }

            return {
                id: toolCall.id,
                name: toolCall.function.name,
                args,
                // Lets the fallback logic see that OpenAI has already worked on this request
                provider: "openai"
            };
        });

        return {
            text: message?.content || "",
            toolCalls
        };
    }
}