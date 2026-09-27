import { GoogleGenAI } from "@google/genai";
import readline from "readline";
import {
    loadShortTermMemory,
    saveShortTermMemory,
    updateShortTermMemory,
    buildChatPrompt
} from "./memory.js";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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
            const prompt = buildChatPrompt(trimmedMessage);

            const response = await ai.models.generateContent({
                model: "gemini-3.5-flash-lite",
                contents: prompt
            });

            const assistantReply = response.text;

            updateShortTermMemory("assistant", assistantReply);
            await saveShortTermMemory();
            console.log("Memory saved");
            console.log("Jason:", assistantReply);
        } catch (error) {
            console.error("Error in chat:", error.message);
        }

        chat();
    });
}

async function start() {
    await loadShortTermMemory();

    console.log("Jason is online.");
    console.log("Type 'exit' to stop.\n");

    chat();
}

start();