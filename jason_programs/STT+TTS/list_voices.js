// Simple script to log available voices to console
const voices = window.speechSynthesis.getVoices();
if (voices.length === 0) {
    // If empty, voices might not be loaded yet
    window.speechSynthesis.onvoiceschanged = () => {
        console.log("Available Voices:", window.speechSynthesis.getVoices().map(v => v.name));
    };
} else {
    console.log("Available Voices:", voices.map(v => v.name));
}
