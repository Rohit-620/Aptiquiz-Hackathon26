/**
 * AptiQuiz 3D Holographic Scene Controller (Three.js Engine)
 * Renders an interactive 3D futuristic holographic quiz arena:
 * - Floating glassmorphic holographic rings
 * - Central luminous glowing octahedron core
 * - Dimensionally orbiting data cubes with glow trails
 * - Ambient starry cyberspace particle field
 * - Gentle mouse/touch parallax response
 */

class Arena3DScene {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.coreMesh = null;
    this.ringMesh1 = null;
    this.ringMesh2 = null;
    this.floatingCubes = [];
    this.particles = null;
    this.animationFrameId = null;

    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.init();
  }

  init() {
    // If WebGL is not available, graceful fallback handled via CSS
    try {
      const width = this.container.clientWidth || 500;
      const height = this.container.clientHeight || 450;

      // 1. Scene & Camera
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.set(0, 1.2, 5.5);

      // 2. WebGL Renderer
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.container.appendChild(this.renderer.domElement);

      // 3. Lighting (Esports Cyan & Violet Accents)
      const ambientLight = new THREE.AmbientLight(0x0f172a, 2.5);
      this.scene.add(ambientLight);

      const cyanPoint = new THREE.PointLight(0x00f2fe, 3, 20);
      cyanPoint.position.set(3, 4, 3);
      this.scene.add(cyanPoint);

      const purplePoint = new THREE.PointLight(0x8b5cf6, 3, 20);
      purplePoint.position.set(-3, -2, 2);
      this.scene.add(purplePoint);

      const centralGlow = new THREE.PointLight(0x38bdf8, 4, 8);
      centralGlow.position.set(0, 0, 0);
      this.scene.add(centralGlow);

      // 4. Central Luminous Core (Energy Prism)
      const coreGeo = new THREE.OctahedronGeometry(0.9, 0);
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: 0x00f2fe,
        emissive: 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.1,
        metalness: 0.2,
        transmission: 0.7,
        ior: 1.5,
        transparent: true,
        opacity: 0.92,
        wireframe: false
      });
      this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
      this.scene.add(this.coreMesh);

      // Wireframe overlay for the holographic core
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.4 });
      const wireMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), wireMat);
      this.coreMesh.add(wireMesh);

      // 5. Holographic Orbital Rings
      const ringGeo1 = new THREE.TorusGeometry(1.6, 0.035, 16, 100);
      const ringMat1 = new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x00f2fe,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8
      });
      this.ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
      this.ringMesh1.rotation.x = Math.PI / 3;
      this.scene.add(this.ringMesh1);

      const ringGeo2 = new THREE.TorusGeometry(2.1, 0.025, 16, 100);
      const ringMat2 = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.7
      });
      this.ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
      this.ringMesh2.rotation.y = Math.PI / 4;
      this.ringMesh2.rotation.x = -Math.PI / 4;
      this.scene.add(this.ringMesh2);

      // 6. Floating Glassmorphic Data Nodes (Mini Cubes)
      const cubeGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
      const cubeMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.5,
        transparent: true,
        opacity: 0.85
      });

      for (let i = 0; i < 6; i++) {
        const cube = new THREE.Mesh(cubeGeo, cubeMat);
        const angle = (i / 6) * Math.PI * 2;
        const radius = 2.4;
        cube.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 1.5, Math.sin(angle) * radius);
        cube.rotationSpeed = {
          x: (Math.random() - 0.5) * 0.03,
          y: (Math.random() - 0.5) * 0.03
        };
        cube.orbitAngle = angle;
        cube.orbitRadius = radius;
        cube.orbitSpeed = 0.008 + (Math.random() * 0.006);
        this.floatingCubes.push(cube);
        this.scene.add(cube);
      }

      // 7. Ambient Starlight Cyberspace Particle Field
      const particleCount = 200;
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 12;
        positions[i + 1] = (Math.random() - 0.5) * 10;
        positions[i + 2] = (Math.random() - 0.5) * 8;
      }
      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particleMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.04,
        transparent: true,
        opacity: 0.7
      });
      this.particles = new THREE.Points(particleGeo, particleMat);
      this.scene.add(this.particles);

      // Event Listeners
      window.addEventListener('resize', this.onWindowResize.bind(this));
      window.addEventListener('mousemove', this.onMouseMove.bind(this));

      // Start Render Loop
      this.animate();
    } catch (e) {
      console.warn('[3D Scene] WebGL not available, CSS fallback activated:', e.message);
    }
  }

  onMouseMove(e) {
    if (this.isReducedMotion) return;
    const windowHalfX = window.innerWidth / 2;
    const windowHalfY = window.innerHeight / 2;
    this.mouse.targetX = (e.clientX - windowHalfX) / windowHalfX;
    this.mouse.targetY = (e.clientY - windowHalfY) / windowHalfY;
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 450;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    // Parallax damping
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

    if (this.camera && !this.isReducedMotion) {
      this.camera.position.x = this.mouse.x * 0.8;
      this.camera.position.y = 1.2 - (this.mouse.y * 0.5);
      this.camera.lookAt(0, 0, 0);
    }

    // Core pulsing rotation
    if (this.coreMesh) {
      this.coreMesh.rotation.y += 0.012;
      this.coreMesh.rotation.x += 0.007;
      const scale = 1 + Math.sin(Date.now() * 0.002) * 0.05;
      this.coreMesh.scale.set(scale, scale, scale);
    }

    // Rings Rotation
    if (this.ringMesh1) {
      this.ringMesh1.rotation.z += 0.008;
      this.ringMesh1.rotation.x += 0.004;
    }
    if (this.ringMesh2) {
      this.ringMesh2.rotation.z -= 0.006;
      this.ringMesh2.rotation.y += 0.005;
    }

    // Floating Orbiting Data Cubes
    this.floatingCubes.forEach(cube => {
      cube.orbitAngle += cube.orbitSpeed;
      cube.position.x = Math.cos(cube.orbitAngle) * cube.orbitRadius;
      cube.position.z = Math.sin(cube.orbitAngle) * cube.orbitRadius;
      cube.rotation.x += cube.rotationSpeed.x;
      cube.rotation.y += cube.rotationSpeed.y;
    });

    // Particle slow drift
    if (this.particles) {
      this.particles.rotation.y += 0.0008;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
}

window.Arena3DScene = Arena3DScene;
