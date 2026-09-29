import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import readline from "readline";
import {
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

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


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

function chat() {

    rl.question("You: ", async function(message) {
        const trimmedMessage = message.trim();

        
        if (trimmedMessage.toLowerCase() === "exit") {
            await saveShortTermMemory();

            rl.close();
            console.log("Jason is offline.");
            process.exit(0);
        }

        if (!trimmedMessage) {
            chat();
            return;
        }
        try {
            updateShortTermMemory("user", trimmedMessage);
            const longTermMemories = await getLongTermMemories();

            const prompt = buildChatPrompt(
                trimmedMessage,
                longTermMemories
            );

            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: prompt
            });

            const assistantReply = response.text;

            const memoryDecision = await evaluateLongTermMemory(trimmedMessage);

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

            updateShortTermMemory("assistant", assistantReply);
            await saveShortTermMemory();
            
            console.log("Jason:", assistantReply);
        } catch (error) {
            console.error("Error in chat:", error.message);
        }

        chat();
    });
}

async function start() {
    await loadShortTermMemory();

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

start();