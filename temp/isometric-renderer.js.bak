/**
 * isometric-renderer.js - Three.js paper-isometric scene for CAESAR II geometry.
 * White background, bold line pipes, engineering symbols - looks like a paper iso drawing.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createPipeLine, createBendArc, colorForMode, OD_COLORS, toThree, generateDiscreteColor } from './pipe-geometry.js';
import { createAnchorSymbol, createGuideSymbol, createForceArrow } from './symbols.js';
import { createNodeLabel, createSegmentLabel, computeStretches } from './labels.js';
import { materialFromDensity } from '../utils/formatter.js';
import { state } from '../core/state.js';
import { on } from '../core/event-bus.js';
import { buildUniversalCSV, normalizeToPCF, adaptForRenderer } from '../utils/accdb-to-pcf.js';

export class IsometricRenderer {
  constructor(canvasContainer) {
    this._container = canvasContainer;
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._css2d = null;
    this._controls = null;
    this._animId = null;
    this._pipeGroup   = new THREE.Group();
    this._symbolGroup = new THREE.Group();
    this._labelGroup  = new THREE.Group();
    this._init();

    on('parse-complete', () => this.rebuild());
    on('geo-toggle',     () => this._applyToggles());
    on('legend-changed', () => this._rebuildAll());
  }

  _init() {
    const w = this._container.clientWidth  || 800;
    const h = this._container.clientHeight || 500;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xffffff);

    const aspect = w / h;
    const frustum = 5000;

    this._orthoCamera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      -50000, 50000
    );
    this._perspCamera = new THREE.PerspectiveCamera(45, aspect, 1, 100000);

    this._isOrtho = true;
    this._camera = this._orthoCamera;

    this._orthoCamera.up.set(0, 1, 0);
    this._perspCamera.up.set(0, 1, 0);
    this._camera.position.set(5000, 5000, 5000);
    this._camera.lookAt(0, 0, 0);

    this._viewCubeEl = null;
    this._viewCubeInner = null;
    this._navMode = 'orbit';
    this._navButtons = {};
    this._navOverlayEl = null;

    this._renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._container.appendChild(this._renderer.domElement);

    this._css2d = new CSS2DRenderer();
    this._css2d.setSize(w, h);
    this._css2d.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this._container.style.position = 'relative';
    this._container.appendChild(this._css2d.domElement);

    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.08;
    this._controls.rotateSpeed = 1.4;
    this._controls.panSpeed = 1.2;
    this._controls.zoomSpeed = 1.2;
    this._controls.addEventListener('change', () => {
      if (this._pipeGroup && this._isOrtho) {
        const box = new THREE.Box3().setFromObject(this._pipeGroup);
        if (!box.isEmpty()) {
            const sz = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(sz.x, sz.y, sz.z, 1);
            this._camera.near = -maxDim * 20;
            this._camera.far = maxDim * 20;
            this._camera.updateProjectionMatrix();
        }
      }
    });

    this._scene.add(this._pipeGroup, this._symbolGroup, this._labelGroup);

    const ro = new ResizeObserver(() => this._onResize());
    ro.observe(this._container);

    this._buildNavOverlay();
    this._buildViewCube();
    this._buildAxisGizmo();
    this._animate();
  }

  _buildNavOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'geo-nav-overlay';
    overlay.style.cssText = `
      position:absolute;top:12px;left:12px;z-index:10;
      display:flex;flex-direction:column;gap:5px;
    `;

    const BUTTONS = [
      {
        mode: 'orbit',
        title: '3D Orbit — rotate freely around model',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-20 12 12)"/>
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(70 12 12)"/>
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>
          <path d="M17.5 6.5 L20 10 L16.5 10.2" fill="currentColor" stroke="none"/>
        </svg>`,
      },
      {
        mode: 'select',
        title: 'Select — click to pick elements (pan with left-drag)',
        svg: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width="20" height="20">
          <path d="M5.5 3.5 L5.5 17 L9 13 L12 19.5 L14.2 18.5 L11.2 12 L16.5 12 Z"/>
        </svg>`,
      },
      {
        mode: 'plan',
        title: 'Rotate about X axis — spin in plan (locks elevation)',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M5 12 A7 7 0 1 1 12 19"/>
          <polyline points="10,17 12,19 10,21" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>
          <line x1="12" y1="5" x2="12" y2="19" stroke-dasharray="3,2"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <text x="3" y="10" font-size="5.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">X</text>
        </svg>`,
      },
      {
        mode: 'rotateY',
        title: 'Rotate about Y axis — 2D orbit (locks compass direction)',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <ellipse cx="12" cy="12" rx="3.5" ry="8"/>
          <line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3,2" stroke-width="1.2"/>
          <polyline points="10,4.2 12,3 13.5,5" fill="currentColor" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <text x="14.5" y="10" font-size="5.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">Y</text>
        </svg>`,
      },
    ];

    for (const { mode, title, svg } of BUTTONS) {
      const btn = document.createElement('button');
      btn.title = title;
      btn.innerHTML = svg;
      btn.dataset.mode = mode;
      btn.style.cssText = `
        width:36px;height:36px;padding:5px;
        border:1.5px solid rgba(0,0,0,0.18);border-radius:7px;
        background:rgba(255,255,255,0.88);cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        color:#333;box-shadow:0 1px 4px rgba(0,0,0,0.15);
        transition:background 0.12s,border-color 0.12s;
      `;
      btn.addEventListener('click', () => this.setNavMode(mode));
      btn.addEventListener('mouseenter', () => {
        if (this._navMode !== mode) btn.style.background = 'rgba(255,255,255,1)';
      });
      btn.addEventListener('mouseleave', () => {
        if (this._navMode !== mode) btn.style.background = 'rgba(255,255,255,0.88)';
      });
      this._navButtons[mode] = btn;
      overlay.appendChild(btn);
    }

    this._navOverlayEl = overlay;
    this._container.appendChild(overlay);
    this.setNavMode('orbit');
  }

  setNavMode(mode) {
    this._navMode = mode;

    // Always clean up any previous custom rotation handler first
    if (this._customOrbitCleanup) {
      this._customOrbitCleanup();
      this._customOrbitCleanup = null;
    }

    // Update button visual states
    for (const [m, btn] of Object.entries(this._navButtons)) {
      if (m === mode) {
        btn.style.background = 'rgba(50,100,160,0.88)';
        btn.style.borderColor = 'rgba(50,100,160,1)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'rgba(255,255,255,0.88)';
        btn.style.borderColor = 'rgba(0,0,0,0.18)';
        btn.style.color = '#333';
      }
    }

    // Reset all constraints to sane defaults
    this._controls.minPolarAngle   = 0;
    this._controls.maxPolarAngle   = Math.PI;
    this._controls.minAzimuthAngle = -Infinity;
    this._controls.maxAzimuthAngle =  Infinity;

    switch (mode) {
      case 'orbit':
        this._controls.enableRotate = true;
        this._controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
        break;

      case 'plan': {
        // Snap to near-top view, then use direct Y-axis rotation (bypass OrbitControls rotation)
        const box = new THREE.Box3();
        if (this._pipeGroup) box.setFromObject(this._pipeGroup);
        const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        const span   = box.isEmpty() ? 5000 : Math.max(...box.getSize(new THREE.Vector3()).toArray());
        const dist   = span * 1.8;
        const planPolar = 18 * Math.PI / 180;
        const az = this._controls.getAzimuthalAngle();
        this._camera.position.set(
          centre.x + dist * Math.sin(planPolar) * Math.sin(az),
          centre.y + dist * Math.cos(planPolar),
          centre.z + dist * Math.sin(planPolar) * Math.cos(az)
        );
        this._camera.up.set(0, 1, 0);
        this._camera.lookAt(centre);
        this._camera.updateProjectionMatrix();
        this._controls.target.copy(centre);
        this._controls.update();
        // Activate azimuth-only orbit (capture-phase, uses controls.rotateLeft)
        this._startAzimuthOrbit();
        break;
      }

      case 'rotateY':
        // Direct Y-axis orbit from the current view — no snap.
        // enableRotate stays true; left-button events are intercepted in
        // capture phase by _startAzimuthOrbit() before OrbitControls sees them.
        this._startAzimuthOrbit();
        break;

      case 'select':
        this._controls.enableRotate = false;
        this._controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
        break;
    }
  }

  /**
   * Azimuth-only (Y-axis) orbit.
   *
   * Two bugs killed previous attempts:
   *  1. OrbitControls calls setPointerCapture on pointerdown BEFORE it checks
   *     enableRotate, so the DOM element is captured by OrbitControls and our
   *     bubble-phase listener never receives clean move events.
   *  2. Directly writing camera.position is overwritten every frame by
   *     controls.update() which recomputes position from its own internal
   *     spherical state.
   *
   * Fix: register listeners in CAPTURE phase (fire before OrbitControls' bubble
   * handlers) and call stopPropagation() so OrbitControls never sees left-button
   * events.  Use controls.rotateLeft() so OrbitControls' own spherical state
   * is updated — controls.update() in the animation loop will then apply it
   * correctly without overwriting anything.
   * Right-drag (pan) and scroll (zoom) reach OrbitControls normally because
   * isDown is only true for button === 0.
   */
  _startAzimuthOrbit() {
    const canvas = this._renderer.domElement;
    let isDown   = false;
    let prevX    = 0;

    const onDown = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();   // block OrbitControls from capturing this event
      isDown = true;
      prevX  = e.clientX;
    };

    const onMove = (e) => {
      if (!isDown) return;   // only block when we own the drag
      e.stopPropagation();
      const dx = e.clientX - prevX;
      prevX = e.clientX;
      if (dx === 0) return;
      // rotateLeft() writes into OrbitControls' sphericalDelta.theta.
      // controls.update() (called in the animation loop) reads that delta and
      // applies it to the camera — azimuth changes, polar stays untouched.
      const angle = (dx / canvas.clientHeight) * 2 * Math.PI * this._controls.rotateSpeed;
      this._controls.rotateLeft(angle);
    };

    const onUp = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      isDown = false;
    };

    const onCancel = () => { isDown = false; };

    // capture: true → fires before OrbitControls' bubble-phase listeners
    canvas.addEventListener('pointerdown',   onDown,    { capture: true });
    canvas.addEventListener('pointermove',   onMove,    { capture: true });
    canvas.addEventListener('pointerup',     onUp,      { capture: true });
    canvas.addEventListener('pointercancel', onCancel,  { capture: true });

    this._customOrbitCleanup = () => {
      canvas.removeEventListener('pointerdown',   onDown,    { capture: true });
      canvas.removeEventListener('pointermove',   onMove,    { capture: true });
      canvas.removeEventListener('pointerup',     onUp,      { capture: true });
      canvas.removeEventListener('pointercancel', onCancel,  { capture: true });
    };
  }

  _buildViewCube() {
    const size = 90;
    const cube = document.createElement('div');
    cube.id = 'pcf-view-cube';
    cube.style.cssText = `
        position:absolute;top:12px;right:12px;width:${size}px;height:${size}px;
        perspective:200px;cursor:pointer;user-select:none;z-index:10;
    `;
    const inner = document.createElement('div');
    inner.style.cssText = `
        width:100%;height:100%;position:relative;transform-style:preserve-3d;
        transition:transform 0.05s linear;
    `;
    const half = size / 2;
    // CAESAR coords: X=East(→ThreeZ), Y=North(→ThreeX), Z=Up(→ThreeY)
    // Face label = what you see when camera is on that side looking inward.
    const FACES = [
      { label: 'Plan',    rot: 'rotateX(-90deg)',                        bg: '#2c7c45', cam: [0,  1,  0], up: [ 0, 0, -1] }, // Camera above, looking down  (+ThreeY)
      { label: 'Btm',     rot: 'rotateX(90deg)',                         bg: '#1a4d2b', cam: [0, -1,  0], up: [ 0, 0,  1] }, // Camera below (+ThreeY)
      { label: 'E.Elev',  rot: `translateZ(${half}px)`,                  bg: '#3a6e85', cam: [0,  0,  1], up: [ 0, 1,  0] }, // Camera East (+ThreeZ), looking West
      { label: 'W.Elev',  rot: `rotateY(180deg) translateZ(${half}px)`,  bg: '#3a6e85', cam: [0,  0, -1], up: [ 0, 1,  0] }, // Camera West (-ThreeZ)
      { label: 'N.Elev',  rot: `rotateY(90deg) translateZ(${half}px)`,   bg: '#4a7c95', cam: [1,  0,  0], up: [ 0, 1,  0] }, // Camera North (+ThreeX), looking South
      { label: 'S.Elev',  rot: `rotateY(-90deg) translateZ(${half}px)`,  bg: '#4a7c95', cam: [-1, 0,  0], up: [ 0, 1,  0] }, // Camera South (-ThreeX)
    ];
    for (const f of FACES) {
      const face = document.createElement('div');
      face.textContent = f.label;
      face.style.cssText = `
          position:absolute;width:${size}px;height:${size}px;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;color:#fff;background:${f.bg}cc;
          border:1px solid #ffffff33;box-sizing:border-box;
          transform:${f.rot};backface-visibility:visible;
      `;
      face.addEventListener('click', () => this._snapCamera(f.cam, f.up));
      inner.appendChild(face);
    }
    // 4 corner ISO views
    const cornerPositions = [
      { style: 'top:-8px;right:-8px',    cam: [1, 1, -1],  up: [0, 1, 0] },
      { style: 'top:-8px;left:-8px',     cam: [-1, 1, -1], up: [0, 1, 0] },
      { style: 'bottom:-8px;right:-8px', cam: [1, -1, 1],  up: [0, 1, 0] },
      { style: 'bottom:-8px;left:-8px',  cam: [-1, -1, 1], up: [0, 1, 0] },
    ];
    for (const cp of cornerPositions) {
      const corner = document.createElement('div');
      corner.title = 'ISO view';
      corner.style.cssText = `
          position:absolute;${cp.style};width:16px;height:16px;
          background:#ffffff22;border:1px solid #ffffff55;border-radius:50%;
          cursor:pointer;z-index:12;display:flex;align-items:center;justify-content:center;
          font-size:8px;color:#fff;
      `;
      corner.textContent = '◆';
      corner.addEventListener('click', (e) => { e.stopPropagation(); this._snapCamera(cp.cam, cp.up); });
      cube.appendChild(corner);
    }
    cube.appendChild(inner);
    this._viewCubeInner = inner;
    this._viewCubeEl = cube;
    this._container.appendChild(cube);
  }

  _snapCamera([cx, cy, cz], [ux, uy, uz]) {
    if (!this._controls) return;
    const box = new THREE.Box3();
    if (this._pipeGroup) box.setFromObject(this._pipeGroup);
    const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? 5000 : Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.5;
    this._camera.position.set(
      centre.x + cx * size,
      centre.y + cy * size,
      centre.z + cz * size
    );
    this._camera.up.set(ux, uy, uz);
    this._camera.lookAt(centre);
    this._camera.updateProjectionMatrix();
    this._controls.target.copy(centre);
    this._controls.update();
  }

  _syncViewCube() {
    if (!this._viewCubeInner || !this._camera) return;
    const q = this._camera.quaternion;
    this._viewCubeInner.style.transform =
      `matrix3d(${new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert()).elements.join(',')})`;
  }

  _buildAxisGizmo() {
    const SZ = 120;
    let container = document.getElementById('pcf-axis-gizmo');
    if (container) {
      this._gizmoEl = container;
      const canvas = container.querySelector('canvas');
      if (canvas) this._axisGizmoCtx = canvas.getContext('2d');
      return;
    }
    container = document.createElement('div');
    container.id = 'pcf-axis-gizmo';
    container.style.cssText = `
      position:absolute;bottom:12px;right:12px;width:${SZ}px;height:${SZ}px;
      z-index:10;pointer-events:none;
    `;
    const canvas = document.createElement('canvas');
    canvas.width = SZ; canvas.height = SZ;
    container.appendChild(canvas);
    this._gizmoEl = container;
    this._container.appendChild(container);
    this._axisGizmoCtx = canvas.getContext('2d');
  }

  _syncAxisGizmo() {
    const ctx = this._axisGizmoCtx;
    if (!ctx || !this._camera) return;
    const W = 120, H = 120, cx = W / 2, cy = H / 2, len = 42;

    ctx.clearRect(0, 0, W, H);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,30,0.18)';
    ctx.fill();
    ctx.restore();

    // CAESAR axis labels mapped to Three.js directions:
    //   Three.js +X = CAESAR North (Y)  → green  → label "Y"
    //   Three.js +Y = CAESAR Up    (Z)  → blue   → label "Z"
    //   Three.js +Z = CAESAR East  (X)  → red    → label "X"
    const AXES = [
      { dir: new THREE.Vector3(1, 0, 0),  color: '#33cc33', neg: '#226622', label: 'Y' }, // CAESAR Y (North)
      { dir: new THREE.Vector3(0, 1, 0),  color: '#3388ff', neg: '#224488', label: 'Z' }, // CAESAR Z (Up)
      { dir: new THREE.Vector3(0, 0, 1),  color: '#ff3333', neg: '#882222', label: 'X' }, // CAESAR X (East)
    ];

    // Project all axes and sort back-to-front (draw behind first)
    const projected = AXES.map(({ dir, color, neg, label }) => {
      const proj = dir.clone().applyQuaternion(this._camera.quaternion);
      return { proj, color, neg, label, depth: proj.z };
    });
    projected.sort((a, b) => b.depth - a.depth); // highest z = most behind = draw first

    for (const { proj, color, neg, label } of projected) {
      const isFront = proj.z <= 0;  // z<=0 in camera space = pointing toward viewer
      const alpha = isFront ? 1.0 : 0.32;
      const lineW = isFront ? 3 : 1.5;
      const tipR  = isFront ? 5 : 3;

      const ex = cx + proj.x * len;
      const ey = cy - proj.y * len;
      const axColor = isFront ? color : neg;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Shaft
      ctx.strokeStyle = axColor;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      if (isFront) {
        // Arrow head (filled triangle)
        const ang = Math.atan2(ey - cy, ex - cx);
        const aLen = 10, aWid = 0.45;
        ctx.fillStyle = axColor;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - aLen * Math.cos(ang - aWid), ey - aLen * Math.sin(ang - aWid));
        ctx.lineTo(ex - aLen * Math.cos(ang + aWid), ey - aLen * Math.sin(ang + aWid));
        ctx.closePath();
        ctx.fill();
      } else {
        // Dot at tip for behind axes
        ctx.fillStyle = axColor;
        ctx.beginPath();
        ctx.arc(ex, ey, tipR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label with contrasting halo
      const lx = ex + (proj.x >  0.1 ?  8 : proj.x < -0.1 ? -16 : -5);
      const ly = ey + (proj.y < -0.1 ?  14 : proj.y >  0.1 ?  -6 :  5);
      ctx.font = isFront ? 'bold 13px sans-serif' : '11px sans-serif';

      // Halo for readability on white background
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(label, lx, ly);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = axColor;
      ctx.fillText(label, lx, ly);

      ctx.restore();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#cccccc';
    ctx.fill();
  }

  _animate() {
    this._animId = requestAnimationFrame(() => this._animate());
    this._controls.update();
    this._renderer.render(this._scene, this._camera);
    this._css2d.render(this._scene, this._camera);
    this._syncViewCube();
    this._syncAxisGizmo();
  }

  _onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;

    if (this._isOrtho) {
        let frustum = 5000;
        if (this._pipeGroup) {
          const box = new THREE.Box3().setFromObject(this._pipeGroup);
          if (!box.isEmpty()) {
             const size = box.getSize(new THREE.Vector3());
             frustum = Math.max(size.x, size.y, size.z) * 0.8;
          }
        }
        this._orthoCamera.left   = -frustum * aspect;
        this._orthoCamera.right  =  frustum * aspect;
        this._orthoCamera.top    =  frustum;
        this._orthoCamera.bottom = -frustum;
        this._orthoCamera.updateProjectionMatrix();
    } else {
        this._perspCamera.aspect = aspect;
        this._perspCamera.updateProjectionMatrix();
    }

    this._renderer.setSize(w, h);
    this._css2d.setSize(w, h);
  }

  toggleProjection() {
      const w = this._container.clientWidth;
      const h = this._container.clientHeight;
      const aspect = w / h;

      if (this._isOrtho) {
          this._perspCamera.position.copy(this._orthoCamera.position);
          this._perspCamera.quaternion.copy(this._orthoCamera.quaternion);
          this._perspCamera.up.set(0, 1, 0);
          this._perspCamera.aspect = aspect;
          this._perspCamera.updateProjectionMatrix();
          this._camera = this._perspCamera;
          this._isOrtho = false;
      } else {
          this._orthoCamera.position.copy(this._perspCamera.position);
          this._orthoCamera.quaternion.copy(this._perspCamera.quaternion);
          this._orthoCamera.up.set(0, 1, 0);
          this._orthoCamera.updateProjectionMatrix();
          this._camera = this._orthoCamera;
          this._isOrtho = true;
      }
      this._controls.object = this._camera;
      this._controls.update();
  }

  _computeRange(elements, field) {
    const vals = elements.map(e => e[field] ?? 0).filter(v => v !== 0);
    if (!vals.length) return { min: 0, max: 100 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }

  rebuild() {
    this._clearGroup(this._pipeGroup);
    this._clearGroup(this._symbolGroup);
    this._clearGroup(this._labelGroup);

    const data = state.parsed;
    if (!data?.elements?.length) return;

    const elements = this._getPcfElements();
    const { nodes, restraints = [], forces = [] } = data;

    for (const el of elements) {
        if (!el.fromPos && el.from !== undefined) {
           el.fromPos = nodes[el.from];
        }
        if (!el.toPos && el.to !== undefined) {
           el.toPos = nodes[el.to];
        }
    }

    const legendField = state.legendField;
    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;
    const range = heatField ? this._computeRange(elements, heatField) : { min: 0, max: 100 };

    for (const el of elements) {
      if (!el.fromPos || !el.toPos) continue;

      const a = toThree(el.fromPos);
      const b = toThree(el.toPos);
      const col = colorForMode(el, legendField, range);

      if (el.isBend || el.bend) {
        const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
        const arc = createBendArc(a, mid, b, col, 3, this._renderer);
        this._pipeGroup.add(arc);
      } else {
        const seg = createPipeLine(a, b, col, 3, this._renderer);
        this._pipeGroup.add(seg);
      }
    }

    for (const r of restraints) {
      const pos = nodes[r.node];
      if (!pos) continue;
      const sym = r.isAnchor ? createAnchorSymbol(pos) : createGuideSymbol(pos);
      this._symbolGroup.add(sym);
    }

    const forceByNode = new Map(forces.map(f => [f.node, f]));
    for (const [nodeId, pos] of Object.entries(nodes)) {
      const f = forceByNode.get(Number(nodeId));
      if (f) {
        const arrow = createForceArrow(pos, f);
        if (arrow) this._symbolGroup.add(arrow);
      }
    }

    this._rebuildLabels();
    this._updateLegendPanel(elements, legendField, range);
    this._fitToScene();
  }

  _getPcfElements() {
    const data = state.parsed;
    if (!data?.elements?.length) return [];
    try {
      const csvRows = buildUniversalCSV(data);
      const pcfSegments = normalizeToPCF(csvRows, { method: 'ContEngineMethod' });
      const adapted = adaptForRenderer(pcfSegments, data);
      return adapted.elements;
    } catch (err) {
      console.warn('PCF pipeline failed, falling back to raw elements:', err);
      return data.elements;
    }
  }

  _rebuildAll() {
    const data = state.parsed;
    if (!data?.elements?.length) return;
    const elements = this._getPcfElements();
    const legendField = state.legendField;
    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;
    const range = heatField ? this._computeRange(elements, heatField) : { min: 0, max: 100 };

    let idx = 0;
    for (const child of this._pipeGroup.children) {
      const el = elements[idx++];
      if (el && child.material) {
        child.material.color.setHex(colorForMode(el, legendField, range));
      }
    }

    this._rebuildLabels();
    this._updateLegendPanel(elements, legendField, range);
  }

  _rebuildLabels() {
    this._clearGroup(this._labelGroup);
    const data = state.parsed;
    if (!data?.elements?.length) return;

    const elements = this._getPcfElements();
    const { nodes } = data;
    const showLabels = state.geoToggles.nodeLabels;

    if (showLabels) {
      for (const [nodeId, pos] of Object.entries(nodes)) {
        const lbl = createNodeLabel(Number(nodeId), pos);
        this._labelGroup.add(lbl);
      }
    }

    let stretches = computeStretches(elements, state.legendField, materialFromDensity);
    const maxLabels = state.geoToggles.maxLegendLabels ?? 3;
    const stretchesByText = {};
    for (const s of stretches) {
        if (!s.text) continue;
        if (!stretchesByText[s.text]) stretchesByText[s.text] = [];
        stretchesByText[s.text].push(s);
    }

    for (const text in stretchesByText) {
        let group = stretchesByText[text];
        if (group.length > maxLabels) {
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            group = group.slice(0, maxLabels);
        }

        for (const stretch of group) {
            const lbl = createSegmentLabel(stretch.text, stretch.midPos);
            this._labelGroup.add(lbl);
        }
    }
  }

  _updateLegendPanel(elements, legendField, range) {
    const panel = document.getElementById('legend-panel');
    if (!panel) return;

    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;

    if (isHeatMap) {
      const unit = heatField === 'P1' ? ' bar' : '°C';
      const uniqueValues = [...new Set(elements.map(e => e[heatField]).filter(v => v !== undefined && v !== null))].sort((a,b)=>b-a);
      const swatches = uniqueValues.map(v => {
          const col = generateDiscreteColor(v);
          const fv = Number(v).toFixed(heatField === 'P1' ? 2 : 0);
          return `<div class="legend-row"><span class="legend-swatch" style="background:#${col.toString(16).padStart(6,'0')}"></span><span>${fv}${unit}</span></div>`;
      }).join('');

      panel.innerHTML = `
        <div class="legend-title">${heatField} Heat Map</div>
        ${swatches}
        <div class="legend-row"><span class="legend-swatch swatch-anchor"></span><span>Anchor ■</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-guide"></span><span>Guide ○</span></div>
      `;
    } else {
      let swatches = '';
      if (legendField === 'material') {
        const MCOLORS = { CS:'#3a7bd5', SS:'#27ae60', AS:'#e67e22', CU:'#8e44ad', AL:'#16a085' };
        const mats = [...new Set(elements.map(e => e.material || 'CS'))];
        swatches = mats.map(m => {
          const col = MCOLORS[m.toUpperCase().slice(0, 2)] || '#888';
          return `<div class="legend-row"><span class="legend-swatch" style="background:${col}"></span><span>${m}</span></div>`;
        }).join('');
      } else {
        const uniqueValues = [...new Set(elements.map(e => e.od))].filter(v => v > 0);
        swatches = OD_COLORS
          .filter(c => uniqueValues.some(od => Math.abs(od - c.od) < 1))
          .map(c => `<div class="legend-row"><span class="legend-swatch" style="background:#${c.color.toString(16).padStart(6,'0')}"></span><span>${c.label}</span></div>`)
          .join('');
        if (!swatches) {
          swatches = `<div class="legend-row"><span class="legend-swatch" style="background:#555"></span><span>Pipe</span></div>`;
        }
      }

      const titles = { pipelineRef:'OD LEGEND', material:'MATERIAL LEGEND', T1:'T1 (°C)', T2:'T2 (°C)', P1:'P1 (bar)' };
      panel.innerHTML = `
        <div class="legend-title">${titles[legendField] || 'Legend'}</div>
        ${swatches}
        <div class="legend-row"><span class="legend-swatch swatch-anchor"></span><span>Anchor ■</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-guide"></span><span>Guide ○</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-load"></span><span>Applied Load ↓</span></div>
      `;
    }
  }

  _applyToggles() {
    this._symbolGroup.visible = state.geoToggles.supports;
    this._rebuildLabels();
  }

  _fitToScene() {
    const box = new THREE.Box3().setFromObject(this._pipeGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const frustum = maxDim * 0.65;
    const aspect  = this._container.clientWidth / this._container.clientHeight;

    this._camera.left   = -frustum * aspect;
    this._camera.right  =  frustum * aspect;
    this._camera.top    =  frustum;
    this._camera.bottom = -frustum;
    this._camera.updateProjectionMatrix();

    this._controls.target.copy(center);
    const D = maxDim * 1.5;
    this._camera.position.copy(center).add(new THREE.Vector3(D, D, D).normalize().multiplyScalar(D));
    this._controls.update();
  }

  resetView() { this._fitToScene(); }

  toDataURL() {
    this._renderer.render(this._scene, this._camera);
    return this._renderer.domElement.toDataURL('image/png');
  }

  _clearGroup(group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  destroy() {
    cancelAnimationFrame(this._animId);
    this._renderer.dispose();
  }
}
