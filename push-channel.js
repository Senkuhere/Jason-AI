// push-channel.js: lets the server send messages to Jason's web pages at any time.
// It uses "Server-Sent Events": each page opens one long-lived connection, and the server writes into it.

// Every connected page: clientId -> { response, device, presence... }
const clients = new Map();

// Closes a connection without caring if it is already closed
function closeQuietly(response) {
    try { response.end(); } catch (error) { /* already closed */ }
}

// Called when a page connects. The connection then stays open.
export function openChannel(clientId, device, response) {
    response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"          // stops proxies from holding messages back
    });

    // If the connection drops, the browser reconnects by itself after 2 seconds
    response.write("retry: 2000\n\n");

    // One page (clientId) has only one connection: a new one replaces an old one
    const existing = clients.get(clientId);
    if (existing) closeQuietly(existing.response);

    clients.set(clientId, {
        clientId,
        device,                       // "laptop" or "phone"
        response,
        connectedAt: Date.now(),
        // What the page reports about itself (used later so Jason knows where you are)
        visible: true,
        focused: false,
        idleSeconds: 0,
        handsFree: false,
        presenceAt: Date.now()
    });

    console.log(`[push] ${device} connected (${clientId.slice(0, 6)})`);

    // A small "ping" every 20 seconds keeps proxies (such as Tailscale) from closing a quiet connection
    const heartbeat = setInterval(() => {
        try { response.write(": ping\n\n"); } catch (error) { /* the close handler cleans up */ }
    }, 20_000);

    response.on("close", () => {
        clearInterval(heartbeat);

        // Only remove it if it is still the current connection for this page
        if (clients.get(clientId)?.response === response) {
            clients.delete(clientId);
            console.log(`[push] ${device} disconnected (${clientId.slice(0, 6)})`);
        }
    });

    sendToClient(clientId, { type: "hello" });
}

// Sends one message to one page. Returns true if it was written.
export function sendToClient(clientId, event) {
    const client = clients.get(clientId);

    if (!client) return false;

    try {
        client.response.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
    } catch (error) {
        return false;
    }
}

// Sends one message to every connected page
export function broadcast(event) {
    for (const clientId of clients.keys()) {
        sendToClient(clientId, event);
    }
}

// A page tells us whether it is visible, focused, and how long since you touched it
export function updatePresence(clientId, report) {
    const client = clients.get(clientId);

    if (!client) return;

    client.visible = Boolean(report.visible);
    client.focused = Boolean(report.focused);
    client.idleSeconds = Number(report.idleSeconds) || 0;
    client.handsFree = Boolean(report.handsFree);
    client.presenceAt = Date.now();
}

// Everything we know about the connected pages (step 4 uses this)
export function listClients() {
    return [...clients.values()].map(client => ({
        clientId: client.clientId,
        device: client.device,
        visible: client.visible,
        focused: client.focused,
        idleSeconds: client.idleSeconds,
        handsFree: client.handsFree,
        presenceAt: client.presenceAt
    }));
}   