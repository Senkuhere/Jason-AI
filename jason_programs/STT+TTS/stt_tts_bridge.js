/* stt_tts_bridge.js

  Self-contained module to add optional STT (continuous) and TTS (auto-play) to your prototype-jason-ui.
  Place this file in your project and call window.JasonSTTTS.init(options) after DOMContentLoaded.

  Usage (example):
    window.JasonSTTTS.init({
      chatInputSelector: '#chatInput',
      chatMessagesSelector: '#chatMessages',
      language: 'en-US',
      continuous: true,
      autoSendOnStop: false,
      autoPlayTTS: true,
      preferMale: true,
      attachMicButton: true
    });

  Safety: This module will not auto-start the microphone unless you explicitly call startListening() or set startOnInit: true
*/
(function (global) {
  if (!global) return;

  const defaultOptions = {
    chatInputSelector: '#chatInput',
    chatMessagesSelector: '#chatMessages',
    language: 'en-US',
    continuous: true, // listen-until-stop
    interimResults: true,
    autoSendOnStop: false,
    autoPlayTTS: true,
    preferMale: true,
    attachMicButton: true,
    startOnInit: true
  };

  function safeLog(...args) { console.log('[JasonSTTTS]', ...args); }

  function findVoice(voices, opts) {
    // Prefer en-US voices and (optionally) male-sounding labels heuristically.
    const preferMale = !!opts.preferMale;
    const lang = (opts.language || 'en-US').toLowerCase();

    // Score voices
    const scored = voices.map(v => {
      let score = 0;
      const vname = (v.name || '').toLowerCase();
      const vlang = (v.lang || '').toLowerCase();

      if (vlang.startsWith(lang)) score += 50;
      if (vname.includes('male') || vname.includes('mark') || vname.includes('john') || vname.includes('alex') || vname.includes('david')) score += 20;
      if (vname.includes('female') || vname.includes('susan') || vname.includes('linda') || vname.includes('alloy')) score -= 5;

      // prefer naturalness keywords
      if (vname.includes('natural') || vname.includes('neural') || vname.includes('wave') || vname.includes('premium')) score += 6;

      // fallback for exact locale match
      if (vlang === lang) score += 8;

      return { voice: v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.length ? scored[0].voice : null;

    // If preferMale is false but top voice is male-matching negative, try next
    if (best && preferMale) return best;
    return best;
  }

  function createUIElements(containerSelectors, opts) {
    const elements = {};

    elements.chatInput = document.querySelector(opts.chatInputSelector) || null;
    elements.chatMessages = document.querySelector(opts.chatMessagesSelector) || null;

    if (opts.attachMicButton && elements.chatInput && !document.getElementById('jason-mic-button')) {
      // Create a small floating mic button near the input area. Styles are minimal to avoid collisions.
      const btn = document.createElement('button');
      btn.id = 'jason-mic-button';
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Toggle microphone (Speech-to-Text)';
      btn.style.position = 'absolute';
      btn.style.right = '12px';
      btn.style.bottom = '18px';
      btn.style.width = '36px';
      btn.style.height = '36px';
      btn.style.borderRadius = '8px';
      btn.style.border = 'none';
      btn.style.background = 'linear-gradient(135deg, rgba(0,240,255,0.12), rgba(0,240,255,0.06))';
      btn.style.boxShadow = '0 6px 18px rgba(0,240,255,0.06)';
      btn.style.color = '#00f0ff';
      btn.style.zIndex = 2000;
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.backdropFilter = 'blur(6px)';

      btn.innerHTML = '\uD83C\uDF99️'; // simple mic emoji fallback

      // Attach near chat input's offset parent
      const parent = elements.chatInput.parentElement || document.body;
      parent.style.position = parent.style.position || 'relative';
      parent.appendChild(btn);
      elements.micButton = btn;
    }

    return elements;
  }

  function buildModule(opts) {
    const state = {
      recognition: null,
      isListening: false,
      synthesisUtterance: null,
      voice: null,
      voicesReady: false
    };

    function onVoicesChanged() {
      const voices = speechSynthesis.getVoices();
      state.voicesReady = true;
      state.voice = findVoice(voices, opts) || voices.find(v => v.lang && v.lang.includes(opts.language)) || voices[0] || null;
      safeLog('Selected voice:', state.voice && (state.voice.name + ' (' + state.voice.lang + ')'));
    }

    // Setup speech synthesis voice list watcher
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (speechSynthesis.getVoices().length === 0) {
        // Many browsers load voices asynchronously
        speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
        setTimeout(() => onVoicesChanged(), 250);
      } else {
        onVoicesChanged();
      }
    } else {
      safeLog('SpeechSynthesis not available in this browser. TTS disabled.');
    }

    function speak(text, opt = {}) {
      if (!text || typeof text !== 'string') return;
      if (!('speechSynthesis' in window)) {
        safeLog('TTS not supported in this browser.');
        return;
      }

      // Cancel currently speaking utterance to avoid overlapping
      try { speechSynthesis.cancel(); } catch (e) {}

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = opts.language || opts.lang || opts.language || 'en-US';
      utter.pitch = typeof opt.pitch === 'number' ? opt.pitch : 0.95; // slightly lower pitch to appear male
      utter.rate = typeof opt.rate === 'number' ? opt.rate : 0.96; // near-normal rate
      utter.volume = typeof opt.volume === 'number' ? opt.volume : 1.0;

      if (state.voice) utter.voice = state.voice;

      utter.onstart = () => {
        safeLog('TTS start');
        // set aria state on viewport
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.add('speaking');
      };
      utter.onend = () => {
        safeLog('TTS end');
        const vp = document.getElementById('viewport');
        if (vp) vp.classList.remove('speaking');
      };
      utter.onerror = (e) => { safeLog('TTS error', e); };

      speechSynthesis.speak(utter);
      state.synthesisUtterance = utter;
      return utter;
    }

    function initRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        safeLog('SpeechRecognition API not available. STT disabled.');
        return null;
      }

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      r.lang = opts.language || 'en-US';
      r.interimResults = !!opts.interimResults;
      r.continuous = !!opts.continuous;
      r.maxAlternatives = 1;

      r.onstart = () => {
        state.isListening = true;
        safeLog('Recognition started');
        if (elements.micButton) elements.micButton.setAttribute('aria-pressed', 'true');
        setGlobeListening(true);
      };

      r.onend = () => {
        state.isListening = false;
        safeLog('Recognition ended');
        if (elements.micButton) elements.micButton.setAttribute('aria-pressed', 'false');
        setGlobeListening(false);
        // If continuous is true, browser may end due to inactivity. Do not auto-restart unless user toggles.
      };

      r.onerror = (e) => {
        safeLog('Recognition error', e);
      };

      let interim = '';
      r.onresult = (ev) => {
        interim = '';
        let finalTranscript = '';
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const res = ev.results[i];
          if (res.isFinal) {
            finalTranscript += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        // Place interim text into the chat input without losing cursor position.
        try {
          if (elements.chatInput) {
            const prev = elements.chatInput.value;
            elements.chatInput.value = finalTranscript + interim;
            // maintain resize behavior by dispatching input
            elements.chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (e) {
          safeLog('Failed to update chat input with interim transcript', e);
        }

        // If final text arrived and autoSendOnStop is true, leave it to onend handler to send.
      };

      state.recognition = r;
      return r;
    }

    function setGlobeListening(on) {
      try {
        const globe = document.getElementById('globeContainer');
        if (globe) globe.dataset.state = on ? 'listening' : 'idle';
        const vp = document.getElementById('viewport');
        if (vp) {
          if (on) vp.classList.add('listening'); else vp.classList.remove('listening');
        }
      } catch (e) { /* ignore */ }
    }

    const elements = createUIElements(null, opts);

    // Exposed API
    const api = {
      startListening: function () {
        try {
          if (!state.recognition) initRecognition();
          if (!state.recognition) return false;
          state.recognition.start();
          return true;
        } catch (e) {
          safeLog('Failed to start recognition', e);
          return false;
        }
      },
      stopListening: function () {
        try { if (state.recognition && state.isListening) state.recognition.stop(); return true; } catch (e) { safeLog('Failed to stop recognition', e); return false; }
      },
      toggleListening: function () { if (state.isListening) return api.stopListening(); return api.startListening(); },
      speak: function (text) { if (opts.autoPlayTTS) return speak(text, opts); return null; },
      getState: function () { return { isListening: state.isListening, voice: state.voice }; },
      _internal: state
    };

    // Wire mic button if present
    if (elements.micButton) {
      elements.micButton.addEventListener('click', (e) => {
        e.preventDefault();
        api.toggleListening();
      });
    }

    // If autoSendOnStop, wire recognition.onend to optionally send
    // We will attempt a non-invasive approach: dispatch a custom event 'jason_stt_final' when final text is ready.
    // That way the page can listen for it and handle the message send.
    function dispatchFinalTextEvent(text) {
      const evt = new CustomEvent('jason_stt_final', { detail: { text } });
      window.dispatchEvent(evt);
    }

    // Provide a safe listener to detect final transcript on onresult -> if final, dispatch
    function attachFinalDispatch(recognition) {
      if (!recognition) return;
      recognition.addEventListener('result', (ev) => {
        let combinedFinal = '';
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          if (ev.results[i].isFinal) combinedFinal += ev.results[i][0].transcript;
        }
        if (combinedFinal.trim().length > 0) {
          dispatchFinalTextEvent(combinedFinal.trim());
        }
      });

      recognition.addEventListener('end', () => {
        // On end we also dispatch the current input value as final fallback
        try {
          if (elements.chatInput && elements.chatInput.value.trim().length > 0) {
            dispatchFinalTextEvent(elements.chatInput.value.trim());
          }
        } catch (e) {}
      });
    }

    // Initialize recognition instance and attach final dispatch
    try {
      const r = initRecognition();
      if (r) attachFinalDispatch(r);
    } catch (e) { safeLog('initRecognition failed', e); }

    // Helpful console instructions for the user
    safeLog('Jason STT+TTS module initialized. Use window.JasonSTTTS.startListening() to request mic permission and begin.');

    return api;
  }

  // Attach module to window for easy access
  global.JasonSTTTS = global.JasonSTTTS || {};
  global.JasonSTTTS.init = function (options) {
    const opts = Object.assign({}, defaultOptions, options || {});
    // Guard: do not run in non-DOM env
    if (typeof document === 'undefined') return null;
    const moduleApi = buildModule(opts);

    // If startOnInit true, start listening (will request permission)
    if (opts.startOnInit) {
      setTimeout(() => { try { moduleApi.startListening(); } catch (e) { safeLog('startOnInit failed', e); } }, 80);
    }

    return moduleApi;
  };

})(window);
