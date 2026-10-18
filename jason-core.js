import { GoogleGenAI } from "@google/genai";
import { buildJasonSystemPrompt } from "./personality.js";
import {
    getToolDefinitions,
    executeCapability,
    isCacheable,
    isMutating
} from "./capability-registry.js";

import {
    shortTermMemory,
    loadShortTermMemory,
    saveShortTermMemory,
    updateShortTermMemory,
    buildChatPrompt
} from "./memory.js";

import {
    getLongTermMemories,
    saveLongTermMemory,
    checkDatabaseConnection,
    deleteLongTermMemory
} from "./long-term-memory.js";

import { getProviderForRequest } from "./ai/providers.js";

import { logCapability } from "./capability-logger.js";

const MAX_AGENT_STEPS = 15;
const MAX_TOOL_CALLS_PER_STEP = 8;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const MEMORY_ACTIONS = new Set([
    "create",
    "update",
    "delete",
    "none"
]);

const MEMORY_CATEGORIES = new Set([
    "personal_fact",
    "preference",
    "goal",
    "decision",
    "project",
    "background"
]);
function describeError(error) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message
        };
    }

    if (typeof error === "object" && error !== null) {
        return {
            name: "UnknownError",
            message: JSON.stringify(error)
        };
    }

    return {
        name: "UnknownError",
        message: String(error)
    };
}

function parseMemoryDecision(text) {
    const cleanedText = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "");

    let decision;

    try {
        decision = JSON.parse(cleanedText);
    } catch {
        return {
            action: "none",
            key: null,
            category: null,
            content: null,
            importance: null,
            confidence: null
        };
    }

    if (!MEMORY_ACTIONS.has(decision.action)) {
        return {
            action: "none",
            key: null,
            category: null,
            content: null,
            importance: null,
            confidence: null
        };
    }

    if (
        decision.action !== "none" &&
        typeof decision.key !== "string"
    ) {
        return {
            action: "none",
            key: null,
            category: null,
            content: null,
            importance: null,
            confidence: null
        };
    }

    if (
        decision.category !== null &&
        !MEMORY_CATEGORIES.has(decision.category)
    ) {
        decision.category = "background";
    }

    if (
        typeof decision.importance !== "number" ||
        decision.importance < 1 ||
        decision.importance > 10
    ) {
        decision.importance = 5;
    }

    if (
        !["confirmed", "inferred", "uncertain"].includes(
            decision.confidence
        )
    ) {
        decision.confidence = "confirmed";
    }

    return decision;
}

