// SHORT-TERM MEMORY -----------------------------------------------------------------------------
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEMORY_DIRECTORY = path.join(__dirname, "memory");
const MEMORY_FILE = path.join(MEMORY_DIRECTORY, "short-term.json");

const MAX_SHORT_TERM_MESSAGES = 50;

export const shortTermMemory = {
    messages: [],
    currentTask: "",
    recentTopics: [],
    summary: ""
};

export async function loadShortTermMemory() {
    try {
        const savedMemory = await fs.readFile(MEMORY_FILE, "utf8");
        const parsedMemory = JSON.parse(savedMemory);

        shortTermMemory.messages = Array.isArray(parsedMemory.messages)
            ? parsedMemory.messages
            : [];

        shortTermMemory.currentTask = parsedMemory.currentTask || "";

        shortTermMemory.recentTopics = Array.isArray(parsedMemory.recentTopics)
            ? parsedMemory.recentTopics
            : [];

        shortTermMemory.summary = parsedMemory.summary || "";
    } catch (error) {
        if (error.code !== "ENOENT") {
            console.error("Could not load short-term memory:", error.message);
        }

        await saveShortTermMemory();
    }
}

export async function saveShortTermMemory() {
    try {
        await fs.mkdir(MEMORY_DIRECTORY, { recursive: true });

        await fs.writeFile(
            MEMORY_FILE,
            JSON.stringify(shortTermMemory, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("Could not save short-term memory:", error.message);
    }
}

export function extractTopics(text) {
    if (typeof text !== "string") {
        return [];
    }
    const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];

    const stopWords = new Set([
        "the", "and", "that", "this", "with", "from", "into", "your", "have",
        "about", "just", "what", "when", "where", "they", "them", "their",
        "will", "want", "need", "like", "make", "help", "been", "more",
        "very", "some", "could", "would", "should", "please", "tell"
    ]);

    const topics = words.filter(word => {
        return !stopWords.has(word) && word.length > 4;
    });

    return [...new Set(topics)].slice(0, 6);
}

export function buildSummary(messages) {
    const recent = messages.slice(-8);

    return recent
        .map(message => `${message.role}: ${message.content}`)
        .join(" | ")
        .slice(0, 500);
}

export function updateShortTermMemory(role, content) {
    shortTermMemory.messages.push({
        role,
        content,
        timestamp: new Date().toISOString()
    });

    if (shortTermMemory.messages.length > MAX_SHORT_TERM_MESSAGES) {
        shortTermMemory.messages =
            shortTermMemory.messages.slice(-MAX_SHORT_TERM_MESSAGES);
    }

    const topicList = extractTopics(content);

    for (const topic of topicList) {
        if (!shortTermMemory.recentTopics.includes(topic)) {
            shortTermMemory.recentTopics.push(topic);
        }
    }

    if (shortTermMemory.recentTopics.length > 8) {
        shortTermMemory.recentTopics =
            shortTermMemory.recentTopics.slice(-8);
    }

    const lastUserMessage = [...shortTermMemory.messages]
        .reverse()
        .find(message => message.role === "user");

    if (lastUserMessage) {
        shortTermMemory.currentTask = lastUserMessage.content;
    }

    if (shortTermMemory.messages.length >= 6) {
        shortTermMemory.summary = buildSummary(shortTermMemory.messages);
    }
}
// SHORT-TERM MEMORY -----------------------------------------------------------------------------
export function buildChatPrompt(latestUserMessage, longTermMemories = []) {
    const longTermSection = longTermMemories.length
        ? longTermMemories
            .map(memory =>
                `- ${memory.category}: ${memory.content}`
            )
            .join("\n")
        : "No long-term memories available.";

    return [
        "You are continuing an active conversation with the user.",
        "Use long-term memories only when relevant.",
        "Do not mention the memory system.",
        "",
        "Long-term memories:",
        longTermSection,
        "",
        `Current task: ${shortTermMemory.currentTask || "No current task yet."}`,
        `Recent topics: ${
            shortTermMemory.recentTopics.length
                ? shortTermMemory.recentTopics.join(", ")
                : "None yet"
        }`,
        `Recent summary: ${shortTermMemory.summary || "No summary yet."}`,
        "",
        "Recent conversation:",
        ...shortTermMemory.messages
            .slice(-8)
            .map(message => `${message.role}: ${message.content}`),
        "",
        `Latest user message: ${latestUserMessage}`
    ].join("\n");
}


