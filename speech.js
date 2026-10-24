import { GoogleGenAI } from "@google/genai";

// Same Gemini key Jason already uses
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Which model listens to the recording. Set GEMINI_STT_MODEL in .env to change it.
const STT_MODEL = process.env.GEMINI_STT_MODEL || "gemini-3.1-flash-lite";

// Longest recording accepted, as the length of its base64 text (about 6 MB of audio, around 3 minutes)
const MAX_AUDIO_CHARACTERS = 8_000_000;

// Give up on a transcription after this long
const STT_TIMEOUT_MS = 20_000;

// Tells Gemini what the audio is. Jason's owner mixes English and Tagalog, so words must not be translated.
const TRANSCRIBE_PROMPT = `
Transcribe the speech in this audio exactly as it was spoken.
The speaker is giving a voice command or chatting with a personal assistant named Jason.
The speaker may mix English and Tagalog (Taglish). Keep every word in the language it was spoken in. Never translate.
Song titles, artist names, and app names may appear: write them the way they are normally spelled.
Use normal punctuation and capital letters.
Output ONLY the transcript, with no quotes, notes, or explanations.
If there is no clear speech, output exactly: [no speech]
`;

// Errors worth one more try: rate limits, server trouble, network hiccups
function isTransient(error) {
    const status = Number(error?.status ?? error?.code);

    return (
        status === 429 ||
        status >= 500 ||
        /timeout|timed out|ECONN|fetch failed|overloaded|unavailable|RESOURCE_EXHAUSTED/i
            .test(String(error?.message))
    );
}

// Waits for a promise, but fails if it takes too long (and cleans up the timer either way)
function withTimeout(promise, milliseconds) {
    let timer;

    const timeout = new Promise((_, reject) => {
        timer = setTimeout(
            () => reject(new Error("The transcription timed out.")),
            milliseconds
        );
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// audio is { mimeType: "audio/wav", data: "<base64>" }. Returns the text that was said ("" if nothing).
export async function transcribeAudio(audio) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured.");
    }

    // Check what the browser sent before spending anything on it
    if (!audio || typeof audio !== "object") {
        throw new Error("No audio was received.");
    }

    if (audio.mimeType !== "audio/wav") {
        throw new Error("Only WAV audio is supported.");
    }

    if (typeof audio.data !== "string" || audio.data.length === 0) {
        throw new Error("The audio data is missing.");
    }

    if (audio.data.length > MAX_AUDIO_CHARACTERS) {
        throw new Error("The recording is too long.");
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const response = await withTimeout(
                ai.models.generateContent({
                    model: STT_MODEL,
                    contents: [
                        {
                            role: "user",
                            parts: [
                                // The recording itself
                                { inlineData: { mimeType: "audio/wav", data: audio.data } },
                                // What to do with it
                                { text: TRANSCRIBE_PROMPT }
                            ]
                        }
                    ],
                    config: {
                        // Listening needs very little thinking, and less thinking is faster
                        thinkingConfig: {
                            thinkingLevel: process.env.GEMINI_STT_THINKING || "MINIMAL"
                        }
                    }
                }),
                STT_TIMEOUT_MS
            );

            const text = (response.text || "").trim();

            // The model reports silence with this marker
            if (/^\[no speech\]$/i.test(text)) {
                return "";
            }

            // Remove quotes the model sometimes adds around the transcript
            return text.replace(/^["“]+|["”]+$/g, "").trim();
        } catch (error) {
            // Retry once for temporary problems, then give up with the real error
            if (attempt === 2 || !isTransient(error)) {
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, 600));
        }
    }
}