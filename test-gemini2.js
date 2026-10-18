import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: key });

async function time(label, fn) {
    const start = Date.now();
    try {
        const out = await fn();
        console.log(label.padEnd(24), `${((Date.now() - start) / 1000).toFixed(1)}s OK`, out ?? "");
    } catch (error) {
        console.log(label.padEnd(24), `${((Date.now() - start) / 1000).toFixed(1)}s FAILED:`, error.message);
    }
}

// 1. Plain HTTP to Google, no SDK: lists models, shows if your network is slow
await time("raw HTTP (list models)", async () => {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`
    );
    return `status ${res.status}`;
});

// 2. Your current model through the SDK
await time("current model", () =>
    ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: "Say hi"
    })
);

// 3. A different model for comparison. Swap in any model you know exists.
await time("gemini-2.5-flash-lite", () =>
    ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: "Say hi"
    })
);

process.exit(0);