document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const globeContainer = document.getElementById('globeContainer');

    // 1. Theme Switcher Logic
    const savedTheme = localStorage.getItem('jason_ui_theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('jason_ui_theme', newTheme);

        // Update Three.js Globe colors based on theme if needed
        updateGlobeTheme(newTheme);
    });

    // 2. Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // 3. Send Message Interaction (Frontend Prototype Mock)
    function handleSendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Append User Message
        const timeNow = 'Just now';
        const userRow = document.createElement('div');
        userRow.className = 'message-row user';
        userRow.innerHTML = `
            <div class="message-content-group">
                <div class="message-sender">Sir RJ</div>
                <div class="message-bubble">${escapeHtml(text)}</div>
                <div class="message-timestamp">${timeNow}</div>
            </div>
            <div class="message-avatar user-av">RJ</div>
        `;
        chatMessages.appendChild(userRow);

        // Clear Input & reset height
        chatInput.value = '';
        chatInput.style.height = 'auto';
        scrollToBottom();

        // Simulate Assistant Reply after a brief pause
        setTimeout(() => {
            const assistantRow = document.createElement('div');
            assistantRow.className = 'message-row assistant';
            assistantRow.innerHTML = `
                <div class="message-avatar">J</div>
                <div class="message-content-group">
                    <div class="message-sender">Jason</div>
                    <div class="message-bubble">
                        Telemetry received and verified, Sir. Holographic matrix and particle grid operational. How else may I assist your protocols?
                    </div>
                    <div class="message-timestamp">Just now</div>
                </div>
            `;
            chatMessages.appendChild(assistantRow);
            scrollToBottom();
        }, 800);
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
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    // ==========================================
    // 4. THREE.JS J.A.R.V.I.S. BLUE HOLOGRAPHIC GLOBE
    // ==========================================
    let scene, camera, renderer, globeGroup;
    let globeMaterial, wireframeMaterial, particleSystem, connectionLines;
    let animationFrameId;

    function initThreeGlobe() {
        if (!globeContainer) return;

        // Scene
        scene = new THREE.Scene();

        // Camera
        camera = new THREE.PerspectiveCamera(
            60,
            globeContainer.clientWidth / globeContainer.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 4.2;

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(globeContainer.clientWidth, globeContainer.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        globeContainer.appendChild(renderer.domElement);

        // Group for rotation
        globeGroup = new THREE.Group();
        scene.add(globeGroup);

        const isDark = htmlElement.getAttribute('data-theme') === 'dark';
        const globeColor = isDark ? 0x00f0ff : 0x2563eb;
        const particleColor = isDark ? 0x00f0ff : 0x1d4ed8;

        // 1. Inner glowing core sphere
        const sphereGeo = new THREE.SphereGeometry(1.5, 32, 32);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: globeColor,
            wireframe: true,
            transparent: true,
            opacity: 0.18
        });
        const innerSphere = new THREE.Mesh(sphereGeo, sphereMat);
        globeGroup.add(innerSphere);

        // 2. Latitude and Longitude Rings / Connected Lines (JARVIS style wireframe rings)
        const ringGeo = new THREE.RingGeometry(1.52, 1.55, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: globeColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.4
        });
        
        const ring1 = new THREE.Mesh(ringGeo, ringMat);
        globeGroup.add(ring1);

        const ring2 = new THREE.Mesh(ringGeo, ringMat);
        ring2.rotation.x = Math.PI / 2;
        globeGroup.add(ring2);

        const ring3 = new THREE.Mesh(ringGeo, ringMat);
        ring3.rotation.y = Math.PI / 2;
        globeGroup.add(ring3);

        // 3. Particle Surface Cloud (Nodes)
        const particleCount = 450;
        const particleGeo = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            // Distribute on sphere surface radius ~1.5
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
        
        const particleMat = new THREE.PointsMaterial({
            color: particleColor,
            size: 0.04,
            transparent: true,
            opacity: 0.85
        });

        particleSystem = new THREE.Points(particleGeo, particleMat);
        globeGroup.add(particleSystem);

        // 4. Interconnected Line Matrix (Connecting nearby particles like JARVIS)
        const linePositions = [];
        const maxDist = 0.45;
        const positions = particleGeo.attributes.position.array;

        for (let i = 0; i < positions.length; i += 3) {
            for (let j = i + 3; j < positions.length; j += 3) {
                const dx = positions[i] - positions[j];
                const dy = positions[i + 1] - positions[j + 1];
                const dz = positions[i + 2] - positions[j + 2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < maxDist) {
                    linePositions.push(positions[i], positions[i + 1], positions[i + 2]);
                    linePositions.push(positions[j], positions[j + 1], positions[j + 2]);
                }
            }
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({
            color: globeColor,
            transparent: true,
            opacity: 0.22
        });
        connectionLines = new THREE.LineSegments(lineGeo, lineMat);
        globeGroup.add(connectionLines);

        // Ambient lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        // Window resize listener
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);

        // Rotate globe smoothly
        if (globeGroup) {
            globeGroup.rotation.y += 0.0025;
            globeGroup.rotation.x += 0.0008;
        }

        renderer.render(scene, camera);
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
            if (child.material) {
                child.material.color.setHex(color);
            }
        });
    }

    // Initialize Three.js on load
    initThreeGlobe();
});
