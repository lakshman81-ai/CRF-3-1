# Work Instruction — Professional 3D Viewer: Camera Controls, Navigation & Section Tools

> **Target quality:** Navisworks / Revit / AutoCAD-grade interaction
> **Framework:** Three.js r160+ / WebGL 2.0
> **Default coordinate convention:** Z-up (CAESAR / AutoCAD) with run-time toggle to Y-up

---

## 0 · Scope & Objectives

Implement every interactive camera, navigation, selection and section control listed below. Every setting must be exposed in a persistent **Settings Panel** and (where applicable) a **toolbar button**. Settings are saved to `localStorage` under key `viewer3d_settings`.

- Input: mouse + keyboard (primary), touchscreen + trackpad (secondary)
- Performance target: ≥ 60 fps on models up to 500 000 geometry nodes
- All constrained rotation modes **must use direct vector math** — do NOT rely on OrbitControls `minPolarAngle = maxPolarAngle` clamping (it freezes all rotation)

---

## 1 · Camera System

### 1.1 Projection Modes

Two modes, switchable at any time without resetting the view target.

| Mode | Description |
|---|---|
| **Perspective** | Depth foreshortening, natural construction view |
| **Orthographic** | Parallel projection, accurate dimensioning |

> When switching, match the ortho frustum height to the perspective view's visible height at the target distance so the scene doesn't appear to jump.

---

### 1.2 Perspective Camera Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `fov` | Number | `60` | Vertical field of view in degrees (range 10–170) |
| `near` | Number | `0.1` | Near clipping plane — **never 0** |
| `far` | Number | `1 000 000` | Far clipping plane |
| `aspect` | Number | auto | Width ÷ height — update on every resize |
| `zoom` | Number | `1.0` | Camera zoom multiplier |
| `focalLength` | Number | — | Optional 35 mm equivalent focal length |

---

### 1.3 Orthographic Camera Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `left / right` | Number | ± span/2 | Horizontal frustum bounds |
| `top / bottom` | Number | ± span/2 | Vertical frustum bounds |
| `near` | Number | `-100 000` | Set negative so geometry behind camera is visible |
| `far` | Number | `1 000 000` | Far clipping plane |
| `zoom` | Number | `1.0` | Scale multiplier |

> **Validation rule:** `near < far` at all times. Enforce min near = `1e-4` (perspective) and `near = −far` (ortho) to prevent z-fighting.

---

### 1.4 Near / Far Clipping UI Controls

Expose in **Settings → Camera → Clipping:**

| Control | Description |
|---|---|
| Near Plane slider | Logarithmic scale, range `0.001 → far−1` |
| Far Plane slider | Logarithmic scale, range `near+1 → 10 000 000` |
| Auto-fit button | `near = max(0.01, bbox_min_depth × 0.5)` · `far = bbox_max_depth × 2.0` |
| Reset button | Restores defaults above |

---

### 1.5 Standard Orthographic View Presets

Snap camera to canonical positions; preserve orbit target, update only position and up-vector.

| View | Camera Direction (Z-up) | Up Vector | Shortcut |
|---|---|---|---|
| Top (Plan) | +Z looking down | +Y | `Numpad 7` |
| Bottom | −Z looking up | +Y | `Ctrl+Numpad 7` |
| Front (N.Elev) | +Y looking south | +Z | `Numpad 1` |
| Back (S.Elev) | −Y looking north | +Z | `Ctrl+Numpad 1` |
| Right (E.Elev) | +X looking west | +Z | `Numpad 3` |
| Left (W.Elev) | −X looking east | +Z | `Ctrl+Numpad 3` |
| ISO NW | `(−1,+1,+1)` normalised | +Z | `Numpad 0` |
| ISO NE | `(+1,+1,+1)` normalised | +Z | `Ctrl+Numpad 0` |
| Home | Fit all visible objects | +Z | `H` |

---

## 2 · Navigation Modes

Navigation modes are **mutually exclusive**. Active mode = highlighted toolbar button. All modes support pinch-to-zoom and two-finger pan on touch devices.

---

### 2.1 3D Free Orbit (Default)

Unconstrained spherical orbit around the current target point.

