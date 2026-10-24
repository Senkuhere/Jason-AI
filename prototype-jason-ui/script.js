document.addEventListener('DOMContentLoaded', () => {

    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const imageInput = document.getElementById('imageInput');
    const imageButton = document.getElementById('imageButton');


    const chatMessages = document.getElementById('chatMessages');
    const globeContainer = document.getElementById('globeContainer');
    const globeStateLabel = document.getElementById('globeStateLabel');
    const imageAttachment = document.getElementById("imageAttachment");
    const imagePreview = document.getElementById("imagePreview");
    const removeImageButton = document.getElementById("removeImageButton");

    const typingIndicator =document.getElementById("typingIndicator");
    // 1. Theme Switcher Logic
    const savedTheme = localStorage.getItem('jason_ui_theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('jason_ui_theme', newTheme);
        updateGlobeTheme(newTheme);
    });

    

    // 2. Auto-resize textarea
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Typing -> listening trigger
    let typingTimer = null;
    const TYPING_TIMEOUT = 900; // ms without typing -> back to idle

    function notifyTyping() {
        document.querySelector('.chat-input-wrapper').classList.add('listening');
        setGlobeState('listening', 0.12);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            document.querySelector('.chat-input-wrapper').classList.remove('listening');
            setGlobeState('idle', 0.6);
        }, TYPING_TIMEOUT);
    }

        // ---- Attachments: up to 5 images and 5 files per message ----
    const MAX_ATTACHMENTS = 5;
    const MAX_IMAGE_MB = 5;
    const MAX_FILE_MB = 15;
    const MAX_TOTAL_MB = 40;

    let selectedImages = [];
    let selectedFiles = [];

    imageInput.multiple = true;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.accept =
        ".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.json,.html,.css,.js,.py,.xml,.yml,.yaml,.log";
    fileInput.hidden = true;
    document.body.appendChild(fileInput);

    // One tray holds image thumbnails and file chips. The old single preview is unused now.
    const tray = document.createElement("div");
    tray.className = "attachment-tray";
    tray.hidden = true;
    imageAttachment.parentNode.insertBefore(tray, imageAttachment);
    imageAttachment.hidden = true;

    function attachmentBytes() {
        return [...selectedImages, ...selectedFiles].reduce(
            (sum, item) => sum + item.size,
            0
        );
    }

    function makeRemoveButton(onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "×";
        button.title = "Remove";
        button.addEventListener("click", onClick);
        return button;
    }

    function renderTray() {
        tray.textContent = "";

        selectedImages.forEach((image, index) => {
            const item = document.createElement("div");
            item.className = "attachment-item attachment-image";

            const thumbnail = document.createElement("img");
            thumbnail.src = `data:${image.mimeType};base64,${image.data}`;
            thumbnail.alt = image.name;

            item.append(
                thumbnail,
                makeRemoveButton(() => {
                    selectedImages.splice(index, 1);
                    renderTray();
                })
            );
            tray.appendChild(item);
        });

        selectedFiles.forEach((file, index) => {
            const chip = document.createElement("div");
            chip.className = "file-chip";

            const name = document.createElement("span");
            name.textContent = `📎 ${file.name}`;

            chip.append(
                name,
                makeRemoveButton(() => {
                    selectedFiles.splice(index, 1);
                    renderTray();
                })
            );
            tray.appendChild(chip);
        });

        const hasAny = selectedImages.length + selectedFiles.length > 0;
        tray.hidden = !hasAny;
        imageButton.classList.toggle("has-image", hasAny);
    }

    // ---- + button menu ----
    const attachMenu = document.createElement("div");
    attachMenu.className = "attach-menu";
    attachMenu.hidden = true;

    const imageOption = document.createElement("button");
    imageOption.type = "button";
    imageOption.textContent = "🖼️ Image";

    const fileOption = document.createElement("button");
    fileOption.type = "button";
    fileOption.textContent = "📄 File";

    attachMenu.append(imageOption, fileOption);
    document.body.appendChild(attachMenu);

    function closeAttachMenu() {
        attachMenu.hidden = true;
    }

    imageButton.addEventListener("click", event => {
        event.stopPropagation();

        if (!attachMenu.hidden) {
            closeAttachMenu();
            return;
        }

        const rect = imageButton.getBoundingClientRect();
        attachMenu.style.left = `${rect.left}px`;
        attachMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
        attachMenu.hidden = false;
    });

    imageOption.addEventListener("click", () => {
        closeAttachMenu();
        imageInput.click();
    });

    fileOption.addEventListener("click", () => {
        closeAttachMenu();
        fileInput.click();
    });

    document.addEventListener("click", closeAttachMenu);

    // ---- Picking images ----
    imageInput.addEventListener("change", async () => {
        const picked = [...imageInput.files];
        imageInput.value = "";

        for (const file of picked) {
            if (selectedImages.length >= MAX_ATTACHMENTS) {
                appendMessage("assistant", `You can attach up to ${MAX_ATTACHMENTS} images per message.`);
                break;
            }

            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                appendMessage("assistant", `${file.name}: only PNG, JPEG, and WebP images are supported.`);
                continue;
            }

            if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
                appendMessage("assistant", `${file.name} is larger than ${MAX_IMAGE_MB} MB.`);
                continue;
            }

            if (attachmentBytes() + file.size > MAX_TOTAL_MB * 1024 * 1024) {
                appendMessage("assistant", `Attachments can total up to ${MAX_TOTAL_MB} MB per message.`);
                break;
            }

            const dataUrl = await readFileAsDataUrl(file);

            selectedImages.push({
                name: file.name,
                mimeType: file.type,
                data: dataUrl.split(",")[1],
                size: file.size
            });
        }

        renderTray();
    });

    // ---- Picking files ----
    fileInput.addEventListener("change", async () => {
        const picked = [...fileInput.files];
        fileInput.value = "";

        for (const file of picked) {
            if (selectedFiles.length >= MAX_ATTACHMENTS) {
                appendMessage("assistant", `You can attach up to ${MAX_ATTACHMENTS} files per message.`);
                break;
            }

            if (file.size > MAX_FILE_MB * 1024 * 1024) {
                appendMessage("assistant", `${file.name} is larger than ${MAX_FILE_MB} MB.`);
                continue;
            }

            if (attachmentBytes() + file.size > MAX_TOTAL_MB * 1024 * 1024) {
                appendMessage("assistant", `Attachments can total up to ${MAX_TOTAL_MB} MB per message.`);
                break;
            }

            const dataUrl = await readFileAsDataUrl(file);

            selectedFiles.push({
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                data: dataUrl.split(",")[1],
                size: file.size
            });
        }

        renderTray();
    });

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("The image could not be read."));
            reader.readAsDataURL(file);
        });
    }

    chatInput.addEventListener('input', () => notifyTyping());
    chatInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') notifyTyping();
    });

    async function loadConversationHistory() {
        try {
            const response = await fetch("/api/history");
            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Conversation history could not load."
                );
            }

            for (const message of data.messages || []) {
                appendMessage(
                    message.role,
                    String(message.content ?? "")
                        .replace(/\n*\[Attached file: "([^"]+)"[^\]]*\]/g, "\n📎 $1")
                        .trim(),
                    message.images || message.image ||null,
                    message.timestamp
                );
            }

            scrollToBottom();
        } catch (error) {
            console.error(
                "Conversation history failed:",
                error.message
            );
        }
    }

    // 3. Send Message Interaction (Frontend Prototype Mock)
    async function handleSendMessage() {
        console.log("handleSendMessage called");
        const text = chatInput.value.trim();
        const hasAttachments =
            selectedImages.length > 0 || selectedFiles.length > 0;

        if ((!text && !hasAttachments) || sendBtn.disabled) {
            return;
        }

        const imagesToSend = selectedImages.map(
            ({ name, mimeType, data }) => ({ name, mimeType, data })
        );
        const filesToSend = selectedFiles.map(
            ({ name, mimeType, data }) => ({ name, mimeType, data })
        );

        const fileLines = filesToSend
            .map(file => `📎 ${file.name}`)
            .join("\n");

        appendMessage(
            "user",
            [text, fileLines].filter(Boolean).join("\n"),
            imagesToSend
        );

        selectedImages = [];
        selectedFiles = [];
        renderTray();

        chatInput.value = "";
        chatInput.style.height = "auto";
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");

        // brief listening pulse on send
        setGlobeState('listening', 0.12);
        clearTimeout(typingTimer);
        
        // Transition to thinking state: Idea 2 (Holographic Data-Scan Sweep)
        setTimeout(() => {
            setGlobeState('thinking', 0.4);
        }, 300);

        setTypingIndicator(true);
        if (window.jasonStream) window.jasonStream.reset();   // a new request: forget any old streaming bubble
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: text,
                    images: imagesToSend,
                    files: filesToSend,
                    // Lets the server send early sentences back to THIS page only
                    clientId: window.jasonClientId || null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Jason could not process the message.");
            }

            
            // If the answer was already streaming into a bubble, finish that bubble instead of adding a second one
            const wasStreamed = window.jasonStream
                ? window.jasonStream.finish(String(data.reply || ""))
                : false;

            if (!wasStreamed) appendMessage("assistant", data.reply);
            // Auto-play assistant voice if STT+TTS was initialized
            // --------------TRIAL STT+TTS----------------------

            if (window.jasonSttTts && typeof window.jasonSttTts.speak === 'function') {
            try { window.jasonSttTts.speak(String(data.reply || '')); } catch (e) { console.warn('TTS speak failed', e); }
            }

            // --------------TRIAL STT+TTS----------------------


            displayFailureEvents(data.events);

            setGlobeState('idle', 0.5);
        } catch (error) {
            if (window.jasonStream) window.jasonStream.discard();   // remove a half-streamed answer
            appendMessage("assistant", `Connection error: ${error.message}`);
            setGlobeState('idle', 0.5);
        } finally {
            setTypingIndicator(false);
            sendBtn.disabled = false;
            sendBtn.removeAttribute("aria-busy");
            chatInput.focus();
        }
    }

    function appendMessage(role, text, images = null, timestamp = null) {
        const row = document.createElement("div");
        row.className = `message-row ${role}`;

        const sender = role === "user" ? "Sir RJ" : "Jason";
        const avatar = role === "user"
            ? `<div class="message-avatar user-av">RJ</div>`
            : `<div class="message-avatar">J</div>`;

        const userAvatar = role === "user" ? avatar : "";
        const assistantAvatar = role === "assistant" ? avatar : "";

        // Create a list of images to display
        const imageList = Array.isArray(images)
            ? images
            : images
                ? [images]
                : [];

        const imageMarkup = imageList.length
            ? `<div class="message-images">${imageList
                .map(
                    image => `
                <img
                    class="message-image"
                    src="${image.url || `data:${image.mimeType};base64,${image.data}`}"
                    alt="User attached image"
                >`
                )
                .join("")}</div>`
            : "";

        const displayTime = timestamp
            ? new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })
            : new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });
        const formatted = escapeHtml(text).replace(/\n/g, "<br>");
        row.innerHTML = `
            ${assistantAvatar}
            <div class="message-content-group">
                <div class="message-sender">${sender}</div>
                <div class="message-bubble">
                    ${imageMarkup}
                    ${text ? `<div>${formatted}</div>` : ""}
                </div>
                <div class="message-timestamp">
                    ${displayTime}
                </div>
            </div>
            ${userAvatar}
        `;

        chatMessages.appendChild(row);
        scrollToBottom();
        return row;   // streaming needs the row, to keep updating its text
    }
    function displayFailureEvents(events = []) {
        const uniqueFailures = new Map();

        for (const event of events) {
            if (!event.type?.endsWith("_failed")) {
                continue;
            }

            const source = event.name || "";
            const details = String(
                event.error || "Unknown failure."
            );

            const key = `${event.type}:${source}:${details}`;

            if (!uniqueFailures.has(key)) {
                uniqueFailures.set(key, {
                    event,
                    source,
                    details
                });
            }
        }

        if (uniqueFailures.size === 0) {
            return;
        }

        const diagnosticText = [
            "Diagnostics:",
            ...uniqueFailures.values().map(item => {
                const source = item.source
                    ? ` (${item.source})`
                    : "";

                return `${item.event.type}${source}: ${item.details}`;
            })
        ].join("\n");

        appendMessage("assistant", diagnosticText);
    }

    sendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>\'\"]/g,
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    // ==========================================
    // 4. THREE.JS J.A.R.V.I.S. BLUE HOLOGRAPHIC GLOBE + DATA-SCAN SWEEP (Idea 2)
    // ==========================================
    let scene, camera, renderer, globeGroup;
    let innerSphere, coreSphere, rings = [], particleSystem, connectionLines;
    let scanLaserRing; // Idea 2: Holographic Data-Scan Sweep laser ring
    let topIndicatorMesh; // State indicator at the top of the globe
    let lastTime = 0;

    let globeState = 'idle';
    let transition = { from: null, to: null, t: 1, duration: 0.6 };

    const live = {
        rotationSpeed: 0.0025,
        ringSpeedMultiplier: 1.0,
        corePulseIntensity: 1.0,
        particleSpeed: 0.02,
        lineOpacity: 0.22,
        scanLaserOpacity: 0.0,
        indicatorColorMix: 0.0 // 0 = cyan, 1 = red
    };

    const stateTargets = {
        idle: {
            rotationSpeed: 0.0025,
            ringSpeedMultiplier: 1.0,
            corePulseIntensity: 1.0,
            particleSpeed: 0.02,
            lineOpacity: 0.22,
            scanLaserOpacity: 0.0,
            indicatorColorMix: 0.0
        },
        listening: {
            rotationSpeed: 0.0018,
            ringSpeedMultiplier: 1.4,
            corePulseIntensity: 1.8,
            particleSpeed: 0.025,
            lineOpacity: 0.32,
            scanLaserOpacity: 0.15,
            indicatorColorMix: 0.0
        },
        speaking: {
            rotationSpeed: 0.0022,
            ringSpeedMultiplier: 1.5,
            corePulseIntensity: 2.2,
            particleSpeed: 0.03,
            lineOpacity: 0.38,
            scanLaserOpacity: 0.0,
            indicatorColorMix: 0.0
        },

        thinking: {
            rotationSpeed: 0.0028,
            ringSpeedMultiplier: 1.8,
            corePulseIntensity: 1.6,
            particleSpeed: 0.025, // clean and calm particles, no chaotic jitter
            lineOpacity: 0.35,
            scanLaserOpacity: 1.0, // Fully active scanning laser ring sweep!
            indicatorColorMix: 1.0 // Transition to red in thinking state!
        }
    };

    function setGlobeState(state, duration = 0.5) {
        if (!stateTargets[state]) return;
        transition.from = { ...live };
        transition.to = { ...stateTargets[state] };
        transition.t = 0;
        transition.duration = Math.max(0.05, duration);
        globeState = state;
        if (globeStateLabel) {
            globeStateLabel.textContent = state.toUpperCase();
            if (state === 'thinking') {
                globeStateLabel.classList.add('thinking');
            } else {
                globeStateLabel.classList.remove('thinking');
            }
        }
        if (globeContainer) globeContainer.dataset.state = state;

        const viewportEl = document.getElementById('viewport');
        if (viewportEl) {
            if (state === 'thinking') {
                viewportEl.classList.add('thinking');
            } else {
                viewportEl.classList.remove('thinking');
            }
        }

        // Update screen-reader status for processing announcement (aria-live polite)
        try {
            const statusEl = document.getElementById('processingStatus');
            if (statusEl) {
                if (state === 'thinking') {
                    statusEl.textContent = 'Processing';
                } else {
                    // Clear the polite live region so it doesn't keep announcing
                    statusEl.textContent = '';
                }
            }
        } catch (e) {
            // don't let a failure here break the UI
            console.warn('processingStatus update failed', e);
        }
    }

    function setTypingIndicator(visible) {
        console.log("Typing indicator:", visible);
        if (!typingIndicator) {
            console.warn("Typing indicator element not found.");
            return;
        }

        typingIndicator.hidden = !visible;

        if (visible) {
            chatMessages.appendChild(typingIndicator);
            scrollToBottom();
        }
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    window.startThinking = function () { setGlobeState('thinking', 0.35); };
    // Lets voice.js show the "speaking" look on the globe while Jason talks
    window.setJasonGlobeState = setGlobeState;

     // Lets events.js show a message Jason sent on his own (not an answer to anything)
    window.jasonAppendMessage = function (role, text) {
        appendMessage(role, text);
        scrollToBottom();
    };

        // ---------- Streaming answer: one chat bubble that grows while Jason's answer arrives ----------
    let streamRow = null;   // the bubble being filled, or null when there is none

    function renderStreamText(fullText) {
        const textBox = streamRow.querySelector('.message-bubble > div:last-child');
        if (textBox) textBox.innerHTML = escapeHtml(fullText).replace(/\n/g, '<br>');
        scrollToBottom();
    }

    window.jasonStream = {
        // Shows the answer so far (creates the bubble the first time)
        update(fullText) {
            if (!streamRow) {
                setTypingIndicator(false);                       // the growing bubble replaces the typing dots
                streamRow = appendMessage('assistant', fullText);
                return;
            }
            renderStreamText(fullText);
        },
        // What was streamed was not the final answer (a tool is about to be used): remove it, show the dots again
        discard() {
            if (!streamRow) return;
            streamRow.remove();
            streamRow = null;
            setTypingIndicator(true);
        },
        // The final reply arrived. If a bubble exists, put the final text in it and return true
        finish(finalText) {
            if (!streamRow) return false;
            renderStreamText(finalText);
            streamRow = null;
            return true;
        },
        // A new request starts: forget any old bubble
        reset() { streamRow = null; }
    };

    window.stopThinking = function () { setGlobeState('idle', 0.6); };

    function initThreeGlobe() {
        if (!globeContainer) return;

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(
            60,
            globeContainer.clientWidth / globeContainer.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 5.2;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(globeContainer.clientWidth, globeContainer.clientHeight);
        // adapt pixel ratio for mobile to avoid excessive GPU work on high-density screens
        const isSmallScreen = window.matchMedia('(max-width: 1080px)').matches;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmallScreen ? 1.5 : 2));
        globeContainer.appendChild(renderer.domElement);

        globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const isDark = htmlElement.getAttribute('data-theme') === 'dark';
        const globeColor = isDark ? 0x00f0ff : 0x2563eb;
        const particleColor = isDark ? 0x00f0ff : 0x1d4ed8;

        // Inner wireframe shell (clean blue/cybernetic)
        const sphereGeo = new THREE.SphereGeometry(1.5, 48, 48);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: globeColor,
            wireframe: true,
            transparent: true,
            opacity: 0.18
        });
        innerSphere = new THREE.Mesh(sphereGeo, sphereMat);
        globeGroup.add(innerSphere);

        // State indicator at the very top of the globe (removed per user request, clean core)
        topIndicatorMesh = null;

        // Core
        const coreGeo = new THREE.SphereGeometry(0.18, 32, 32);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x99ddff,
            emissive: 0x66aaff,
            metalness: 0.1,
            roughness: 0.2
        });
        coreSphere = new THREE.Mesh(coreGeo, coreMat);
        coreSphere.position.set(0, 0, 0.35);
        globeGroup.add(coreSphere);

        // Rings
        const ringGeo = new THREE.TorusBufferGeometry(1.52, 0.005, 8, 128);
        const ringMat = new THREE.MeshBasicMaterial({ color: globeColor, transparent: true, opacity: 0.35 });
        const r1 = new THREE.Mesh(ringGeo, ringMat.clone()); r1.userData.speed = 0.25; r1.rotation.x = 0.12; globeGroup.add(r1); rings.push(r1);
        const r2 = new THREE.Mesh(ringGeo, ringMat.clone()); r2.userData.speed = -0.12; r2.rotation.x = 1.2; globeGroup.add(r2); rings.push(r2);
        const r3 = new THREE.Mesh(ringGeo, ringMat.clone()); r3.userData.speed = 0.18; r3.rotation.z = 0.8; globeGroup.add(r3); rings.push(r3);

        // Idea 2: Holographic Data-Scan Sweep Laser Ring (Crimson / Red)
        const scanLaserGeo = new THREE.TorusBufferGeometry(1.54, 0.012, 12, 128);
        const scanLaserMat = new THREE.MeshBasicMaterial({
            color: 0xff2d55,
            transparent: true,
            opacity: 0.0
        });
        scanLaserRing = new THREE.Mesh(scanLaserGeo, scanLaserMat);
        scanLaserRing.rotation.x = Math.PI / 2; // horizontal scanning ring
        globeGroup.add(scanLaserRing);

        // Particles - reduce count on small screens for performance
        const particleCount = isSmallScreen ? 160 : 450;
        const particleGeo = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            const r = 1.5 + (Math.random() - 0.5) * 0.08;
            particlePositions[i] = r * Math.sin(phi) * Math.cos(theta);
            particlePositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
            particlePositions[i + 2] = r * Math.cos(phi);
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particleMat = new THREE.PointsMaterial({ color: particleColor, size: isSmallScreen ? 0.06 : 0.04, transparent: true, opacity: 0.85 });
        particleSystem = new THREE.Points(particleGeo, particleMat);
        globeGroup.add(particleSystem);

        // Connection Lines
        const linePositions = [];
        const maxDist = 0.45;
        const posArr = particleGeo.attributes.position.array;
        for (let i = 0; i < posArr.length; i += 3) {
            for (let j = i + 3; j < posArr.length; j += 3) {
                const dx = posArr[i] - posArr[j];
                const dy = posArr[i + 1] - posArr[j + 1];
                const dz = posArr[i + 2] - posArr[j + 2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < maxDist) {
                    linePositions.push(posArr[i], posArr[i + 1], posArr[i + 2]);
                    linePositions.push(posArr[j], posArr[j + 1], posArr[j + 2]);
                }
            }
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: globeColor, transparent: true, opacity: live.lineOpacity });
        connectionLines = new THREE.LineSegments(lineGeo, lineMat);
        globeGroup.add(connectionLines);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        setGlobeState('idle', 0.001);

        window.addEventListener('resize', onWindowResize);
        requestAnimationFrame(animate);
    }

    let pulsePhase = 0;
    let scanSweepTime = 0;

    const cyanColor = new THREE.Color(0x00f0ff);
    const redColor = new THREE.Color(0xff2d55);
    const currentIndicatorColor = new THREE.Color();

    function updateState(delta) {
        if (transition.t < 1) {
            transition.t = Math.min(1, transition.t + delta / transition.duration);
            const u = transition.t < 0.5
                ? 4 * Math.pow(transition.t, 3)
                : 1 - Math.pow(-2 * transition.t + 2, 3) / 2;
            for (let k in transition.to) {
                live[k] = lerp(transition.from[k], transition.to[k], u);
            }
        } else {
            Object.assign(live, stateTargets[globeState]);
        }

        globeGroup.rotation.y += live.rotationSpeed * (delta * 60);
        globeGroup.rotation.x += (live.rotationSpeed * 0.32) * (delta * 60);

        rings.forEach(r => { r.rotation.z += r.userData.speed * live.ringSpeedMultiplier * delta * 40; });

        pulsePhase += delta * 2.0;
        coreSphere.scale.setScalar(0.9 + 0.12 * Math.abs(Math.sin(pulsePhase * 2.5)) * live.corePulseIntensity);
        if (coreSphere.material && 'emissiveIntensity' in coreSphere.material) {
            coreSphere.material.emissiveIntensity = 0.9 * live.corePulseIntensity;
        }

        particleSystem.rotation.y += live.particleSpeed * delta * 60;
        if (connectionLines && connectionLines.material) connectionLines.material.opacity = live.lineOpacity;

        // Smoothly transition the top state indicator color from cyan to red when thinking (no-op since indicator removed)
        if (topIndicatorMesh && topIndicatorMesh.material) {
            const isDark = htmlElement.getAttribute('data-theme') === 'dark';
            const baseCyan = isDark ? 0x00f0ff : 0x2563eb;
            cyanColor.setHex(baseCyan);
            currentIndicatorColor.copy(cyanColor).lerp(redColor, live.indicatorColorMix);
            topIndicatorMesh.material.color.copy(currentIndicatorColor);
        }

        // Idea 2: Holographic Data-Scan Sweep Laser Ring animation
        if (scanLaserRing) {
            scanLaserRing.material.opacity = live.scanLaserOpacity;
            if (live.scanLaserOpacity > 0.01) {
                scanSweepTime += delta * 3.5;
                // Sweep vertically up and down along the y axis using sin wave between -1.4 and 1.4
                scanLaserRing.position.y = Math.sin(scanSweepTime) * 1.4;
                // Add subtle scale pulse
                const pulseScale = 1.0 + 0.04 * Math.sin(scanSweepTime * 3);
                scanLaserRing.scale.set(pulseScale, 1.0, pulseScale);
            } else {
                scanLaserRing.position.y = 0;
            }
        }
    }

    function animate(timestamp) {
        const t = timestamp || performance.now();
        const delta = lastTime ? (t - lastTime) / 1000 : 0.016;
        lastTime = t;

        updateState(delta);

        if (renderer && scene && camera) renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    function onWindowResize() {
        if (!globeContainer || !renderer || !camera) return;
        const width = globeContainer.clientWidth;
        const height = globeContainer.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function updateGlobeTheme(theme) {
        if (!globeGroup) return;
        const isDark = theme === 'dark';
        const color = isDark ? 0x00f0ff : 0x2563eb;
        globeGroup.traverse((child) => {
            if (child === scanLaserRing || child === topIndicatorMesh) return; // keep laser ring and top indicator independent
            if (child.material && child.material.color) {
                try { child.material.color.setHex(color); } catch (e) { /* ignore */ }
            }
        });
    }
    loadConversationHistory();
    initThreeGlobe();
});



