README - STT+TTS integration for prototype-jason-ui

Overview
--------
This folder contains a safe, opt-in Web Speech API integration (Speech-to-Text and Text-to-Speech) for your prototype-jason-ui. I did NOT modify any files in prototype-jason-ui. Instead I created a small, self-contained JS module and supporting files here so you can review and copy the exact snippets into your project when you are ready.

Design goals (per your request)
- Both STT (continuous listen-until-stop) and TTS (auto-play responses).
- Default language: en-US.
- Prefer a male-sounding voice (heuristic selection) and non-robotic pitch/rate.
- TTS auto-plays assistant responses; STT fills the chat input with interim text and sends on stop (optional behavior you can enable).
- All behavior is opt-in. Nothing runs without calling the initialization function from your UI.
- Includes safe checks and conservative defaults to avoid breaking the current UI.

Files
-----
- stt_tts_bridge.js  -> Main JavaScript module. Add to your site or copy code into script.js. See usage below.
- styles.css         -> Minimal CSS for an optional microphone button and small controls. Copy into your styles.css or include separately.
- demo.html          -> Standalone demo page (uses the module) for quick local testing.
- README.txt         -> This file.

How to install (two options)
---------------------------
Option A — Inject the module as a separate script (recommended for testing):
1) Copy jason_programs/STT+TTS/stt_tts_bridge.js into prototype-jason-ui/ (or reference via a local server).
2) Add this script include near the end of prototype-jason-ui/index.html just before the existing <script src="script.js"></script> line, for example:

    <!-- STT+TTS bridge (optional) -->
    <script src="../jason_programs/STT+TTS/stt_tts_bridge.js"></script>

3) Call the initializer from the console or from script.js after DOMContentLoaded, for example inside your existing DOMContentLoaded handler add:

    // After your existing initialization code
    if (window.JasonSTTTS) {
      window.JasonSTTTS.init({
        chatInputSelector: '#chatInput',
        chatMessagesSelector: '#chatMessages',
        language: 'en-US',
        continuous: true, // listen-until-stop
        autoSendOnStop: false, // set true to send the message automatically on stop
        autoPlayTTS: true, // auto-play assistant responses
        preferMale: true, // try to pick a male-sounding voice
        attachMicButton: true // module will add a safe mic button if a selector exists
      });
    }

Option B — Copy-paste into your existing script.js (if you prefer inline):
- Open prototype-jason-ui/script.js and paste the contents of stt_tts_bridge.js at the end of the file.
- Call window.JasonSTTTS.init(...) as shown above.

Important notes & safety
-----------------------
- The module will NOT automatically request microphone permission unless you call startListening() or set startOnInit: true.
- The code checks for SpeechRecognition and SpeechSynthesis support and logs fallback messages to the console instead of throwing errors.
- TTS voice selection is heuristic — browsers have different voice names. It picks an en-US voice and prefers names commonly used by male voices. If none match, it uses the browser default.

If something fails
------------------
- No errors will be written to your UI. See console logs for detailed status messages and reasons.
- If SpeechRecognition isn't available in your browser, STT will be disabled and the mic button will be disabled. TTS will still work in most modern browsers.

What I will do next if you approve
----------------------------------
- If you confirm, I can either (A) add the script include to prototype-jason-ui/index.html and a small initializer in script.js, or (B) keep this separate and let you copy-paste. You asked to review code first — this is the folder with the code. Tell me which lines you want changed in the main project and I will make only those edits after you confirm.

— Jason
