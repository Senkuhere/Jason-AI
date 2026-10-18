import "dotenv/config";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// ---- Models to test ----
const OPENAI_MODELS = [
    "gpt-5-mini"
];

const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
];

// ---- Benchmark settings ----
const RUNS = 1;
const TIMEOUT_MS = 20_000;

// ---- API clients ----
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: TIMEOUT_MS
});

const gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
        timeout: TIMEOUT_MS,
        retryOptions: {
            attempts: 1
        }
    }
});

// ---- Timing helper ----
async function timed(label, fn) {
    const start = Date.now();

    try {
        const result = await fn();
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);

        console.log(
            `${label.padEnd(36)} ${elapsed}s SUCCESS`
        );

        return {
            label,
            seconds: Number(elapsed),
            status: "SUCCESS"
        };
    } catch (error) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(2);

        console.log(
            `${label.padEnd(36)} ${elapsed}s FAILED`
        );

        console.log(
            "   Error:",
            String(error.message).slice(0, 200)
        );

        return {
            label,
            seconds: Number(elapsed),
            status: "FAILED",
            error: error.message
        };
    }
}

// ---- Store benchmark results ----
const results = [];

// ---- 1. Check OpenAI connection ----
if (OPENAI_MODELS.length > 0) {
    await timed("OpenAI API connection", async () => {
        const response = await fetch(
            "https://api.openai.com/v1/models",
            {
                headers: {
                    Authorization:
                        `Bearer ${process.env.OPENAI_API_KEY}`
                },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    });
}

// ---- 2. Test OpenAI models ----
for (const model of OPENAI_MODELS) {
    for (let run = 1; run <= RUNS; run++) {
        const result = await timed(
            `OpenAI ${model} (run ${run})`,
            () =>
                openai.chat.completions.create({
                    model,
                    messages: [
                        {
                            role: "user",
                            content: "Reply with exactly: hi"
                        }
                    ],
                    max_completion_tokens: 20
                })
        );

        results.push(result);
    }
}

// ---- 3. Test Gemini models ----
for (const model of GEMINI_MODELS) {
    for (let run = 1; run <= RUNS; run++) {
        const result = await timed(
            `Gemini ${model} (run ${run})`,
            async () => {
                const response =
                    await gemini.models.generateContent({
                        model,
                        contents: "Reply with exactly: hi",
                        config: {
                            maxOutputTokens: 20
                        }
                    });

                // Make sure a response was actually generated.
                if (!response.text) {
                    throw new Error("Empty response");
                }

                return response;
            }
        );

        results.push(result);
    }
}

// ---- 4. Summary ----
console.log("\n========== BENCHMARK SUMMARY ==========");

for (const result of results) {
    console.log(
        `${result.label.padEnd(36)} ` +
        `${result.seconds.toFixed(2)}s ` +
        `${result.status}`
    );
}

const successful = results
    .filter(result => result.status === "SUCCESS")
    .sort((a, b) => a.seconds - b.seconds);

console.log("\n========== FASTEST SUCCESSFUL MODELS ==========");

if (successful.length === 0) {
    console.log("No successful model requests.");
} else {
    for (const result of successful) {
        console.log(
            `${result.label}: ${result.seconds.toFixed(2)}s`
        );
    }
}

console.log("\nBenchmark complete.");
