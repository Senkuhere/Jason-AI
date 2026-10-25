// delivery.js: says something to the user on the page they are looking at right now.
// Used by the daily briefing, the evening review and anything else Jason says on his own.
import { listClients, sendToClient } from "../push-channel.js";
import { updateShortTermMemory, saveShortTermMemory } from "../memory.js";
import { logEvent } from "../daylog.js";

const envNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
};

const REPORT_FRESH_SECONDS = envNumber("INITIATIVE_REPORT_FRESH_SECONDS", 60);

// The open page the user is most likely looking at (null if nobody is there).
// maxIdleSeconds: how long the user may have left it alone and still count as "there".
export function presentClient(maxIdleSeconds = 300) {
    const now = Date.now();

    const candidates = listClients().filter(client =>
        now - client.presenceAt < REPORT_FRESH_SECONDS * 1000 &&
        client.visible &&
        client.idleSeconds < maxIdleSeconds
    );

    candidates.sort((a, b) => a.idleSeconds - b.idleSeconds);
    return candidates[0] || null;
}

// Sends the text to that page, and makes Jason remember he said it (so "okay, thanks" makes sense later).
export async function deliverToUser(text, { kind = "message", client = presentClient() } = {}) {
    if (!client) return { ok: false, reason: "nobody is at the computer" };
    if (!sendToClient(client.clientId, { type: "initiative", text })) return { ok: false, reason: "the page did not accept it" };

    updateShortTermMemory("assistant", text);
    await saveShortTermMemory();
    logEvent(kind, text);

    return { ok: true, device: client.device };
}