// ==========================================
// 5. CONSOLE DEBUG HELPER FOR SCREEN READER ANNOUNCEMENTS
// ==========================================
window.jasonDebug = {
    testProcessingAnnouncement: function(text = 'Processing') {
        const statusEl = document.getElementById('processingStatus');
        if (!statusEl) {
            console.warn('[JasonDebug] #processingStatus element not found in DOM.');
            return false;
        }
        statusEl.textContent = '';
        setTimeout(() => {
            statusEl.textContent = text;
            console.log('[JasonDebug] #processingStatus updated to:', JSON.stringify(text));
            console.log('[JasonDebug] Current element DOM state:', statusEl);
        }, 30);
        return true;
    },
    inspectStatusElement: function() {
        const statusEl = document.getElementById('processingStatus');
        console.log('[JasonDebug] Status Element:', statusEl);
        console.log('[JasonDebug] textContent:', statusEl ? statusEl.textContent : 'N/A');
        console.log('[JasonDebug] aria-live:', statusEl ? statusEl.getAttribute('aria-live') : 'N/A');
        return statusEl;
    }
};

console.log('%c[Jason Debugger] Console helper loaded. Run window.jasonDebug.testProcessingAnnouncement() to test screen-reader status live.', 'color: #00f0ff; background: #0b0f19; padding: 4px 8px; border-radius: 4px;');
