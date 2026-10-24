// voice.js: voice messages (record, preview, send) and spoken replies for Jason's web UI.
// It runs in the browser of every device that opens the page, so the phone speaks on the phone
// and the laptop speaks on the laptop. Nothing here ever makes another device talk.
(function () {
    'use strict';

    // ---------- The page's elements (this script loads at the end of the page, so they all exist) ----------
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const micBtn = document.getElementById('micBtn');
    const voiceBar = document.getElementById('voiceBar');
    const voiceDot = document.getElementById('voiceDot');
    const voiceStatus = document.getElementById('voiceStatus');
    const voiceTimer = document.getElementById('voiceTimer');
    const voiceStopBtn = document.getElementById('voiceStopBtn');
    const voicePlayBtn = document.getElementById('voicePlayBtn');
    const voiceDeleteBtn = document.getElementById('voiceDeleteBtn');
    const voiceSendBtn = document.getElementById('voiceSendBtn');
    const speakToggle = document.getElementById('speakToggleBtn');

    // If the new buttons are missing from index.html, do nothing instead of breaking the page
    if (!chatInput || !sendBtn || !micBtn || !voiceBar) return;

    // ---------- Settings ----------
    const MAX_RECORDING_SECONDS = 60;    // a recording stops by itself after this long
    const MIN_RECORDING_SECONDS = 0.5;   // anything shorter is treated as an accidental tap
    const MAX_SPOKEN_CHARACTERS = 600;   // longer replies are only partly read aloud
    const SAMPLE_RATE = 16000;           // speech recognition only needs 16 kHz mono audio

    // ---------- State ----------
    let mode = 'idle';            // 'idle' | 'recording' | 'preview' | 'busy'
    let stream = null;            // the microphone, while it is open
    let recorder = null;          // the browser's recorder
    let chunks = [];              // pieces of audio as they arrive
    let discardOnStop = false;    // true when the recording is cancelled instead of kept
    let recordedBlob = null;      // the finished recording
    let recordedSeconds = 0;
    let startedAt = 0;
    let timerId = null;
    let noticeTimer = null;
    let previewAudio = null;      // plays the recording back
    let previewUrl = null;

    // ======================================================================
    // The recorder bar: what it shows in each mode
    // ======================================================================
    function formatTime(seconds) {
        const whole = Math.max(0, Math.round(seconds));
        return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
    }

    function setMode(next, message) {
        mode = next;

        const recording = next === 'recording';
        const preview = next === 'preview';
        const busy = next === 'busy';

        voiceBar.hidden = next === 'idle';
        micBtn.classList.toggle('recording', recording);

        // The coloured dot: blinking red while recording, blue when ready, amber when working
        voiceDot.className = 'voice-dot ' + (recording ? 'recording' : busy ? 'busy' : 'ready');

        voiceStatus.textContent =
            message || { recording: 'Recording…', preview: 'Ready to send', busy: 'Working…' }[next] || '';

        // Which buttons are visible in this mode
        voiceStopBtn.hidden = !recording;
        voicePlayBtn.hidden = !preview;
        voiceSendBtn.hidden = !preview;
        voiceDeleteBtn.hidden = !(recording || preview);

        // Timer: counts up while recording, shows the length when ready
        voiceTimer.textContent = preview ? formatTime(recordedSeconds) : recording ? '0:00' : '';
    }

    // A short message in the bar (for problems), then back to normal
    function showNotice(text, milliseconds = 5000) {
        voiceBar.hidden = false;
        voiceDot.className = 'voice-dot';
        voiceStatus.textContent = text;
        voiceTimer.textContent = '';

        [voiceStopBtn, voicePlayBtn, voiceSendBtn, voiceDeleteBtn].forEach(button => {
            button.hidden = true;
        });

        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => setMode(mode), milliseconds);
    }

    // ======================================================================
    // Recording
    // ======================================================================
    function pickRecorderType() {
        // Chrome and Android use webm, iPhones use mp4. Ask the browser which one it can do.
        const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
        return types.find(type => window.MediaRecorder?.isTypeSupported?.(type)) || '';
    }

    async function startRecording() {
        stopSpeaking();   // if Jason is talking, he stops when you start

        // Microphones only work on secure pages (https, or localhost)
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            showNotice(
                window.isSecureContext
                    ? 'This browser cannot record audio.'
                    : 'Recording needs a secure address (https). Open Jason through your Tailscale https link.'
            );
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
        } catch (error) {
            showNotice(
                error.name === 'NotFoundError'
                    ? 'No microphone was found.'
                    : 'Microphone permission was denied. Allow it in this site\'s browser settings.'
            );
            return;
        }

        const mimeType = pickRecorderType();

        chunks = [];
        discardOnStop = false;
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = onRecordingStopped;
        recorder.start();

        startedAt = Date.now();
        setMode('recording');

        // Update the timer, and stop by itself at the time limit
        timerId = setInterval(() => {
            const elapsed = (Date.now() - startedAt) / 1000;
            voiceTimer.textContent = formatTime(elapsed);

            if (elapsed >= MAX_RECORDING_SECONDS) stopRecording();
        }, 250);
    }

    function stopRecording() {
        if (recorder && recorder.state === 'recording') recorder.stop();
    }

    function cancelRecording() {
        discardOnStop = true;
        stopRecording();
    }

    // Runs when the recorder has finished (stopped or cancelled)
    function onRecordingStopped() {
        clearInterval(timerId);

        // Release the microphone, so the browser's "recording" indicator goes away
        if (stream) stream.getTracks().forEach(track => track.stop());
        stream = null;

        recordedSeconds = (Date.now() - startedAt) / 1000;

        if (discardOnStop) {
            chunks = [];
            setMode('idle');
            return;
        }

        if (recordedSeconds < MIN_RECORDING_SECONDS) {
            chunks = [];
            setMode('idle');
            showNotice('That was too short. Hold on a little longer.');
            return;
        }

        // Keep the recording so it can be played back, deleted, or sent
        recordedBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        previewUrl = URL.createObjectURL(recordedBlob);
        previewAudio = new Audio(previewUrl);
        previewAudio.onended = () => { voicePlayBtn.textContent = '▶'; };

        voicePlayBtn.textContent = '▶';
        setMode('preview');
    }

    function togglePreview() {
        if (!previewAudio) return;

        if (previewAudio.paused) {
            previewAudio.play();
            voicePlayBtn.textContent = '⏸';
        } else {
            previewAudio.pause();
            voicePlayBtn.textContent = '▶';
        }
    }

    // Throws the finished recording away
    function discardRecording() {
        if (previewAudio) previewAudio.pause();
        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewAudio = null;
        previewUrl = null;
        recordedBlob = null;
        chunks = [];

        setMode('idle');
    }

    // ======================================================================
    // Turning the recording into a small WAV file (every AI speech model understands WAV)
    // ======================================================================
    async function blobToWavBase64(blob) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;

        // Decode the recording (webm or mp4) into raw sound
        const context = new AudioContextClass();
        let decoded;

        try {
            decoded = await context.decodeAudioData(await blob.arrayBuffer());
        } finally {
            if (context.close) context.close();
        }

        // Re-play it into a 16 kHz mono "offline" recorder, which also shrinks and mixes it down
        const offline = new OfflineContextClass(
            1,
            Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)),
            SAMPLE_RATE
        );
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();

        const rendered = await offline.startRendering();

        return encodeWavBase64(rendered.getChannelData(0), SAMPLE_RATE);
    }

    // Writes the sound into the standard WAV layout (a 44 byte header, then 16-bit samples)
    function encodeWavBase64(samples, sampleRate) {
        const bytesPerSample = 2;
        const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
        const view = new DataView(buffer);

        const writeText = (offset, text) => {
            for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
        };

        writeText(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * bytesPerSample, true);
        writeText(8, 'WAVE');
        writeText(12, 'fmt ');
        view.setUint32(16, 16, true);                          // size of this block
        view.setUint16(20, 1, true);                           // 1 = plain PCM
        view.setUint16(22, 1, true);                           // 1 channel (mono)
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * bytesPerSample, true); // bytes per second
        view.setUint16(32, bytesPerSample, true);              // bytes per sample
        view.setUint16(34, 16, true);                          // bits per sample
        writeText(36, 'data');
        view.setUint32(40, samples.length * bytesPerSample, true);

        // Convert each sample from a decimal (-1 to 1) to a 16-bit whole number
        let offset = 44;

        for (let i = 0; i < samples.length; i++, offset += 2) {
            const clamped = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        }

        // Turn the bytes into base64 text so they can travel in JSON (in chunks, to avoid overflow)
        const bytes = new Uint8Array(buffer);
        let binary = '';

        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }

        return btoa(binary);
    }

    // ======================================================================
    // Sending: transcribe on the laptop, then send the words to Jason like a typed message
    // ======================================================================
    let voiceReplyPending = false;   // true while Jason owes us a reply to a VOICE message
    let programmaticSend = false;    // true only while this script presses the send button

    async function sendRecording() {
        if (mode !== 'preview' || !recordedBlob) return;

        // The page can only handle one message at a time
        if (sendBtn.disabled) {
            showNotice('Jason is still answering. Try again in a moment.');
            return;
        }

        setMode('busy', 'Transcribing…');

        try {
            const data64 = await blobToWavBase64(recordedBlob);

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: { mimeType: 'audio/wav', data: data64 } })
            });

            const result = await response.json();

            if (!response.ok) throw new Error(result.error || 'Transcription failed.');

            const text = String(result.text || '').trim();

            // Nothing heard: go back to the preview so it can be re-recorded or deleted
            if (!text) {
                setMode('preview');
                showNotice('I could not hear any speech in that. Try again.');
                return;
            }

            discardRecording();   // the recording is no longer needed
            sendAsVoice(text);
        } catch (error) {
            setMode('preview');
            showNotice(`Could not transcribe: ${error.message}`);
        }
    }

    // Puts the words in the text box and presses the normal send button,
    // so a voice message behaves exactly like a typed one
    function sendAsVoice(text) {
        chatInput.value = text;
        chatInput.dispatchEvent(new Event('input'));   // lets the page resize the text box

        programmaticSend = true;
        voiceReplyPending = true;   // this message came from voice, so its reply will be spoken
        sendBtn.click();
        programmaticSend = false;
    }

    // If you type a message yourself (Enter key or the send button), its reply is NOT a voice reply
    sendBtn.addEventListener('click', () => {
        if (!programmaticSend) voiceReplyPending = false;
    }, true);

    chatInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) voiceReplyPending = false;
    }, true);

    // ======================================================================
    // Speaking (uses the voices built into the browser: free, instant, nothing is sent anywhere)
    // ======================================================================
    const synth = window.speechSynthesis;
    let voices = [];
    let speechUnlocked = false;
    let speakAllReplies = localStorage.getItem('jason_speak_all') === 'true';

    function loadVoices() {
        if (synth) voices = synth.getVoices();
    }

    if (synth) {
        loadVoices();
        synth.addEventListener?.('voiceschanged', loadVoices);   // some browsers load voices late
    }

    // Phones only allow speech after a tap, so we "warm it up" with a silent word on the first tap
    function unlockSpeech() {
        if (!synth || speechUnlocked) return;
        speechUnlocked = true;

        try {
            const silent = new SpeechSynthesisUtterance(' ');
            silent.volume = 0;
            synth.speak(silent);
        } catch (error) {
            // not available, nothing to do
        }
    }

    // Prefers an English male-sounding voice (matching Jason's character), otherwise any English voice
    function pickVoice() {
        let english = voices.filter(voice => /^en[-_]/i.test(voice.lang));

        // Optional: use only offline voices. They start instantly (nothing to download) but sound plainer.
        // Turn on:  localStorage.setItem('jason_voice_local', 'true')     Turn off:  localStorage.removeItem('jason_voice_local')
        if (localStorage.getItem('jason_voice_local') === 'true') {
            const offline = english.filter(voice => voice.localService);
            if (offline.length > 0) english = offline;
        }

        const preferences = [
            /google uk english male/i,
            /\b(guy|ryan|christopher|eric|davis|david|daniel|alex|mark|james|george|brian)\b/i,
            /male/i
        ];

        for (const pattern of preferences) {
            const match = english.find(voice => pattern.test(voice.name));
            if (match) return match;
        }

        return english[0] || voices[0] || null;
    }

    // Cleans a reply for speaking: no code, links, or formatting symbols
    function toSpeakable(text) {
        return String(text || '')
            .replace(/```[\s\S]*?```/g, ' ')                 // code blocks are not read aloud
            .replace(/`([^`]*)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')         // [text](link) becomes text
            .replace(/https?:\/\/\S+/g, ' link ')
            .replace(/^\s*[-•*]\s+/gm, '')                   // bullet points
            .replace(/[*_#>~|]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Splits text into sentence-sized pieces (long utterances can cut off on some phones)
    function splitForSpeech(text) {
        const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
        const pieces = [];
        let current = '';

        for (const sentence of sentences) {
            if ((current + sentence).length > 180 && current) {
                pieces.push(current.trim());
                current = '';
            }

            current += sentence;
        }

        if (current.trim()) pieces.push(current.trim());
        return pieces;
    }

    // Other scripts (the hands-free mode) can ask to be told when Jason starts or stops speaking
    const speakingListeners = [];

    function notifySpeaking(isSpeaking) {
        speakingListeners.forEach(listener => {
            try { listener(isSpeaking); } catch (error) { /* one broken listener must not stop the others */ }
        });
    }

    function setGlobe(state, seconds) {
        if (typeof window.setJasonGlobeState === 'function') {
            window.setJasonGlobeState(state, seconds);
        }
    }

    // ---------- Keeping track of what is being said ----------
    // Jason's answer can now arrive as many short pieces. These variables make "speaking" stay on
    // from the first sentence to the last, instead of flickering off between sentences.
    let queuedUtterances = 0;    // sentences handed to the browser that have not finished yet
    let speakingNow = false;     // true from the first sentence starting until the whole queue is done
    let speechGeneration = 0;    // goes up whenever speech is cancelled, so late events from cancelled sentences are ignored
    let speechIdleTimer = null;

    function speechStarted() {
        clearTimeout(speechIdleTimer);

        if (!speakingNow) {
            speakingNow = true;
            setGlobe('speaking', 0.3);
            notifySpeaking(true);
        }
    }

    function speechEnded() {
        queuedUtterances = Math.max(0, queuedUtterances - 1);
        if (queuedUtterances > 0) return;

        // While Jason is still writing his answer, the next sentence may be only a moment away,
        // so wait a little before announcing "finished speaking"
        const wait = sendBtn.disabled ? 700 : 0;

        clearTimeout(speechIdleTimer);
        speechIdleTimer = setTimeout(() => {
            if (queuedUtterances > 0 || !speakingNow) return;

            speakingNow = false;
            setGlobe('idle', 0.5);
            notifySpeaking(false);
        }, wait);
    }

    function stopSpeaking() {
        speechGeneration++;          // events from the sentences being cancelled now are ignored
        queuedUtterances = 0;
        clearTimeout(speechIdleTimer);

        if (synth) synth.cancel();

        if (speakingNow) {
            speakingNow = false;
            setGlobe('idle', 0.5);
            notifySpeaking(false);
        }
    }

    function speakText(rawText, options = {}) {
        if (!synth) return;

        // queue: true adds to what is already being said, instead of cutting it off
        if (!options.queue) stopSpeaking();

        let text = toSpeakable(rawText);
        if (!text) return;

        // A long reply is only partly read aloud, ending at a full sentence if possible
        if (text.length > MAX_SPOKEN_CHARACTERS) {
            const cut = text.slice(0, MAX_SPOKEN_CHARACTERS);
            const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));

            text = (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut) + ' The rest is on screen, Sir.';
        }

        const pieces = splitForSpeech(text);
        const voice = pickVoice();
        const requestedAt = Date.now();   // used to measure how long the voice takes to start

        const generation = speechGeneration;   // if speech is cancelled later, this batch's events are ignored

        pieces.forEach((piece, index) => {
            const utterance = new SpeechSynthesisUtterance(piece);

            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            }

            utterance.rate = 1.0;
            utterance.pitch = 0.95;   // a little deeper

            queuedUtterances++;
            let finished = false;

            utterance.onstart = () => {
                if (generation !== speechGeneration) return;

                // Shows how long the voice took to start, and whether it is an online or offline voice
                if (index === 0) {
                    console.log(
                        `[voice] speech started ${Date.now() - requestedAt} ms after it was requested ` +
                        `(${voice ? voice.name + (voice.localService ? ', offline' : ', online') : 'default voice'})`
                    );
                }

                speechStarted();
            };

            // Both a normal end and an error count as "this sentence is over"
            const sentenceOver = () => {
                if (finished || generation !== speechGeneration) return;
                finished = true;
                speechEnded();
            };

            utterance.onend = sentenceOver;
            utterance.onerror = sentenceOver;

            synth.speak(utterance);
        });
    }

        // Other scripts can ask to be told when a reply arrives, and whether it will be spoken
    const replyListeners = [];

    // Sentences already spoken early for the current request, so the final reply does not repeat them
    let earlySpoken = [];

    // The server pushes a short sentence the moment an action starts. Speak it now, if this device speaks.
    function speakEarly(text) {
        // Only while a request is running (a late sentence after the reply would be a repeat)
        if (!sendBtn.disabled) return;

        // Same rule as replies: voice messages, or "speak all replies" is on
        if (!(speakAllReplies || voiceReplyPending)) return;

        const sentence = String(text || '').trim();
        if (!sentence) return;

        earlySpoken.push(sentence);
        speakText(sentence, { queue: true });
    }

    // Takes out the sentences that were already spoken early
    function withoutEarlySentences(text) {
        let rest = String(text || '');

        earlySpoken.forEach(sentence => { rest = rest.replace(sentence, ' '); });

        return rest.replace(/\s+/g, ' ').trim();
    }

    // A message Jason sent on his own (not an answer to anything). Show it, and speak it if this device speaks.
    function receiveInitiative(text) {
        const message = String(text || '').trim();
        if (!message) return;

        if (typeof window.jasonAppendMessage === 'function') {
            window.jasonAppendMessage('assistant', message);
        }

        // Speak it if this device is set to speak, or hands-free is on.
        // Never talk over a running request or a recording.
        const handsFreeOn = localStorage.getItem('jason_handsfree') === 'true';
        const free = !sendBtn.disabled && mode !== 'recording' && mode !== 'busy';

        if ((speakAllReplies || handsFreeOn) && free) {
            speakText(message, { queue: true });
        }
    }

    // ======================================================================
    // Streaming answers: each sentence is spoken as soon as it has arrived
    // ======================================================================
    let streamText = '';         // the answer so far, exactly as it arrived
    let streamSpokenTo = 0;      // everything before this position was already handed to the voice
    let streamSpokenChars = 0;   // how much was spoken, so a long answer stops at the usual limit
    let streamCapped = false;    // true once the limit was reached

    function resetStream() {
        streamText = '';
        streamSpokenTo = 0;
        streamSpokenChars = 0;
        streamCapped = false;
    }

    // Speaks one piece of a streaming answer. Returns true if something was handed to the voice.
    function speakStreamPiece(piece) {
        if (streamCapped) return false;

        const clean = toSpeakable(piece);
        if (clean.length < 2) return false;

        // Same limit as before: a long answer is only partly read aloud
        if (streamSpokenChars > 0 && streamSpokenChars + clean.length > MAX_SPOKEN_CHARACTERS) {
            streamCapped = true;
            speakText('The rest is on screen, Sir.', { queue: true });
            return true;
        }

        streamSpokenChars += clean.length;
        if (clean.length > MAX_SPOKEN_CHARACTERS) streamCapped = true;   // speakText shortens it and says so itself

        speakText(piece, { queue: true });
        return true;
    }

    // How many characters of the not-yet-spoken text form complete sentences (0 if none yet)
    function completeSentenceLength() {
        const pending = streamText.slice(streamSpokenTo);
        const boundary = /[.!?]+["')\]]*\s|\n/g;   // a sentence ending, followed by a space or a new line
        let best = 0;
        let match;

        while ((match = boundary.exec(pending)) !== null) {
            const end = match.index + match[0].length;

            // Never cut inside a code block: the number of ``` marks before the cut must be even
            const fences = (streamText.slice(0, streamSpokenTo + end).match(/```/g) || []).length;
            if (fences % 2 === 0) best = end;
        }

        return best;
    }

    // A piece of Jason's answer arrived from the server while he is still writing it
    function receiveDelta(text) {
        // Only while a request is running (a late piece after the reply would be a repeat)
        if (!sendBtn.disabled) return;

        const piece = String(text || '');
        if (!piece) return;

        streamText += piece;

        // Show it in the chat right away
        if (window.jasonStream) window.jasonStream.update(streamText);

        // Speak it if this device speaks (same rule as for normal replies)
        if (!(speakAllReplies || voiceReplyPending)) return;

        const end = completeSentenceLength();

        // Very short first sentences ("Yes.") wait for the next one, so the voice does not sound choppy
        if (end >= 12) {
            speakStreamPiece(streamText.slice(streamSpokenTo, streamSpokenTo + end));
            streamSpokenTo += end;
        }
    }

    // What was streamed turned out not to be the final answer (a tool is about to be used)
    function abortStream() {
        if (streamSpokenChars > 0) stopSpeaking();   // stop saying words that will not be the answer

        resetStream();
        if (window.jasonStream) window.jasonStream.discard();
    }

    window.jasonSttTts = {
        speak(text) {
            // Speak if the message was a voice message, or if "speak all replies" is on for this device
            const wanted = speakAllReplies || voiceReplyPending;
            voiceReplyPending = false;

            let shouldSpeak;

            if (streamText) {
                // The answer was streaming: only what has not been spoken yet is left to say
                // (the last sentence, which had no space after it, or a note added at the end)
                const spoken = streamText.slice(0, streamSpokenTo).trimStart();
                const full = String(text || '').trimStart();

                let rest = full.startsWith(spoken) ? full.slice(spoken.length) : (streamSpokenTo === 0 ? full : '');
                if (earlySpoken.length) rest = withoutEarlySentences(rest);
                earlySpoken = [];

                const spokeRest = wanted && toSpeakable(rest).length >= 2 && speakStreamPiece(rest);

                // "Will be spoken" also covers sentences that are still being said right now
                shouldSpeak = Boolean(spokeRest || (wanted && (speakingNow || queuedUtterances > 0)));
                resetStream();
            } else {
                // Leave out anything already said early. If nothing is left, there is nothing more to say.
                const toSay = earlySpoken.length ? withoutEarlySentences(text) : text;
                earlySpoken = [];

                shouldSpeak = wanted && toSpeakable(toSay).length >= 2;

                // queue: true, so an early sentence that is still being spoken is not cut off
                if (shouldSpeak) speakText(toSay, { queue: true });
            }

            replyListeners.forEach(listener => {
                try { listener(text, shouldSpeak); } catch (error) { /* ignore a broken listener */ }
            });
        }
    };

    // ---------- The "speak replies" switch under the text box ----------
    function renderSpeakToggle() {
        speakToggle.textContent = speakAllReplies
            ? '🔊 Speak replies: always'
            : '🔈 Speak replies: voice messages only';
        speakToggle.setAttribute('aria-pressed', String(speakAllReplies));
    }

    speakToggle.addEventListener('click', () => {
        unlockSpeech();
        speakAllReplies = !speakAllReplies;
        localStorage.setItem('jason_speak_all', String(speakAllReplies));   // remembered per device
        if (!speakAllReplies) stopSpeaking();
        renderSpeakToggle();
    });

    renderSpeakToggle();

    // ======================================================================
    // Wiring the buttons
    // ======================================================================
    micBtn.addEventListener('click', () => {
        unlockSpeech();

        if (mode === 'recording') { stopRecording(); return; }
        if (mode === 'busy') return;
        if (mode === 'preview') discardRecording();   // tapping the mic again starts a fresh recording

        startRecording();
    });

    voiceStopBtn.addEventListener('click', stopRecording);
    voicePlayBtn.addEventListener('click', togglePreview);
    voiceSendBtn.addEventListener('click', sendRecording);

    voiceDeleteBtn.addEventListener('click', () => {
        if (mode === 'recording') cancelRecording();
        else discardRecording();
    });

    // Sending any message also stops Jason mid-sentence, and starts a fresh list of early sentences
    sendBtn.addEventListener('click', () => {
        stopSpeaking();
        unlockSpeech();
        earlySpoken = [];
        resetStream();   // a new message starts a fresh streaming answer
    }, true);

    // The Escape key interrupts Jason while he is talking
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') stopSpeaking();
    });

    // What the hands-free script (handsfree.js) is allowed to use
    window.jasonVoice = {
        sendAsVoice,                                            // send words as a voice message
        speakEarly,                                             // speak a short sentence as soon as it arrives
        receiveInitiative,                                      // show (and maybe speak) a message Jason sent on his own
        receiveDelta,                                           // a piece of the answer arrived while Jason is still writing
        abortStream,                                            // the streamed text was not the final answer: forget it
        stopSpeaking,
        unlock: unlockSpeech,                                   // allow speech (needs a tap first)
        isBusy: () => sendBtn.disabled,                         // true while Jason is still answering
        onSpeaking: listener => speakingListeners.push(listener),
        onReply: listener => replyListeners.push(listener)
    };
})();