| Input | Action |
|---|---|
| Left drag | Rotate azimuth (H) + elevation (V) simultaneously |
| Right drag | Pan — translate target and camera in the view plane |
| Scroll wheel | Dolly in/out (perspective) or scale frustum (ortho) |
| Middle drag | Pan (same as right drag) |
| Double-click L | Set new orbit target at hit point |
| `F` | Frame / fit selected objects |
| `Shift + scroll` | Roll camera ±5° per notch |

**Settings:**

| Setting | Type | Default | Description |
|---|---|---|---|
| `rotateSpeed` | Number | `1.0` | Orbit rotation sensitivity multiplier |
| `panSpeed` | Number | `1.0` | Pan translation sensitivity multiplier |
| `zoomSpeed` | Number | `1.0` | Dolly / zoom speed multiplier |
| `dampingFactor` | Number | `0.08` | Inertia smoothing (0 = instant, 1 = no movement) |
| `enableDamping` | Bool | `true` | Toggle inertia smoothing |
| `minDistance` | Number | `0.01` | Minimum dolly distance from target |
| `maxDistance` | Number | `∞` | Maximum dolly distance from target |
| `invertX` | Bool | `false` | Invert left/right orbit direction |
| `invertY` | Bool | `false` | Invert up/down orbit direction |
| `zoomToCursor` | Bool | `true` | Zoom towards mouse cursor, not orbit target |

---

### 2.2 Planar Rotation — About Vertical Axis (2D Orbit)

Locks elevation; only azimuth changes. Camera stays at the same height — like spinning a globe.

- Left drag L/R → azimuth changes; elevation is frozen at the angle when mode was activated
- Vertical drag is ignored
- Right drag + scroll behave identically to 3D Orbit

> ⚠️ **Implementation:** Set `controls.enableRotate = false`. Add `pointerdown / pointermove / pointerup` listeners on the canvas. On move: `offset.applyAxisAngle(VERTICAL_AXIS, angle)` then `camera.position = controls.target + offset; camera.lookAt(controls.target)`. Remove listeners on mode exit and restore `enableRotate = true`. **Do NOT use `minPolarAngle = maxPolarAngle`** — it freezes all OrbitControls rotation.

Two sub-variants:

| Variant | Behaviour |
|---|---|
| **Rotate about X axis** (plan) | First snaps camera to top-down view at 18° elevation, then activates planar rotation |
| **Rotate about Y axis** | Activates planar rotation from the current view — no snap |

---

### 2.3 Axis-Constrained Rotation

Three dedicated modes locking rotation to exactly one world axis.

| Mode | Locked Axis | Free Movement | Gizmo Highlight |
|---|---|---|---|
| Rotate about X | X (East) | Pitch around East axis | Red X |
| Rotate about Y | Y (North) | Yaw around North axis | Green Y |
| Rotate about Z | Z (Up) | Roll around vertical axis | Blue Z |
| Planar (free azimuth) | Z (vertical) | Azimuth only — elevation frozen | Compass ring |

> Same implementation rule as §2.2 — use `applyAxisAngle` with the chosen world axis. Never use OrbitControls polar/azimuth clamp for constrained modes.

---

### 2.4 Pan

Translates camera and orbit target together in the view plane. Available as a dedicated mode or via right-drag in any orbit mode.

| Setting | Type | Default | Description |
|---|---|---|---|
| `panSpeed` | Number | `1.0` | Pan sensitivity (scales with target distance) |
| `screenSpacePanning` | Bool | `true` | `true` = pan in screen plane; `false` = pan in XZ world plane |
| `panBounds` | AABB | none | Optional: constrain pan to keep target inside a world bbox |

---

### 2.5 Zoom / Dolly

| Projection | Strategy |
|---|---|
| Perspective | Move camera along view axis (dolly); auto-adjust near/far |
| Orthographic | Scale `left/right/top/bottom` symmetrically about cursor point |

| Setting | Type | Default | Description |
|---|---|---|---|
| `zoomSpeed` | Number | `1.0` | Scroll wheel zoom multiplier |
| `minZoom` | Number | `1e-4` | Minimum ortho zoom (prevents collapse) |
| `maxZoom` | Number | `∞` | Maximum ortho zoom |
| `zoomToCursor` | Bool | `true` | Recompute orbit target at cursor hit point on zoom |
| `autoNearFar` | Bool | `true` | Auto-adjust near/far during dolly |

---

### 2.6 Fly / Walk Mode

First-person free-fly for large models. Toggle: `F9` or toolbar button.

