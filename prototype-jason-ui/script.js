document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const imageInput = document.getElementById('imageInput');
    const imageButton = document.getElementById('imageButton');

    let selectedImage = null;

    const chatMessages = document.getElementById('chatMessages');
    const globeContainer = document.getElementById('globeContainer');
    const globeStateLabel = document.getElementById('globeStateLabel');
    const imageAttachment = document.getElementById("imageAttachment");
    const imagePreview = document.getElementById("imagePreview");
    const removeImageButton = document.getElementById("removeImageButton");

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

    imageButton.addEventListener("click", () => {
        imageInput.click();
    });

    imageInput.addEventListener("change", async () => {
        const file = imageInput.files[0];
        if (!file) return;

        const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            imageInput.value = "";
            selectedImage = null;
            imageButton.title = "Only PNG, JPEG, and WebP images are supported.";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            imageInput.value = "";
            selectedImage = null;
            imageButton.title = "Images must be smaller than 10 MB.";
            return;
        }

        const dataUrl = await readFileAsDataUrl(file);
        const base64Data = dataUrl.split(",")[1];

        selectedImage = {
            mimeType: file.type,
            data: base64Data,
            name: file.name
        };

        imagePreview.src = dataUrl;
        imageAttachment.hidden = false;
        imageButton.title = `Attached: ${file.name}`;
        imageButton.classList.add("has-image");
    });

    removeImageButton.addEventListener("click", () => {
        imageInput.value = "";
        selectedImage = null;
        imagePreview.removeAttribute("src");
        imageAttachment.hidden = true;
        imageButton.title = "Attach image";
        imageButton.classList.remove("has-image");
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
                    message.content,
                    message.image ||null,
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
        const text = chatInput.value.trim();
        if ((!text && !selectedImage) || sendBtn.disabled) {
            return;
        }
        const imageToSend = selectedImage;
        appendMessage("user", text, imageToSend);

        chatInput.value = "";
        chatInput.style.height = "auto";
        imageInput.value = "";
        selectedImage = null;
        imagePreview.removeAttribute("src");
        imageAttachment.hidden = true;
        imageButton.title = "Attach image";
        imageButton.classList.remove("has-image");
        sendBtn.disabled = true;
        sendBtn.setAttribute("aria-busy", "true");

        // brief listening pulse on send
        setGlobeState('listening', 0.12);
        clearTimeout(typingTimer);
        
        // Transition to thinking state: Idea 2 (Holographic Data-Scan Sweep)
        setTimeout(() => {
            setGlobeState('thinking', 0.4);
        }, 300);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: text,
                    image: imageToSend
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Jason could not process the message.");
            }

            appendMessage("assistant", data.reply);
            displayFailureEvents(data.events);

            setGlobeState('idle', 0.5);
        } catch (error) {
            appendMessage("assistant", `Connection error: ${error.message}`);
            setGlobeState('idle', 0.5);
        } finally {
            sendBtn.disabled = false;
            sendBtn.removeAttribute("aria-busy");
            chatInput.focus();
        }
    }

    function appendMessage(role, text, image = null, timestamp = null) {
        const row = document.createElement("div");
        row.className = `message-row ${role}`;

        const sender = role === "user" ? "Sir RJ" : "Jason";
        const avatar = role === "user"
            ? `<div class="message-avatar user-av">RJ</div>`
            : `<div class="message-avatar">J</div>`;

        const userAvatar = role === "user" ? avatar : "";
        const assistantAvatar = role === "assistant" ? avatar : "";

        const imageMarkup = image
            ? `
                <img
                    class="message-image"
                    src="${
                        image.url ||
                        `data:${image.mimeType};base64,${image.data}`
                    }"
                    alt="User attached image"
                >
            `
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
        
        row.innerHTML = `
            ${assistantAvatar}
            <div class="message-content-group">
                <div class="message-sender">${sender}</div>
                <div class="message-bubble">
                    ${imageMarkup}
                    ${text ? `<div>${escapeHtml(text)}</div>` : ""}
                </div>
                <div class="message-timestamp">
                    ${displayTime}
                </div>
            </div>
            ${userAvatar}
        `;

        chatMessages.appendChild(row);
        scrollToBottom();
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
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    window.startThinking = function () { setGlobeState('thinking', 0.35); };
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
        camera.position.z = 4.2;

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