async function evaluateLongTermMemory(
    userMessage,
    recentMessages = [],
    existingMemories = []
) {
    const existingMemoryKeys = existingMemories
        .map(memory =>
            `${memory.memory_key}: ${memory.content}`
        )
        .join("\n");
    const recentConversation = recentMessages
        .map(message => `${message.role}: ${message.content}`)
        .join("\n");

    const evaluationPrompt = `
You extract durable user memories from conversations.

Only remember information about the user, such as:
- personal facts
- preferences
- goals
- decisions
- ongoing projects
- important background information

Do not remember:
- greetings
- temporary emotions
- one-time questions
- casual conversation
- assistant-generated claims
- facts about other people
- guesses presented as facts

Use the recent conversation to understand references such as
"there", "that school", or "my project".

Return ONLY valid JSON in this exact format:

{
  "action": "create",
  "key": "education.institution",
  "category": "personal_fact",
  "content": "The user is enrolled at Example University.",
  "importance": 10,
  "confidence": "confirmed"
}

Allowed actions:
- "create": a new durable fact
- "update": a correction or replacement of an existing fact
- "delete": the user wants a fact forgotten
- "none": nothing durable should be stored

Use stable keys. Examples:
- profile.name
- profile.age
- education.institution
- preference.favorite_food
- preference.communication_style
- project.jason_ai
- goal.learn_programming

For "delete", set content to null.
For "none", set key, category, content, importance, and confidence to null.

Recent conversation:
${recentConversation || "No recent conversation available."}

Existing memories and their exact keys:
${existingMemoryKeys || "No existing memories available."}

For update and delete actions, use an exact memory_key
from the existing memories list. Never invent a new key.
Latest user message:
${userMessage}
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: evaluationPrompt
    });

    return parseMemoryDecision(response.text || "");
}

function getToolCallKey(name, args) {
    return `${name}:${JSON.stringify(args ?? {})}`;
}

async function requestApproval(name, args, onApproval) {
    if (!requiresApproval(name)) {
        return { approved: true, context: {} };
    }

    const prepared = await prepareCapability(name, args);

    if (!onApproval) {
        return {
            approved: false,
            reason: "No approval handler is available, so the action was not run."
        };
    }

    const approved = await onApproval({
        name,
        args,
        preview: prepared.preview
    });

    return approved
        ? { approved: true, context: prepared.context }
        : { approved: false, reason: "The user declined this action." };
}

async function runAgent(
    prompt,
    systemInstruction,
    provider,
    images = [],
    onEvent = () => {}
) {
    const failedCalls = new Set();
    const completedCalls = new Map();

    const userContent = images.length > 0
    ? [
        {
            type: "text",
            text: prompt
        },
        ...images.map(image => ({
            type: "image",
            mimeType: image.mimeType,
            data: image.data
        }))
    ]
    : prompt;

    const history = [
        {
            role: "user",
            content: userContent
        }
    ];

    let totalToolCalls = 0;

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        let response;
        try {
            response = await provider.generate({
                history,
                systemInstruction,
                tools: getToolDefinitions()
            });
        } catch (error) {
            const failure = describeError(error);
            
            onEvent({
                type: "provider_failed",
                errorType: failure.name,
                error: failure.message
            });

            throw new Error(
                `AI provider request failed: ${failure.message}`
            );
        }

        const functionCalls = response.toolCalls || [];

        if (functionCalls.length === 0) {
            return response.text || "Task completed.";
        }

        if (functionCalls.length > MAX_TOOL_CALLS_PER_STEP) {
            throw new Error("Too many tool calls in one response.");
        }

        totalToolCalls += functionCalls.length;

        if (totalToolCalls > 30) {
            throw new Error(
                "Agent exceeded the maximum number of tool calls."
            );
        }

        history.push({
            role: "assistant",
            content: response.text || null,
            toolCalls: functionCalls
        });

        for (const functionCall of functionCalls) {
            const args = functionCall.args || {};
            const callKey = getToolCallKey(
                functionCall.name,
                args
            );

            let result;

            if (completedCalls.has(callKey)) {
                if (isMutating(functionCall.name)) {
                    return (
                        `I stopped because the capability ` +
                        `"${functionCall.name}" was already completed ` +
                        "with the same arguments."
                    );
                }

                result = completedCalls.get(callKey);
            } else if (failedCalls.has(callKey)) {
                result = {
                    ok: false,
                    retryable: false,
                    alreadyFailed: true,
                    error:
                        `This exact capability call already failed: ` +
                        `"${functionCall.name}". Try corrected arguments ` +
                        "or use another approach."
                };
            } else {
                if (isMutating(functionCall.name)) {
                    completedCalls.clear();
                }

                const startedAt = Date.now();
                
                try {
                    onEvent({
                        type: "tool_started",
                        name: functionCall.name,
                        args,
                        step: step + 1
                    });

                    result = await executeCapability(
                        functionCall.name,
                        args
                    );

                    const durationMs = Date.now() - startedAt;
                    const succeeded = result?.ok !== false;
                    
                    void logCapability({
                        capabilityName: functionCall.name,
                        args,
                        status: succeeded ? "success" : "error",
                        result: null,
                        errorName: succeeded
                            ? null
                            : "CapabilityReturnedError",
                        errorMessage: succeeded
                            ? null
                            : result?.error || "Capability returned ok: false",
                        durationMs,
                        agentStep: step + 1
                    });

                    if (
                        isCacheable(functionCall.name) ||
                        isMutating(functionCall.name)
                    ) {
                        if (result?.ok !== false) {
                            completedCalls.set(callKey, result);
                        }
                    }

                    onEvent({
                        type: "tool_finished",
                        name: functionCall.name,
                        result
                    });
                } catch (error) {
                    failedCalls.add(callKey);
                    
                    const failure = describeError(error);
                    const durationMs = Date.now() - startedAt;

                    void logCapability({
                        capabilityName: functionCall.name,
                        args,
                        status: "error",
                        result: null,
                        errorName: failure.name,
                        errorMessage: failure.message,
                        durationMs,
                        agentStep: step + 1
                    });

                    result = {
                        ok: false,
                        tool: functionCall.name,
                        retryable: false,
                        errorType: failure.name,
                        error: failure.message,
                        recovery:
                            "Inspect the error. Retry only with corrected " +
                            "arguments, or use another capability."
                    };

                    onEvent({
                        type: "tool_failed",
                        name: functionCall.name,
                        errorType: failure.name,
                        error: failure.message
                    });
                }
            }

            history.push({
                role: "tool",
                toolCallId: functionCall.id,
                name: functionCall.name,
                result
            });
        }
    }

    throw new Error(
        "Agent exceeded the maximum number of reasoning steps."
    );
}

export async function sendMessage(
    userMessage,
    {
        images = [],
        image = null,
        onEvent = () => {},
        onApproval = null
    } = {},
    
) {
    const imageList =
        images.length > 0
            ? images
            : image
                ? [image]
                : [];
    const trimmedMessage =
        typeof userMessage === "string"
            ? userMessage.trim()
            : "";

    if (!trimmedMessage && imageList.length === 0) {
        throw new Error("A message or image is required.");
    }

    const effectiveMessage = trimmedMessage ||
        "Please inspect the attached image(s).";

   const imageReferences = imageList
        .filter(item => item.id)
        .map(item => ({
            id: item.id,
            mimeType: item.mimeType,
            url: item.url
        }));

    updateShortTermMemory(
        "user",
        trimmedMessage || "Image attached for analysis.",
        imageReferences.length > 0
            ? { images: imageReferences }
            : {}
    );
    
    let longTermMemories = [];

    if (longTermMemoryAvailable) {
        try {
            const retrievalQuery = [
                effectiveMessage,
                ...shortTermMemory.messages
                    .filter(message => message.role === "user")
                    .slice(-3)
                    .map(message => message.content)
            ].join(" ");

            longTermMemories = await getLongTermMemories(
                retrievalQuery,
                12
            );
        } catch (error) {
            const failure = describeError(error);

            onEvent({
                type: "memory_retrieval_failed",
                errorType: failure.name,
                error: failure.message
            });

            longTermMemories = [];
        }
    }

    const prompt = buildChatPrompt(
        effectiveMessage,
        longTermMemories
    );

    const systemInstruction = buildJasonSystemPrompt({
        currentTask: shortTermMemory.currentTask,
        recentTopics: shortTermMemory.recentTopics
    });

    let selectedProvider;
    try {
        selectedProvider = await getProviderForRequest(
            effectiveMessage
        );
    } catch (error) {
        const failure = describeError(error);

        onEvent({
            type: "provider_selection_failed",
            errorType: failure.name,
            error: failure.message
        });

        throw new Error(
            `Provider selection failed: ${failure.message}`
        );
    }

    onEvent({
        type: "provider_selected",
        name: selectedProvider.name
    });

    const assistantReply = await runAgent(
        prompt,
        systemInstruction,
        selectedProvider.provider,
        imageList,
        onEvent
    );

    let memoryDecision = {
        action: "none",
        key: null,
        category: null,
        content: null,
        importance: null,
        confidence: null
    };

    if (longTermMemoryAvailable) {
        try {
            memoryDecision = await evaluateLongTermMemory(
                effectiveMessage,
                shortTermMemory.messages.slice(-8),
                longTermMemories
            );
    } catch (error) {
        const failure = describeError(error);

            onEvent({
                type: "memory_evaluation_failed",
                errorType: failure.name,
                error: failure.message
            });
        }
    }

    if (
        longTermMemoryAvailable &&
        memoryDecision.action === "delete" &&
        memoryDecision.key
    ) {
        try {
            await deleteLongTermMemory(
                memoryDecision.key
            );
        } catch (error) {
            const failure = describeError(error);

            onEvent({
                type: "memory_delete_failed",
                errorType: failure.name,
                error: failure.message
            });
        }
    }

    if (
        longTermMemoryAvailable &&
        ["create", "update"].includes(memoryDecision.action) &&
        memoryDecision.key &&
        memoryDecision.category &&
        memoryDecision.content
    ) {
        try {
            await saveLongTermMemory({
                key: memoryDecision.key,
                category: memoryDecision.category,
                content: memoryDecision.content,
                importance: memoryDecision.importance,
                confidence: memoryDecision.confidence
            });
        } catch (error) {
            const failure = describeError(error);

            onEvent({
                type: "memory_save_failed",
                errorType: failure.name,
                error: failure.message
            });
        }
    }

    updateShortTermMemory("assistant", assistantReply);
    try {
        await saveShortTermMemory();
    } catch (error) {
        const failure = describeError(error);

        onEvent({
            type: "short_term_memory_save_failed",
            errorType: failure.name,
            error: failure.message
        });
    }

    onEvent({
        type: "message_completed",
        reply: assistantReply
    });

    return {
        reply: assistantReply,
        provider: selectedProvider.name
    };
}
    let longTermMemoryAvailable = false;

export async function initializeJason() {
    try {
        await loadShortTermMemory();
    } catch (error) {
        const failure = describeError(error);

        throw new Error(
            `Short-term memory initialization failed: ` +
            failure.message
        );
    }

    try {
        const database = await checkDatabaseConnection();

        longTermMemoryAvailable =
            database.table_name === "long_term_memories";

        if (!longTermMemoryAvailable) {
            console.warn(
                "Long-term memory disabled: " +
                "long_term_memories table was not found."
            );
        }
    } catch (error) {
        const failure = describeError(error);

        longTermMemoryAvailable = false;

        console.warn(
            "Long-term memory disabled:",
            failure.message
        );
    }

    return {
        longTermMemoryAvailable
    };
}

export async function shutdownJason() {
    try {
        await saveShortTermMemory();
    } catch (error) {
        const failure = describeError(error);

        throw new Error(
            `Shutdown memory save failed: ${failure.message}`
        );
    }
}