| Input | Action |
|---|---|
| `W / A / S / D` | Forward / strafe left / back / strafe right |
| `E / Q` | Move up / move down |
| Left drag | Look direction |
| Scroll | Change movement speed |
| `Shift` | Sprint (5× speed) |

| Setting | Type | Default |
|---|---|---|
| `flySpeed` | Number | `100` (world units/s) |
| `lookSensitivity` | Number | `0.15` (°/pixel) |
| `enableCollision` | Bool | `false` |

---

## 3 · Selection System

### 3.1 Click-to-Select

Left-click in Select mode → raycasting picks object.

- Highlight: emissive colour overlay (default `#FFA500`, 50% opacity)
- Side panel shows: name, type, tag, bounding box dimensions
- Click empty space → deselect all
- `Ctrl + click` → add/remove from multi-selection
- `Shift + click` → range select

| Setting | Type | Default | Description |
|---|---|---|---|
| `highlightColor` | HEX | `#FFA500` | Selected object emissive colour |
| `hoverColor` | HEX | `#88CCFF` | Hover highlight colour |
| `selectionOpacity` | Number | `0.5` | Overlay blend opacity |
| `enableHover` | Bool | `true` | Show hover highlight on mouse move |
| `selectThruTransparent` | Bool | `false` | Raycast through transparent surfaces |

---

### 3.2 Box Select

`Alt + left-drag` → screen-space rectangle. All objects whose projected bbox intersects the rect are selected. Rectangle drawn as a 2 px dashed blue overlay. `Alt + Ctrl` → add to existing selection.

---

### 3.3 Rotate About Selection (Shortcut: `3`)

Sets orbit pivot to the **centroid of the selection's bounding box**.

- Visual indicator: small 3-axis cross-hair gizmo at pivot point
- All navigation modes (orbit, planar, constrained) use this pivot
- Reset pivot: `R` or toolbar button → returns to model bounding-box centre
- Double-click on any surface → sets pivot to surface hit point

> Store pivot in `controls.target`. All navigation modes must read this value.

---

### 3.4 Isolate Selection

- `I` → hide all non-selected objects; fit camera to selection
- `Esc` → restore all hidden objects

---

## 4 · World Axis & Coordinate System

### 4.1 Vertical Axis Toggle

Stored in `localStorage`; applied on startup.

| Convention | Vertical Axis | Typical Use | `camera.up` |
|---|---|---|---|
| **Z-up** (default) | Z (blue) | CAESAR, AutoCAD, Civil3D, Revit | `(0, 0, 1)` + scene root rotation |
| **Y-up** | Y (green) | Three.js native, glTF, Maya | `(0, 1, 0)` |

When switching:

1. Rotate scene root `Group` by ±90° about world X (do not modify per-mesh transforms)
2. Update `camera.up`
3. Update OrbitControls orbit axis
4. Update axis gizmo colours and labels
5. Recompute all standard view presets

---

### 4.2 Axis Gizmo (World Indicator)

Fixed-size, non-interactive 3-axis widget; rotates synchronously with camera.

| Setting | Type | Default | Description |
|---|---|---|---|
| `showAxisGizmo` | Bool | `true` | Show / hide |
| `gizmoSize` | Number | `80 px` | Pixel size |
| `gizmoPosition` | Enum | `bottom-left` | `top-left \| top-right \| bottom-left \| bottom-right` |
| `labelAxes` | Bool | `true` | Show X/Y/Z labels |
| `xColor` | HEX | `#E74C3C` | X axis colour |
| `yColor` | HEX | `#2ECC71` | Y axis colour |
| `zColor` | HEX | `#3498DB` | Z axis colour |
| `gizmoClickable` | Bool | `true` | Click axis → snap to that standard view |

---

### 4.3 Ground Grid

| Setting | Type | Default | Description |
|---|---|---|---|
| `showGrid` | Bool | `true` | Toggle visibility |
| `gridSize` | Number | `10 000` | Total extent in world units |
| `gridDivisions` | Number | `100` | Grid cells per axis |
| `gridColor` | HEX | `#888888` | Grid line colour |
| `gridCenterColor` | HEX | `#444444` | Centre cross-hair colour |
| `gridFade` | Bool | `true` | Alpha fall-off at distance |
| `gridPlane` | Enum | `XY (Z-up)` | World plane the grid lies on |

---

## 5 · ViewCube

