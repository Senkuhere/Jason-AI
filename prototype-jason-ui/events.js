// events.js: this page's live connection to Jason's server.
//  - gives this device an id
//  - listens for messages the server pushes (early sentences like "Opening Facebook, Sir.")
//  - reports presence, so Jason knows which device you are actually using
(function () {
    'use strict';

    // ---------- This device's identity ----------
    // Made up once per browser and remembered, so the server can tell the laptop from the phone
    let clientId = localStorage.getItem('jason_client_id');

    if (!clientId) {
        const random = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now().toString(16) + Math.random().toString(16).slice(2);

        clientId = random.replace(/[^\w-]/g, '');
        localStorage.setItem('jason_client_id', clientId);
    }

    // script.js adds this to every message it sends
    window.jasonClientId = clientId;

    // A touch screen narrower than a laptop is treated as a phone
    const device =
        window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1081
            ? 'phone'
            : 'laptop';

    // ---------- The live connection ----------
    function handleMessage(data) {
        if (data.type === 'say') {
            // Jason started an action: speak his short sentence now
            if (window.jasonVoice && typeof window.jasonVoice.speakEarly === 'function') {
                window.jasonVoice.speakEarly(String(data.text || ''));
            }
        }
        if (data.type === 'initiative') {
            // Jason has something to say on his own
            if (window.jasonVoice && typeof window.jasonVoice.receiveInitiative === 'function') {
                window.jasonVoice.receiveInitiative(String(data.text || ''));
            }
        }
        if (data.type === 'reply_delta') {
            // A piece of Jason's answer, while he is still writing it
            if (window.jasonVoice && typeof window.jasonVoice.receiveDelta === 'function') {
                window.jasonVoice.receiveDelta(String(data.text || ''));
            }
        }
        if (data.type === 'reply_abort') {
            // What was streamed turned out not to be the final answer: forget it
            if (window.jasonVoice && typeof window.jasonVoice.abortStream === 'function') {
                window.jasonVoice.abortStream();
            }
        }
        // "hello" only confirms the connection.
    }

    function connect() {
        // EventSource reconnects by itself if the connection drops (for example when Jason restarts)
        const source = new EventSource(
            `/api/events?clientId=${encodeURIComponent(clientId)}&device=${device}`
        );

        source.onopen = () => console.log(`[events] connected as ${device}`);

        source.onmessage = event => {
            let data;

            try {
                data = JSON.parse(event.data);
            } catch (error) {
                return;
            }

            handleMessage(data);
        };

        source.onerror = () => console.log('[events] connection lost, retrying…');
    }

    if (window.EventSource) connect();

    // ---------- Presence: is this device being used? ----------
    let lastInteraction = Date.now();

    ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'].forEach(name => {
        window.addEventListener(name, () => { lastInteraction = Date.now(); }, { passive: true });
    });

    function sendPresence() {
        fetch('/api/presence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
                clientId,
                visible: document.visibilityState === 'visible',
                focused: document.hasFocus(),
                idleSeconds: Math.round((Date.now() - lastInteraction) / 1000),
                handsFree: localStorage.getItem('jason_handsfree') === 'true'
            })
        }).catch(() => { /* the server may be off: nothing to report to */ });
    }

    setInterval(sendPresence, 15000);                       // every 15 seconds
    document.addEventListener('visibilitychange', sendPresence);
    window.addEventListener('focus', sendPresence);
    window.addEventListener('blur', sendPresence);
    sendPresence();
})();