import { GoogleGenAI } from "@google/genai";
import { buildJasonSystemPrompt, 
         buildLiveContext 
    }    from "./personality.js";
import { getCurrentDate } from "./utility_tools/utility.js";

// The day's story: what the user did earlier, and what is coming up (see daylog.js)
import { buildAwarenessText, 
         logUserMessage 
} from "./daylog.js";

import {
    getToolDefinitions,
    executeCapability,
    isCacheable,
    isMutating,
    getInstantReply
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

// Background awareness: the active window, open windows and monitor layout
import { startScreenAwareness,
         getScreenContext 
        } from "./utility_tools/computer-control.js";

import { logCapability } from "./capability-logger.js";

import { startInitiative, 
         noteRequestStarted, 
         noteRequestFinished } 
from "./initiative.js";

// Tells you when a reminder from Jason's notebook comes due
import { startReminders } from "./reminders.js";

import { startRhythm } from "./daily/rhythm.js";

// Keeps the story of the user's day (what is open on the computer, and when)
import { startDayLog } from "./daylog.js";

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
        model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
        contents: evaluationPrompt
    });

    return parseMemoryDecision(response.text || "");
}

function getToolCallKey(name, args) {
    return `${name}:${JSON.stringify(args ?? {})}`;
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
    // Becomes true if any tool failed or was refused during this request
    let hadProblem = false;

    // Tools that failed during the most recent tool step (name -> reason). Used to add an honest
    // note to the final reply if the model's wording does not match what really happened.
    const unresolvedFailures = new Map();

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
        const llmStartedAt = Date.now(); // this checks the time taken for the LLM to respond
        onEvent({ type: "llm_started", 
                  name: `step ${step + 1} (${Date.now() - llmStartedAt}ms)` 
            });
         // Streaming: the text Jason writes is passed on, piece by piece, while it is still being written
        let streamedText = "";   // everything streamed during THIS step
        let stepOpen = true;     // false once the step is over, so late text from a slower duplicate request is ignored
        let pieceCount = 0;      // how many pieces of text arrived (diagnostic)
        try {
            response = await provider.generate({
                history,
                systemInstruction,
                tools: getToolDefinitions(),
                onText: delta => {
                    if (!stepOpen) return;
                    streamedText += delta;
                    pieceCount++;
                    if (pieceCount === 1) console.log(`[stream] first piece of text after ${Date.now() - llmStartedAt}ms`);
                    onEvent({ type: "reply_delta", text: delta });
                }
            });
            stepOpen = false;
            if (pieceCount > 0) console.log(`[stream] ${pieceCount} pieces in total, step finished after ${Date.now() - llmStartedAt}ms`);
            onEvent({ type: "llm_finished", 
                      name: `(${Date.now() - llmStartedAt}ms)` 
                    });
        } catch (error) {
            stepOpen = false;
            // Text was already shown but the step failed: tell the page to remove it
            if (streamedText) onEvent({ type: "reply_abort" });
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

        
        // The streamed text must match what this step really produced. If the step went on to use tools,
        // or another provider answered instead, tell the page to throw away what it showed.
        if (
            streamedText &&
            (functionCalls.length > 0 || streamedText.trim() !== String(response.text || "").trim())
        ) {
            onEvent({ type: "reply_abort" });
        }

        if (functionCalls.length === 0) {
            let reply = response.text || "Task completed.";

            // If the last tool step ended with a failure, state it plainly, whatever the model said
            if (unresolvedFailures.size > 0) {
                const notes = [...unresolvedFailures].map(
                    ([tool, reason]) => `${tool} did not succeed (${reason})`
                );

                reply += `\n\n(Note: ${notes.join("; ")}.)`;
            }

            return reply;
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
        const quickReplies = [];

        // Only failures from the latest tool step count. If the model recovered, they are forgotten.
        unresolvedFailures.clear();
        
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
            // A refused or failed result means the instant-reply shortcut must not end the request
            if (result?.ok === false) {
                hadProblem = true;
                unresolvedFailures.set(functionCall.name, result.error || "it returned an error");
            }
            // Is this the last tool call in this step? Only that one decides if the request is finished.
            const isLastCall = functionCall === functionCalls[functionCalls.length - 1];

            quickReplies.push(
                getInstantReply(functionCall.name, args, result, isLastCall)
            );
        }

        // Every tool this step finished with a simple confirmation: no need to ask the model again
                // Only skip the final model call if every tool succeeded, and nothing has gone wrong so far
        if (quickReplies.length > 0 && quickReplies.every(Boolean) && !hadProblem &&failedCalls.size === 0) {
            return quickReplies.join(" ");
        }
    }

    throw new Error(
        "Agent exceeded the maximum number of reasoning steps."
    );
}

const pendingMemoryTasks = new Set();

async function processLongTermMemory(message, recentMessages, memories, onEvent) {
    let decision;

    try {
        decision = await evaluateLongTermMemory(message, recentMessages, memories);
    } catch (error) {
        const failure = describeError(error);
        onEvent({
            type: "memory_evaluation_failed",
            errorType: failure.name,
            error: failure.message
        });
        return;
    }

    try {
        if (decision.action === "delete" && decision.key) {
            await deleteLongTermMemory(decision.key);
        } else if (
            ["create", "update"].includes(decision.action) &&
            decision.key && decision.category && decision.content
        ) {
            await saveLongTermMemory({
                key: decision.key,
                category: decision.category,
                content: decision.content,
                importance: decision.importance,
                confidence: decision.confidence
            });
        }
    } catch (error) {
        const failure = describeError(error);
        onEvent({
            type: "memory_save_failed",
            errorType: failure.name,
            error: failure.message
        });
    }
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

    // Added to the day's story, so later he knows what was said and when
    // Record the message before building Jason's awareness of the day.
    await logUserMessage(trimmedMessage || "(sent an image)");

    let longTermMemories = [];

    if (longTermMemoryAvailable) {
        const longTermRetrievalStartedAt = Date.now(); // this checks the time taken for the LLM to respond
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
             onEvent({ type: "memory_retrieval_finished", name: `Long-term memory retrieval (${Date.now() - longTermRetrievalStartedAt}ms)` });
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

    // buildAwarenessText is asynchronous, so wait for the completed day summary.
    // buildLiveContext expects this value under the property name "awareness".
    const awareness = await buildAwarenessText();

    const prompt = buildLiveContext({
        currentDate: getCurrentDate(),
        screenContext: getScreenContext(),
        awareness
    }) + "\n\n" + buildChatPrompt(effectiveMessage, longTermMemories);

    const systemInstruction = buildJasonSystemPrompt();

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

    if (longTermMemoryAvailable) {
        const recentMessages = shortTermMemory.messages.slice(-8);

        const task = processLongTermMemory(
            effectiveMessage,
            recentMessages,
            longTermMemories,
            onEvent
        ).finally(() => pendingMemoryTasks.delete(task));

        pendingMemoryTasks.add(task);
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
    // Start continuous window and monitor awareness for every entry point.
    // This lets both the web interface and terminal version receive screen context.
    startScreenAwareness();
    startInitiative();
    startReminders();
    startRhythm();      // morning briefing and evening review
    startDayLog();

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
    await Promise.allSettled([...pendingMemoryTasks]);
    try {
        await saveShortTermMemory();
    } catch (error) {
        const failure = describeError(error);

        throw new Error(
            `Shutdown memory save failed: ${failure.message}`
        );
    }
}