Interactive 3D cube widget (top-right corner by default) showing current camera orientation. Click to snap to any standard view.

### 5.1 Interaction Model

| Click Target | Action |
|---|---|
| Face (e.g. FRONT) | Snap to orthographic view looking at that face (animated transition) |
| Edge (12 total) | Snap to 45° isometric view along that edge |
| Corner (8 total) | Snap to trimetric view along that corner diagonal |
| Home icon | Fit-all: frame entire model |
| Compass ring | Drag → rotate about vertical axis only (planar rotation) |
| Compass N/S/E/W label | Snap to that elevation view |
| Cube body drag | Free orbit (same as 3D Orbit mode) |

### 5.2 ViewCube Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `showViewCube` | Bool | `true` | Show / hide |
| `viewCubeSize` | Number | `120 px` | Widget pixel size |
| `viewCubePosition` | Enum | `top-right` | Corner position |
| `viewCubeOpacity` | Number | `0.85` | Default opacity (1.0 on hover) |
| `viewCubeAnimDuration` | Number | `400 ms` | Snap animation duration |
| `viewCubeAnimEasing` | Enum | `ease-in-out` | Easing function |
| `showCompass` | Bool | `true` | Show compass rose below cube |
| `northAngle` | Number | `0°` | North label offset from model X+ axis |
| `viewCubeFaceLabels` | String | `TOP,BOTTOM,…` | Localisation-ready face labels |
| `highlightOnHover` | Bool | `true` | Highlight face/edge/corner under cursor |

---

## 6 · Navigation Toolbar

Vertical (or horizontal) floating toolbar. Active mode = highlighted button. SVG icons for crisp HiDPI rendering. Tooltip on hover.

### 6.1 Required Buttons

| Button | Mode / Action | Shortcut | Icon |
|---|---|---|---|
| Select | Select mode | `S` | Arrow cursor |
| 3D Orbit | Free 3D orbit | `O` | Sphere with orbit arc |
| Rotate about X | Planar rot. + snap Top | `X` | Plan arc / flat circle |
| Rotate about Y | Planar rot. current view | `Y` | Vertical orbit arc |
| Rotate about Z | Roll about vertical axis | `Z` | Z-axis spin arc |
| Pan | Pan mode | `P` | Four-way arrow |
| Zoom Window | Drag zoom rectangle | — | Magnifier + rectangle |
| Fit All | Frame entire model | `H` | Fit-to-screen brackets |
| Fit Selection | Frame selected objects | `F` | Target + selection box |
| Top View | Snap top ortho | `Numpad 7` | Down arrow |
| Front View | Snap front elevation | `Numpad 1` | Front arrow |
| Right View | Snap right elevation | `Numpad 3` | Right arrow |
| ISO View | Snap isometric NW | `Numpad 0` | Cube corner |
| Perspective/Ortho | Toggle projection | `V` | Perspective vs parallel lines |
| Section Box | Toggle section box | `B` | Box with dashed cut |
| Fly Mode | Toggle fly/walk | `F9` | Person with arrow |
| Settings | Open settings panel | `,` | Gear icon |

### 6.2 Toolbar Settings

| Setting | Type | Default |
|---|---|---|
| `toolbarPosition` | Enum | `left` |
| `toolbarIconSize` | Number | `32 px` |
| `toolbarOpacity` | Number | `0.88` |
| `showTooltips` | Bool | `true` |
| `tooltipDelay` | Number | `500 ms` |

---

## 7 · Section & Clipping Planes

### 7.1 Six-Plane Section Box

A box-shaped clipping region (±X, ±Y, ±Z). Geometry outside the box is clipped using `renderer.clippingPlanes`.

- Toggle on/off: toolbar button `B` or shortcut
- Each face has an independently draggable 3D handle
- Visual: translucent box outline + coloured handles
- Double-click a face handle → flip clip direction
- Section cap: fills the cut cross-section with a solid colour (stencil buffer technique — see §10)

