
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const text = `
Hello. I'm Jason.

I'm here, and I'm listening.
Take your time. There's no need to rush.

Let's see how this voice feels.
`;

async function testCedar() {
    console.log("Generating Cedar's voice...");

    const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: "cedar",
        input: text,
        instructions:
            "Speak in a calm, warm, mature masculine voice with a subtly lower, fuller-sounding register. Keep the delivery natural, smooth, and conversational, with measured pacing and clear pronunciation. Sound composed, intelligent, and quietly confident. Avoid exaggerated bass, robotic effects, and dramatic narration.",
        response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    const outputPath = path.join(__dirname, "cedar-test.mp3");

    await fs.writeFile(outputPath, buffer);

    console.log(`Audio saved to: ${outputPath}`);
    console.log("Open cedar-test.mp3 to listen.");
}

testCedar().catch((error) => {
    console.error("Cedar voice test failed:", error.message);
});
