import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import readline from "readline";
import { buildJasonSystemPrompt } from "./personality.js";
import { toolDefinitions } from "./file_tools/tool-definitions.js";
import { executeTool } from "./file_tools/tool-router.js";

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


const MAX_AGENT_STEPS = 10;
const MAX_TOOL_CALLS_PER_STEP = 8;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
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



function getToolCallKey(name, args) {
    return `${name}:${JSON.stringify(args ?? {})}`;
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
        model: "gemini-3.5-flash-lite",
        contents: evaluationPrompt
    });

    return parseMemoryDecision(response.text || "");
}

// THIS FUNCTION RUNS THE AGENT LOOP, HANDLING TOOL CALLS AND RESPONSES
async function localToolsAgent(prompt, systemInstruction, provider) {
    const failedCalls = new Set();
    const completedCalls = new Map();

    const CACHEABLE_TOOLS = new Set([
    "calculator",
    "get_current_date",
    "get_weather",
    "search_web",
    "read_project_file",
    "list_project_directory"
]);

    const MUTATING_TOOLS = new Set([
        "write_project_file",
        "edit_project_file",
        "append_project_file",
        "create_folder_directory"
    ]);

    const history = [
        {
            role: "user",
            content: prompt
        }
    ];

    let totalToolCalls = 0;

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        const response = await provider.generate({
            history,
            systemInstruction,
            tools: toolDefinitions
        });

        const functionCalls = response.toolCalls || [];

        if (functionCalls.length === 0) {
            return response.text || "Task completed.";
        }

        if (functionCalls.length > MAX_TOOL_CALLS_PER_STEP) {
            throw new Error("Too many tool calls in one response.");
        }

        totalToolCalls += functionCalls.length;

        if (totalToolCalls > 30) {
            throw new Error("Agent exceeded the maximum number of tool calls.");
        }

        history.push({
            role: "assistant",
            content: response.text || null,
            toolCalls: functionCalls
        });


        for (const functionCall of functionCalls) {
            const args = functionCall.args || {};
            const callKey = getToolCallKey(functionCall.name, args);

            let result;
            
            if (completedCalls.has(callKey)) {
                if (MUTATING_TOOLS.has(functionCall.name)) {
                    return (
                        `I stopped because the file tool "${functionCall.name}" ` +
                        "was already completed with the same arguments."
                    );
                }
                result = completedCalls.get(callKey);
            } 
            else if (failedCalls.has(callKey)) {
                result = {
                    ok: false,
                    retryable: false,
                    alreadyFailed: true,
                    error:
                        `This exact tool call already failed: ` +
                        `"${functionCall.name}". Do not repeat it. ` +
                        "Try corrected arguments or use another approach."
                };
            } 
        else {
            if (MUTATING_TOOLS.has(functionCall.name)) {
                completedCalls.clear();
            }

            try {
                console.log("Jason requested tool:", functionCall.name);
                console.log(`Agent reasoning step: ${step + 1}`);
                console.log("Arguments:", functionCall.args);

                result = await executeTool(
                    functionCall.name,
                    functionCall.args || {}
                );
                if (
                    CACHEABLE_TOOLS.has(functionCall.name) ||
                    MUTATING_TOOLS.has(functionCall.name)                      
                ) {
                    if (result?.ok !== false) {
                        completedCalls.set(callKey, result);
                    }
                }
            } catch (error) {
                failedCalls.add(callKey);
                result = {
                    ok: false,
                    retryable: false,
                    error: error.message,
                    recovery:
                    "Inspect the error. Retry only with corrected arguments, " +
                    "or use another tool or approach."
                };
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

    throw new Error("Agent exceeded the maximum number of reasoning steps.");
}
// THIS FUNCTION HANDLES THE CHAT LOOP WITH THE USER
function chat() {
    // Prompt the user for input
    rl.question("You: ", async function(message) { 
        const trimmedMessage = message.trim();

        // Handle the "exit" command to terminate the chat
        if (trimmedMessage.toLowerCase() === "exit") {
            await saveShortTermMemory();

            rl.close();
            console.log("Jason is offline.");
            process.exit(0);
        }
        // If the message is empty, continue the chat loop
        if (!trimmedMessage) {
            chat();
            return;
        }
        // Process the user's message and generate a response
        try {
            updateShortTermMemory("user", trimmedMessage);
            const longTermMemories = await getLongTermMemories(
                trimmedMessage,
                5
            );

            const prompt = buildChatPrompt(
                trimmedMessage,
                longTermMemories
            );

           
            // Build the system instruction with the current task, recent topics, and current date
            const systemInstruction = buildJasonSystemPrompt({
                currentTask: shortTermMemory.currentTask,
                recentTopics: shortTermMemory.recentTopics
            });

            const selectedProvider = await getProviderForRequest(
                trimmedMessage
            );

            console.log(`Selected provider: ${selectedProvider.name}`);
            // Execute the local tools agent with the prompt and system instruction
            const assistantReply = await localToolsAgent(
                prompt,
                systemInstruction,
                selectedProvider.provider
            );

            // Evaluate whether the user's message contains durable information worth saving in long-term memory
            const memoryDecision = await evaluateLongTermMemory(
                trimmedMessage,
                shortTermMemory.messages.slice(-8),
                longTermMemories
            );

           if (memoryDecision.action === "delete" && memoryDecision.key) {
                const deletedMemory = await deleteLongTermMemory(
                    memoryDecision.key
                );

                if (!deletedMemory) {
                    console.log(
                        "No memory found for key:",
                        memoryDecision.key
                    );
                } else {
                    console.log(
                        "Deleted memory:",
                        deletedMemory.memory_key
                    );
                }
            }
            // If the decision is to save, store the information in long-term memory
            if (
                ["create", "update"].includes(memoryDecision.action) &&
                memoryDecision.key &&
                memoryDecision.category &&
                memoryDecision.content
            ) {
                await saveLongTermMemory({
                    key: memoryDecision.key,
                    category: memoryDecision.category,
                    content: memoryDecision.content,
                    importance: memoryDecision.importance,
                    confidence: memoryDecision.confidence
                });
            }
            // Update the short-term memory with the assistant's reply and save it
            updateShortTermMemory("assistant", assistantReply);
            await saveShortTermMemory();
            
            console.log("Jason:", assistantReply);
        } catch (error) {
            console.error("Error in chat:", error.message);
        }
        // Continue the chat loop
        chat();
    });
}
// THIS FUNCTION INITIALIZES THE AGENT, LOADS MEMORY, AND STARTS THE CHAT LOOP
async function start() {
    await loadShortTermMemory();
    // Check the database connection and ensure the long_term_memories table exists
    try {
        const database = await checkDatabaseConnection();

        if (database.table_name !== "long_term_memories") {
            throw new Error("long_term_memories table was not found");
        }
        console.log("Database connected.");
        console.log("Jason is online.");
        console.log("Type 'exit' to stop.\n");

        chat();
    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
}
// Start Jason AI Assistant
start();