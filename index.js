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
    checkDatabaseConnection
} from "./long-term-memory.js";



const MAX_AGENT_STEPS = 6;
const MAX_TOOL_CALLS_PER_STEP = 5;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


// Run the evaluation prompt for long-term memory through the AI model
async function evaluateLongTermMemory(userMessage) {
    const evaluationPrompt = `
Determine whether this user message contains durable information worth remembering.

Save only:
- personal facts
- preferences
- goals
- decisions
- ongoing projects
- important background information

Do not save:
- greetings
- temporary emotions
- one-time questions
- casual conversation
- assistant-generated information
- information that is not about the user

Return ONLY valid JSON in this exact format:

{
  "shouldSave": true,
  "category": "personal_fact",
  "content": "The user is an IT student."
}

If it should not be saved, return:

{
  "shouldSave": false,
  "category": null,
  "content": null
}

User message:
${userMessage}
`;

    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: evaluationPrompt
    });

    const cleanedText = response.text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "");

    return JSON.parse(cleanedText);
}

// THIS FUNCTION RUNS THE AGENT LOOP, HANDLING TOOL CALLS AND RESPONSES
async function localToolsAgent(prompt, systemInstruction) {
    const contents = [
        {
            role: "user",
            parts: [{ text: prompt }]
        }
    ];

    let totalToolCalls = 0;

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
        const response = await ai.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents,
            config: {
                systemInstruction,
                tools: toolDefinitions
            }
        });

        const modelContent = response.candidates?.[0]?.content;

        const functionCalls = modelContent?.parts
            ?.filter(part => part.functionCall)
            .map(part => part.functionCall) || [];

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

        contents.push(modelContent);

        const functionResponseParts = [];

        for (const functionCall of functionCalls) {
            let result;

            try {
                console.log("Jason requested tool:", functionCall.name);
                console.log("Arguments:", functionCall.args);

                result = await executeTool(
                    functionCall.name,
                    functionCall.args || {}
                );
            } catch (error) {
                result = {
                    ok: false,
                    error: error.message
                };
            }

            functionResponseParts.push({
                functionResponse: {
                    name: functionCall.name,
                    response: {
                        result
                    }
                }
            });
        }

        contents.push({
            role: "user",
            parts: functionResponseParts
        });
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
            const longTermMemories = await getLongTermMemories();

            const prompt = buildChatPrompt(
                trimmedMessage,
                longTermMemories
            );

           
            // Build the system instruction with the current task, recent topics, and current date
            const systemInstruction = buildJasonSystemPrompt({
                currentTask: shortTermMemory.currentTask,
                recentTopics: shortTermMemory.recentTopics
            });
            // Execute the local tools agent with the prompt and system instruction
            const assistantReply = await localToolsAgent(
                prompt,
                systemInstruction
            );

            // Evaluate whether the user's message contains durable information worth saving in long-term memory
            const memoryDecision = await evaluateLongTermMemory(trimmedMessage);
            // If the decision is to save, store the information in long-term memory
            if (
                memoryDecision.shouldSave &&
                memoryDecision.category &&
                memoryDecision.content
            ) {
                await saveLongTermMemory({
                    category: memoryDecision.category,
                    content: memoryDecision.content
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