| Setting | Type | Default | Description |
|---|---|---|---|
| `enableSectionBox` | Bool | `false` | Global toggle |
| `sectionBoxPadding` | Number | `5% of bbox` | Initial padding when first enabled |
| `clipX_min` | Number | `−∞` | Left clip plane (world X) |
| `clipX_max` | Number | `+∞` | Right clip plane (world X) |
| `clipY_min` | Number | `−∞` | Front clip plane (world Y) |
| `clipY_max` | Number | `+∞` | Back clip plane (world Y) |
| `clipZ_min` | Number | `−∞` | Bottom clip plane (world Z) |
| `clipZ_max` | Number | `+∞` | Top clip plane (world Z) |
| `showSectionCap` | Bool | `true` | Fill cut cross-section |
| `sectionCapColor` | HEX | `#E0E0E0` | Cap fill colour |
| `sectionCapOpacity` | Number | `0.7` | Cap opacity |
| `sectionBoxColor` | HEX | `#2E75B6` | Box outline colour |
| `sectionBoxOpacity` | Number | `0.15` | Box face transparency |
| `sectionHandleSize` | Number | `12 px` | Pixel size of drag handles |

---

### 7.2 Arbitrary Clipping Planes (up to 6)

Individual planes at any orientation, in addition to the section box.

| Setting | Type | Default | Description |
|---|---|---|---|
| `plane_N_normal` | Vector3 | varies | Unit normal `(a, b, c)` |
| `plane_N_constant` | Number | `0` | Constant `d` in `ax+by+cz+d=0` |
| `plane_N_enabled` | Bool | `false` | Enable/disable this plane |
| `plane_N_flip` | Bool | `false` | Invert clipping direction |
| `clipIntersection` | Bool | `false` | `false` = union; `true` = intersection of all planes |

---

### 7.3 Near / Far Plane UI

See §1.4. Summary: logarithmic sliders in Settings + Auto-fit button.

---

## 8 · Settings Panel

Collapsible side panel (or modal). Auto-saved to `localStorage`. Includes **Reset All** and **Export / Import JSON** buttons.

### 8.1 Panel Sections

| Section | Contents |
|---|---|
| **Camera** | Near, far, FOV, projection, zoom-to-cursor, auto near/far |
| **Navigation** | Rotate/pan/zoom speed, damping, invert axes, min/max distance |
| **Appearance** | Background colour, grid, axis gizmo, ViewCube, shadows, theme |
| **Selection** | Highlight colour, hover colour, opacity |
| **Section** | Section box planes, cap colour, arbitrary clipping planes |
| **Performance** | LOD threshold, shadow resolution, antialias, pixel ratio |
| **Coordinate System** | Vertical axis (Y/Z), north angle, coordinate labels |
| **Keyboard Shortcuts** | Read-only reference table |

### 8.2 Global Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `theme` | Enum | `dark` | `dark \| light \| system` |
| `backgroundColor` | HEX | `#1A1A2E` | Viewport background |
| `antialias` | Bool | `true` | MSAA antialiasing |
| `shadowsEnabled` | Bool | `false` | Real-time shadows |
| `pixelRatio` | Number | `window.devicePixelRatio` | Renderer pixel ratio |
| `verticalAxis` | Enum | `Z` | World vertical axis: `Y` or `Z` |
| `coordinateLabels` | Bool | `true` | Show X/Y/Z or E/N/Up on gizmo |
| `persistentSettings` | Bool | `true` | Auto-save to localStorage |

---

## 9 · Keyboard Shortcuts (All Re-bindable)

| Shortcut | Action |
|---|---|
| `O` | 3D Orbit mode |
| `S` | Select mode |
| `X` | Rotate about X axis (plan snap) |
| `Y` | Rotate about Y axis (current view) |
| `Z` | Rotate about Z axis |
| `P` | Pan mode |
| `H` | Fit all (home) |
| `F` | Fit selected |
| `V` | Toggle Perspective / Orthographic |
| `B` | Toggle Section Box |
| `I` | Isolate selected |
| `Esc` | Deselect all / exit isolate / cancel |
| `3` | Set orbit pivot to selection centroid |
| `R` | Reset orbit pivot to model centre |
| `G` | Toggle ground grid |
| `A` | Toggle axis gizmo |
| `Numpad 7` | Top view |
| `Numpad 1` | Front view |
| `Numpad 3` | Right view |
| `Numpad 0` | ISO view |
| `Ctrl + Numpad 7` | Bottom view |
| `Ctrl + Numpad 1` | Back view |
| `Ctrl + Numpad 3` | Left view |
| `Ctrl + Z` | Undo last view change |
| `Ctrl + Y` | Redo view change |
| `F9` | Toggle Fly / Walk mode |
| `,` | Open / close Settings panel |

