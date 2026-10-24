// handsfree.js: "Jarvis mode" for the laptop.
// Jason listens for his name, takes your command, answers out loud, and then keeps listening
// for a few seconds so you can reply without saying his name again.
// It always shows what it is doing, and writes a timing log to the browser console (F12).
(function () {
    'use strict';

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voice = window.jasonVoice;                       // created by voice.js
    const button = document.getElementById('handsFreeBtn');
    const statusLine = document.getElementById('handsFreeStatus');

    // The two page elements this script needs (from index.html)
    if (!button || !statusLine) {
        console.error('handsfree.js: the Hands-free button or its status line is missing from index.html.');
        return;
    }

    const isLaptopSized = window.matchMedia('(min-width: 1081px)').matches;

    // On a phone, hands-free makes no sense, so the button is hidden there
    if (!isLaptopSized && window.matchMedia('(pointer: coarse)').matches) {
        button.hidden = true;
        return;
    }

    // Work out why hands-free cannot run, if it cannot
    let unavailableReason = '';

    if (!voice) {
        unavailableReason = 'voice.js did not load. Check the browser console (F12) for errors.';
    } else if (
        typeof voice.onSpeaking !== 'function' ||
        typeof voice.onReply !== 'function' ||
        typeof voice.unlock !== 'function' ||
        typeof voice.isBusy !== 'function'
    ) {
        unavailableReason = 'voice.js is missing the hands-free hooks.';
    } else if (!SpeechRecognitionClass) {
        unavailableReason = 'this browser has no speech recognition. Use Chrome or Edge.';
    } else if (!isLaptopSized) {
        unavailableReason = 'the window is too narrow (under 1081 px). Widen it or zoom out.';
    }

    // Keep the button visible, and show the reason when it is clicked, instead of doing nothing
    if (unavailableReason) {
        console.warn('Hands-free unavailable: ' + unavailableReason);

        button.addEventListener('click', () => {
            statusLine.hidden = false;
            statusLine.textContent = 'Hands-free unavailable: ' + unavailableReason;
        });

        return;
    }

    // ---------- Settings ----------
    const FOLLOW_UP_SECONDS = 8;          // after Jason speaks, you can answer without saying his name
    const COMMAND_WAIT_SECONDS = 8;       // after only "Jason", how long he waits for the command
    const THINKING_TIMEOUT_SECONDS = 90;  // give up waiting for a reply after this long
    const SPEAKING_TIMEOUT_SECONDS = 45;  // give up waiting for speech to finish after this long
    const RESUME_DELAY_MS = 300;          // wait this long after Jason stops talking before listening again
    const STORAGE_KEY = 'jason_handsfree';

    // Names the speech service might write when you say "Jason"
    const NAMES = 'jason|jayson|jaison|jasen|jaysen';
    const NAME_TEST = new RegExp('\\b(?:' + NAMES + ')\\b', 'i');
    // Removes the name (and "hey" or "okay" before it) from a command
    const NAME_STRIP = new RegExp('\\b(?:(?:hey|hi|hello|okay|ok)[\\s,]+)?(?:' + NAMES + ')\\b[\\s,.:!?-]*', 'ig');

    // The recognition language. Philippine English suits your accent. For Tagalog, type this in the
    // browser console once: localStorage.setItem('jason_handsfree_lang', 'fil-PH')
    let language = localStorage.getItem('jason_handsfree_lang') || 'en-PH';

    // ---------- State ----------
    let enabled = false;          // the hands-free switch
    let state = 'off';            // 'off' | 'armed' | 'command' | 'thinking' | 'speaking' | 'followup'
    let stateSince = Date.now();  // when the current state began (for the seconds counter)
    let recognition = null;       // the browser's speech recogniser
    let running = false;          // true while the recogniser is really listening
    let wantListening = false;    // true when the recogniser should be running
    let notRunningTicks = 0;      // how long the recogniser has been dead when it should be alive
    let audioContext = null;      // used only for the little sounds
    let heardLine = '';           // second line of the status: what was heard, and what was done with it
    let sentAt = 0;               // when the last command was sent
    let replyArrived = false;     // true once Jason's reply to the last command has arrived
    let speechRunId = 0;          // counts speech runs, so an old "finished" cannot confuse a new one
    let followUpTimer = null;
    let commandTimer = null;
    let thinkingTimer = null;
    let replyWatchTimer = null;
    let speakingWatchTimer = null;
    let healthTimer = null;

    // ---------- Logging (open the browser console with F12 and look for "handsfree") ----------
    const loadedAt = Date.now();

    function log(...parts) {
        console.log(`[handsfree ${((Date.now() - loadedAt) / 1000).toFixed(1)}s]`, ...parts);
    }

    function setGlobe(globeState, seconds) {
        if (typeof window.setJasonGlobeState === 'function') {
            window.setJasonGlobeState(globeState, seconds);
        }
    }

    function clearTimers() {
        clearTimeout(followUpTimer);
        clearTimeout(commandTimer);
        clearTimeout(thinkingTimer);
        clearTimeout(replyWatchTimer);
        clearTimeout(speakingWatchTimer);
    }

    // ======================================================================
    // What is shown on screen
    // ======================================================================
    function stateText() {
        const waited = Math.round((Date.now() - stateSince) / 1000);

        switch (state) {
            case 'armed':    return 'Listening for "Jason"…';
            case 'command':  return 'Yes, Sir? Go ahead…';
            case 'thinking':
                return waited < 10
                    ? `Working on it… ${waited}s`
                    : `Still working… ${waited}s. The AI may be slow right now.`;
            case 'speaking': return 'Speaking… (press Esc to interrupt)';
            case 'followup': return 'Listening. No need to say "Jason"…';
            default:         return '';
        }
    }

    function render() {
        button.setAttribute('aria-pressed', String(enabled));
        button.textContent = enabled ? '🎧 Hands-free: on' : '🎧 Hands-free: off';

        if (state === 'off' && !heardLine) {
            statusLine.hidden = true;
            return;
        }

        // 🎤 = listening, ⏸ = paused while Jason talks, ⚠ = the listener is not running
        let icon = '';
        if (enabled) icon = state === 'speaking' ? '⏸ ' : running ? '🎤 ' : '⚠ ';

        statusLine.hidden = false;
        statusLine.textContent = [state === 'off' ? '' : icon + stateText(), heardLine]
            .filter(Boolean)
            .join('\n');
    }

    function setState(next) {
        log(`state: ${state} → ${next}`);

        state = next;
        stateSince = Date.now();

        // The globe looks "listening" while Jason is waiting for your command
        if (next === 'command' || next === 'followup') setGlobe('listening', 0.3);

        render();
    }

    // A short sound. High = accepted, low = ignored. Sounds matter because you may not be looking at the screen.
    function tone(frequency, seconds) {
        if (!audioContext) return;

        try {
            audioContext.resume();

            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.value = 0.06;

            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + seconds);
        } catch (error) {
            // no sound available, the status line still shows what happened
        }
    }

    // ======================================================================
    // The listener
    // ======================================================================
    function createRecognition() {
        const instance = new SpeechRecognitionClass();

        instance.continuous = true;        // keep listening instead of stopping after one sentence
        instance.interimResults = true;    // so the status line can show your words as you speak
        instance.lang = language;

        instance.onstart = () => {
            running = true;
            log('listener started');
            render();
        };

        instance.onresult = handleResult;

        instance.onerror = event => {
            log('listener error:', event.error);

            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                turnOff('Microphone permission was denied, so hands-free is off.');
            } else if (event.error === 'audio-capture') {
                turnOff('No microphone was found, so hands-free is off.');
            } else if (event.error === 'language-not-supported') {
                language = 'en-US';
                instance.lang = language;
            } else if (event.error === 'network') {
                heardLine = 'The speech service could not be reached (network). Retrying…';
                render();
            }
            // Other errors ("no-speech"...) end the session, and onend starts a new one
        };

        // Browsers end a listening session every so often. If we still want to listen, start again.
        instance.onend = () => {
            running = false;
            log('listener ended');
            render();

            if (wantListening && instance === recognition) {
                setTimeout(() => { if (wantListening) startListening(); }, 300);
            }
        };

        return instance;
    }

    function startListening() {
        wantListening = true;

        if (!recognition) recognition = createRecognition();

        try {
            recognition.start();
        } catch (error) {
            // already running, which is fine
        }
    }

    function stopListening() {
        wantListening = false;

        try {
            if (recognition) recognition.abort();
        } catch (error) {
            // already stopped
        }
    }

    // Throws the listener away and builds a new one (used when it gets stuck)
    function rebuildRecognition() {
        const old = recognition;

        if (old) {
            old.onresult = null;
            old.onerror = null;
            old.onend = null;
            old.onstart = null;

            try { old.abort(); } catch (error) { /* already stopped */ }
        }

        recognition = null;
        running = false;
        startListening();
    }

    // ======================================================================
    // Understanding what was said
    // ======================================================================
        // ---------- Faster end-of-sentence detection ----------
    // The browser waits for a pause, then asks its cloud service to confirm the sentence is final.
    // On a slow connection that can take seconds. Here, if your words stop changing for ENDPOINT_MS,
    // the sentence is treated as finished at once. To tune it, type in the browser console, for example:
    // localStorage.setItem('jason_endpoint_ms', '600')   (lower = faster, but may cut you off mid-pause)
    const ENDPOINT_MS = Number(localStorage.getItem('jason_endpoint_ms')) || 800;

    let endpointTimer = null;   // fires when your words have stopped changing
    let pendingText = '';       // the latest words of the sentence you are saying
    let firstWordsAt = 0;       // when the first words of this sentence appeared
    let lastWordsAt = 0;        // when the words last changed
    let lastHandled = '';       // the last sentence acted on, so its "final" copy is not acted on twice
    let lastHandledAt = 0;

    // Lower case with no punctuation: for comparing two versions of the same sentence
    const normalize = text =>
        text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    // Acts on a sentence that has just finished (by silence, or because the browser said it is final)
    function sentenceFinished(text, how) {
        clearTimeout(endpointTimer);
        pendingText = '';

        const spoke = firstWordsAt ? ((lastWordsAt - firstWordsAt) / 1000).toFixed(1) : '?';
        log(`sentence finished (${how}): "${text}" | you spoke for ${spoke}s`);
        firstWordsAt = 0;

        lastHandled = normalize(text);
        lastHandledAt = Date.now();

        handleHeard(text);

        // We acted on it early, so throw away the browser's unfinished copy. The listener restarts by itself.
        if (how === 'silence' && state === 'thinking') {
            try { recognition.abort(); } catch (error) { /* already stopped */ }
        }
    }

    function handleResult(event) {
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript.trim();

            if (!text) continue;

            const listening = state === 'armed' || state === 'command' || state === 'followup';

            if (!result.isFinal) {
                if (!listening) continue;

                const now = Date.now();
                if (!firstWordsAt) firstWordsAt = now;
                lastWordsAt = now;
                pendingText = text;

                // Your words appear while you speak: proof that the microphone and listener work
                heardLine = `Hearing: "${text}"…`;
                render();

                // Restart the "words stopped changing" countdown
                clearTimeout(endpointTimer);
                endpointTimer = setTimeout(() => sentenceFinished(pendingText, 'silence'), ENDPOINT_MS);

                continue;
            }

            // The browser says this sentence is final
            clearTimeout(endpointTimer);

            // If we already acted on it a moment ago, ignore this second copy
            if (lastHandled && normalize(text) === lastHandled && Date.now() - lastHandledAt < 10000) {
                log(`browser confirmed the sentence ${((Date.now() - lastHandledAt) / 1000).toFixed(1)}s after we had already acted on it`);
                lastHandled = '';
                continue;
            }

            log(`browser final result arrived ${lastWordsAt ? ((Date.now() - lastWordsAt) / 1000).toFixed(1) : '?'}s after your last words`);
            sentenceFinished(text, 'browser');
        }
    }

    function handleHeard(heard) {
        log('heard:', heard, '| state:', state);

        const command = heard.replace(NAME_STRIP, '').trim();

        // Jason is already working: say so, instead of silently ignoring you
        if (state === 'thinking' || state === 'speaking') {
            heardLine = `Heard: "${heard}"\nIgnored: Jason is still busy with the last request.`;
            tone(220, 0.15);
            render();
            return;
        }

        if (state === 'armed') {
            // Ordinary talk in the room: ignore it unless his name was said
            if (!NAME_TEST.test(heard)) {
                heardLine = `Heard: "${heard}"\nIgnored: you did not say "Jason".`;
                render();
                return;
            }

            if (command.length >= 2) {
                submit(command, heard);        // "Jason, open Notepad": name and command together
            } else {
                heardLine = `Heard: "${heard}"`;
                enterCommandMode();            // only "Jason": beep and wait for the command
            }

            return;
        }

        // 'command' or 'followup': whatever was said is the command, no name needed
        if (command.length >= 2) submit(command, heard);
    }

    // ======================================================================
    // Moving between states
    // ======================================================================
    function backToArmed() {
        clearTimers();

        if (!enabled) return;

        // Make sure the listener is really running
        if (!wantListening) startListening();

        setState('armed');
        setGlobe('idle', 0.5);
    }

    function enterCommandMode() {
        clearTimers();
        setState('command');
        tone(880, 0.12);

        commandTimer = setTimeout(backToArmed, COMMAND_WAIT_SECONDS * 1000);
    }

    function enterFollowUp() {
        clearTimers();
        setState('followup');

        followUpTimer = setTimeout(backToArmed, FOLLOW_UP_SECONDS * 1000);
    }

    // Sends the command to Jason exactly like a voice message from the mic button
    function submit(command, heard) {
        // Jason can only handle one message at a time (checked BEFORE touching any timers)
        if (voice.isBusy()) {
            heardLine = `Heard: "${heard}"\nIgnored: Jason is still answering the last message.`;
            tone(220, 0.15);
            render();
            return;
        }

        clearTimers();

        heardLine = `Heard: "${command}" → sent`;
        tone(660, 0.08);

        sentAt = Date.now();
        replyArrived = false;

        setState('thinking');
        voice.sendAsVoice(command);

        // Safety net: if no reply ever arrives, go back to listening
        thinkingTimer = setTimeout(() => {
            log('no reply after a long time, going back to listening');
            backToArmed();
        }, THINKING_TIMEOUT_SECONDS * 1000);
    }

    // ======================================================================
    // Reacting to Jason speaking
    // ======================================================================
        function finishedSpeaking() {
        const runId = speechRunId;

        // Wait a moment for the room to settle, then listen again
        setTimeout(() => {
            // A newer speech began in the meantime, or hands-free was switched off
            if (runId !== speechRunId || !enabled) return;

            startListening();

            // An early sentence ("Opening Facebook, Sir.") can finish while the request is still running.
            // Then Jason is still working, so go back to waiting instead of starting the follow-up window.
            if (voice.isBusy()) {
                setState('thinking');

                thinkingTimer = setTimeout(() => {
                    log('no reply after a long time, going back to listening');
                    backToArmed();
                }, THINKING_TIMEOUT_SECONDS * 1000);

                return;
            }

            enterFollowUp();
        }, RESUME_DELAY_MS);
    }

    voice.onSpeaking(isSpeaking => {
        if (!enabled) return;

        if (isSpeaking) {
            speechRunId++;

            log(`Jason started speaking${sentAt ? ` (${((Date.now() - sentAt) / 1000).toFixed(1)}s after your command)` : ''}`);

            clearTimers();
            setState('speaking');
            stopListening();   // so Jason does not hear himself and trigger his own name

            // If the browser never reports that speech finished, carry on anyway
            speakingWatchTimer = setTimeout(() => {
                log('speech never reported finishing, going back to listening');
                finishedSpeaking();
            }, SPEAKING_TIMEOUT_SECONDS * 1000);

            return;
        }

        log('Jason finished speaking');
        clearTimeout(speakingWatchTimer);
        finishedSpeaking();
    });

    voice.onReply((text, willSpeak) => {
        if (!enabled) return;

        replyArrived = true;

        log(
            `reply arrived${sentAt ? ` after ${((Date.now() - sentAt) / 1000).toFixed(1)}s` : ''}`,
            willSpeak ? '(will be spoken)' : '(not spoken)'
        );

        if (state !== 'thinking') return;

        // Nothing left to say (the early sentence already covered it): the answer is complete,
        // so start the follow-up window
        if (!willSpeak) {
            enterFollowUp();
            return;
        }

        // If speech has not started within 6 seconds (the voice failed, for example), carry on
        clearTimeout(replyWatchTimer);
        replyWatchTimer = setTimeout(() => {
            if (state === 'thinking') {
                log('speech did not start, going back to listening');
                backToArmed();
            }
        }, 6000);
    });

    // ======================================================================
    // Health check, once a second: refreshes the counter and repairs problems
    // ======================================================================
    function healthCheck() {
        if (!enabled) return;

        // The listener should be running but is not: after 3 seconds, rebuild it
        if (wantListening && !running) {
            notRunningTicks++;

            if (notRunningTicks >= 3) {
                log('listener is stuck, rebuilding it');
                notRunningTicks = 0;
                rebuildRecognition();
            }
        } else {
            notRunningTicks = 0;
        }

        // A reply failed to arrive (a connection error, for example): Jason is free again, so go back
        if (state === 'thinking' && !replyArrived && !voice.isBusy() && Date.now() - sentAt > 4000) {
            log('Jason finished without a reply (probably an error), going back to listening');
            heardLine = 'Jason could not answer (see the chat for the error).';
            backToArmed();
        }

        render();   // also updates the seconds counter
    }

    // ======================================================================
    // The switch
    // ======================================================================
    function turnOn() {
        enabled = true;

        // Created on a click, so the browser allows the sounds
        if (!audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();

            // If it was created without a click (switched on automatically), unlock it on the next click
            document.addEventListener('click', () => audioContext.resume(), { once: true });
        }

        voice.unlock();                                // allow Jason to speak
        localStorage.setItem(STORAGE_KEY, 'true');     // remembered, so it comes back on after a reload

        heardLine = '';
        notRunningTicks = 0;

        startListening();
        setState('armed');

        clearInterval(healthTimer);
        healthTimer = setInterval(healthCheck, 1000);
    }

    function turnOff(message) {
        enabled = false;

        stopListening();
        clearTimers();
        clearInterval(healthTimer);

        heardLine = message || '';
        setState('off');
        setGlobe('idle', 0.5);

        localStorage.setItem(STORAGE_KEY, 'false');

        // A reason (for example "microphone blocked") stays visible for a few seconds
        if (message) {
            setTimeout(() => {
                if (state === 'off') {
                    heardLine = '';
                    render();
                }
            }, 6000);
        }
    }

    // The switch. Any error is shown in the status line instead of being lost.
    button.addEventListener('click', () => {
        try {
            if (enabled) turnOff();
            else turnOn();
        } catch (error) {
            console.error(error);
            statusLine.hidden = false;
            statusLine.textContent = 'Hands-free error: ' + error.message;
        }
    });

    // If it was on last time, switch it on again when the page loads
    // (if the browser needs the permission again, it will say so and stay off)
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
        try {
            turnOn();
        } catch (error) {
            console.error(error);
        }
    }

    // Stop listening when the page closes
    window.addEventListener('beforeunload', stopListening);
})();