---

## 10 · Implementation Notes (Three.js)

### 10.1 Constrained Rotation — NEVER Use OrbitControls Clamping

```js
// ❌ WRONG — freezes all rotation when min === max
controls.minPolarAngle = polar;
controls.maxPolarAngle = polar;

// ✅ CORRECT — direct vector math
controls.enableRotate = false;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  isDown = true; prevX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!isDown) return;
  const angle = -(e.clientX - prevX) / canvas.clientWidth * Math.PI * 2.5;
  prevX = e.clientX;
  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(VERTICAL_AXIS, angle);       // Y-axis example
  camera.position.copy(controls.target).add(offset);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
});
// On mode exit: remove listeners; controls.enableRotate = true
```

Pan (right-drag) and zoom (scroll) remain handled by OrbitControls unmodified — keep `controls.enabled = true`.

---

### 10.2 Z-up Coordinate System

```js
// Scene root approach — never modify per-mesh transforms
const sceneRoot = new THREE.Group();
sceneRoot.rotation.x = -Math.PI / 2;  // rotate world so Z becomes up
scene.add(sceneRoot);

camera.up.set(0, 0, 1);
// Override OrbitControls orbit axis from Y to Z (subclass or monkey-patch `update`)
```

---

### 10.3 Near / Far Auto-Fit Algorithm

Call after every load, section change, or major camera move:

```js
function autoFitNearFar(camera, visibleMeshes) {
  const sphere = new THREE.Sphere();
  const box = new THREE.Box3();
  visibleMeshes.forEach(m => box.expandByObject(m));
  box.getBoundingSphere(sphere);

  const dist = camera.position.distanceTo(sphere.center);
  camera.near = Math.max(1e-4, (dist - sphere.radius) * 0.1);
  camera.far  = (dist + sphere.radius) * 10;
  camera.updateProjectionMatrix();
}
```

---

### 10.4 Section Cap Rendering (Stencil Buffer)

Three.js does not render section caps natively. Use the stencil buffer technique:

1. Render scene with clipping planes — stencil bit set where geometry was clipped
2. Render a full-screen quad masked by stencil → fill with cap material
3. Simple alternative: render a slightly-scaled `BackSide` mesh as approximation

---

### 10.5 ViewCube Implementation Options

| Option | Complexity | Quality |
|---|---|---|
| CSS3D overlay with 3D transform | Low | Good |
| Separate small WebGL renderer (inset) | Medium | Excellent |
| `three-mesh-ui` or custom mesh | High | Excellent |

Recommended: separate inset renderer sharing the same `THREE.WebGLRenderer` with a second render pass in a small viewport rectangle (bottom-right).

---

### 10.6 Performance Checklist

- Merge static geometry: `BufferGeometryUtils.mergeGeometries()`
- Use `THREE.LOD` objects for distant elements
- Throttle hover raycasting to every other frame
- GPU color-picking (`WebGLRenderTarget`) when object count > 10 000
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- Disable shadows by default — offer as opt-in

---

## 11 · Acceptance Criteria

All of the following must pass before implementation is considered complete:

| # | Test | Pass Condition |
|---|---|---|
| 1 | 3D Orbit from any view | Smooth rotation in all directions with damping |
| 2 | Planar rotation from N.Elev | Azimuth changes; elevation constant ±0.5° |
| 3 | Rotate-about-Y from iso view | Same as #2; no snap to top view |
| 4 | Click to select | Object highlighted; info panel populated |
| 5 | Rotate about selection (`3`) | Orbit pivots at selection centroid |
| 6 | ViewCube face click | Camera animates to correct view in ≤ 500 ms |
| 7 | Near/far auto-fit | No z-fighting or near-clipping on any standard view |
| 8 | Section box drag | Geometry clips in real time at 60 fps |
| 9 | Section cap | Cut cross-section filled with cap colour |
| 10 | Z-up / Y-up toggle | All geometry, gizmo, ViewCube and grid update without reload |
| 11 | Settings persist | Reload page — all settings restored from `localStorage` |
| 12 | Touch orbit | Single finger = orbit; two-finger pinch = zoom |
| 13 | Keyboard shortcuts | All shortcuts in §9 produce correct actions |
| 14 | 60 fps performance | 200 k mesh model maintains ≥ 60 fps on orbit |

---

*Living document — update version date when any section changes.*
