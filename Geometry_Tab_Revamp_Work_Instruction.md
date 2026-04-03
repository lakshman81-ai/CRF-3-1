# Work Instruction: Geometry Tab Complete Revamp

## Purpose

Revamp the Geometry tab into a professional-grade 3D model viewer for piping data.
The goal is not a small polish pass. The goal is a complete rebuild of the geometry
experience so it feels like a serious engineering viewer, not a demo.

The updated tab must provide:

- professional navigation
- predictable camera behavior
- clear axis handling and axis settings
- a strong View Cube experience
- cutting plane / section tools
- improved label rendering and label filtering
- first-class properties and support / restraint display
- a detailed settings drawer for all view options
- cleaner UI organization
- better defaults for inspection and presentation

The implementation must preserve existing data loading and rendering logic while
modernizing the interaction layer and presentation layer.

---

## Brainstorming

Before implementation, evaluate the tab as if it were being redesigned from scratch.
Use the following directions as the design space.

### Option A: Minimal Improvement

Keep the current layout and only improve a few controls.

Pros:

- low risk
- fast to ship

Cons:

- does not solve the core usability problems
- still feels improvised
- label clutter and camera confusion remain

### Option B: Structured Engineering Viewer

Keep the same renderer core, but rebuild the tab shell, controls, camera behavior,
and label pipeline.

Pros:

- good balance of scope and value
- preserves existing model data path
- allows professional-grade navigation and display tools

Cons:

- requires coordinated changes across renderer, UI, state, and CSS

### Option C: Full Viewer Revamp

Treat the geometry tab as a complete viewer product and redesign the whole
interaction model, including controls, camera, labels, sectioning, and axis settings.

Pros:

- best final quality
- highest usability
- scalable for future engineering tools

Cons:

- more implementation work
- requires careful regression control

### Recommended Direction

Choose Option C in architecture, but implement it incrementally using the existing
renderer and data pipeline. The tab should feel like a full viewer revamp while
remaining compatible with current parsed model data.

---

## Primary Objectives

1. Make navigation intuitive and consistent.
2. Make camera behavior predictable in both perspective and orthographic modes.
3. Make axis orientation explicit and configurable.
4. Make the View Cube useful, clickable, and synchronized with the camera.
5. Add cutting plane tools for section inspection.
6. Add label controls that reduce clutter and improve readability.
7. Improve layout, spacing, and control grouping.
8. Preserve performance and avoid unnecessary re-rendering.
9. Promote restraints, properties, and visibility tools to first-class viewer features.

---

## Scope

The revamp must cover these areas:

- navigation modes
- camera controls
- projection switching
- axis settings and axis display
- View Cube
- section / cut plane tools
- label display and label filtering
- property inspection and grouped metadata display
- restraint / support visualization and active-state display
- legend behavior
- selection, isolate, hide, transparency, and focus tools
- UI layout and control density
- display defaults and persistence
- saved views / bookmarks / presets

---

## Target Experience

The Geometry tab should feel like a modern engineering viewer:

- the user understands where the model is oriented
- the user can orbit, pan, zoom, and reset without confusion
- the user can inspect a model section without losing context
- labels do not flood the screen
- the axis and View Cube always agree with the camera
- advanced settings are available, but the default view stays clean
- the viewer can switch cleanly between `IsoTheme` and `3D Theme`
- properties are readable, complete, and grouped by engineering meaning
- restraints are visible as real scene objects, not just hidden metadata
- labels are de-duplicated by pipe run instead of repeating on every segment

---

## Navisworks-Style Gap Analysis

The current brief is strong on camera, axis, cube, sectioning, and labels, but a
Navisworks-like viewer also needs the following first-class behaviors:

- object browser / model tree
- property browser with grouped engineering metadata
- isolate, hide, unhide, transparency, and focus-selected actions
- search / find by line number, tag, node, or support name
- measurement tools
- bookmarks / saved viewpoints
- support / restraint symbols in the viewport
- visual state for hover, selection, active load case, and filtered visibility
- run-based label consolidation for straight pipe stretches
- display presets and per-user defaults
- quick access settings drawer for all view options

The revamp instruction must explicitly cover these gaps so the geometry tab does
not become another camera-only viewer with better styling.

---

## Implementation Principles

1. Keep the model data pipeline stable.
2. Move interaction behavior into explicit viewer state, not ad hoc flags.
3. Prefer clear and maintainable math for camera and axis transforms.
4. Avoid hardcoded UI assumptions that only work for one project.
5. Make defaults safe, readable, and predictable.
6. Expose important settings in a visible settings panel, not hidden in code.
7. Preserve backward compatibility with current ACCDB / parsed data structures.

---

## Files Likely To Change

The implementation will likely require coordinated edits in:

- `viewer/tabs/geometry-tab.js`
- `viewer/geometry/isometric-renderer.js`
- `viewer/geometry/pipe-geometry.js`
- `viewer/geometry/labels.js`
- `viewer/geometry/symbols.js`
- `viewer/styles/geometry.css`
- `viewer/core/state.js`

Additional support code may be required if the settings model or label model needs to expand.

---

## Navigation Revamp

### Required Navigation Modes

The Geometry tab must support these modes:

- Select
- Pan
- 3D Orbit
- 2D Orbit / planar rotation
- Fit / Home / Reset

These modes must be clearly visible and mutually understandable.

### Navigation Requirements

- left mouse behavior must be explicit and consistent
- right mouse behavior must be explicit and consistent
- wheel zoom must feel smooth and not jumpy
- touch / trackpad behavior must be supported
- orbit damping must be tunable
- panning must not accidentally trigger orbit
- selecting must not conflict with orbit and pan

### Recommended Interaction Rules

- Select mode: click to pick, drag should not rotate
- Pan mode: drag translates the scene
- 3D Orbit mode: free rotation around the model target
- 2D Orbit mode: planar rotation around the configured vertical axis

### Quality Rules

- navigation must not feel inverted without an explicit setting
- camera motion must not "snap" unless the user requests a preset
- orbit should remain centered on the current model target
- resetting should restore a known, stable view

---

## Camera Revamp

### Projection Modes

Support both:

- Perspective
- Orthographic

Perspective should be the default unless the current product convention says otherwise.

### Camera Settings

Expose camera settings in the UI:

- field of view
- near plane
- far plane
- zoom
- orbit damping
- rotate speed
- pan speed
- zoom speed
- auto-fit behavior

### Camera Behavior Requirements

- projection switching must preserve target and orientation
- camera resets must not create disorientation
- fit-to-model must work with both projection modes
- the camera must respect current axis settings
- clipping planes must be safe for large models

### Camera State Persistence

Persist the following:

- last projection mode
- last orbit mode
- last zoom level
- last target point
- axis setting
- section plane state
- label display settings

---

## Axis Revamp

### Axis Goals

The user must always know:

- what is up
- what is north
- what is east
- how the current model orientation maps to the on-screen axes

### Axis Settings

Add a settings panel block for axis configuration:

- axis convention preset
- up axis selector
- north axis selector
- east axis selector
- invert axis toggle where appropriate
- show / hide axis gizmo
- axis label precision
- axis label size

### Axis Display Requirements

- show a clear axis gizmo in the viewport
- axis labels must be readable at all zoom levels
- axis colors must be consistent and distinct
- axis display must match View Cube orientation

### Axis Mapping Rules

- the chosen axis convention must be applied everywhere
- camera presets, geometry orientation, labels, section plane, and view cube must all use the same mapping
- do not let the model appear to use one axis system while the gizmo uses another

---

## View Cube Revamp

### View Cube Goals

The View Cube should be a real navigation tool, not decoration.

### Required Behavior

- clickable faces
- clickable edges
- clickable corners
- synchronized with current camera orientation
- tooltips or labels for each face
- visible only when appropriate

### Required Views

At minimum provide:

- Top
- Bottom
- Front
- Back
- Left
- Right
- Isometric preset(s)

### Interaction Rules

- clicking a face should snap to that view
- clicking an edge should align to a standard intermediary orientation if supported
- clicking the cube should not break current target
- the cube must respect the selected axis convention

### UI Quality Rules

- cube must not cover critical model content unnecessarily
- cube should remain legible on both dark and light backgrounds
- cube labels should be small but readable

---

## Cutting Plane / Section Tools

### Goals

Add a sectioning workflow so the user can inspect internal geometry and routing.

### Required Controls

- enable / disable cutting plane
- plane orientation selector
- plane offset slider
- snap plane to axis
- reset plane
- optional clip inversion
- section cap toggle

### Plane Modes

Support at least:

- X-aligned plane
- Y-aligned plane
- Z-aligned plane
- user-defined plane normal if practical

### Section UX Rules

- section mode must be obvious in the UI
- sectioning should not destroy the current camera target
- section plane changes should be smooth
- section state should be restorable

### Label and Section Interaction

- allow labels to be hidden inside the cut region
- optionally keep labels that are outside the cut region
- avoid label clutter when a section is active

---

## Label System Revamp

### Goals

The labels must be readable, configurable, and not overwhelming.

### Pipe Run Labeling Rules

The label unit must be the logical pipe run, not the raw render segment.

Required behavior:

- group connected pipe segments into a continuous stretch
- build a label signature from the run identity, not from each segment
- show at least one label per visible pipe stretch
- suppress repeated labels on the same straight or near-straight run
- keep fitting, branch, support, and equipment labels available even when pipe-run labels are thinned
- increase label density only when zoomed in or when the user explicitly requests more detail

Suggested run signature inputs:

- line number
- run / system / area
- material
- OD
- wall thickness
- insulation thickness
- process values
- route direction
- branch / fitting breaks

Suggested placement rules:

- place one primary label near the visible center of the run
- if the run is long, allow a secondary label only after a screen-space distance threshold is crossed
- keep the label away from elbows, tees, reducers, and restraints if possible
- prefer one label that follows the run instead of many repeated labels on each segment

Suggested deduplication logic:

- same run signature = same primary label
- repeated labels inside the same stretch are hidden unless the segment is selected or hovered
- if the same label appears in adjacent segments, collapse them into one run label
- if labels collide, keep the most informative one and hide the rest
- if the camera moves far away, collapse detail to a compact run tag

### Label Types

Support display controls for:

- node labels
- element labels
- OD labels
- material labels
- temperature labels
- pressure labels
- line reference labels
- support tags
- custom annotations

### Label Display Options

Add more options for clean display:

- show all labels
- show only hovered object labels
- show only selected object labels
- show only major labels at current zoom
- limit number of labels per object
- hide overlapping labels
- hide labels below a zoom threshold
- abbreviate labels when space is limited
- choose label precision
- choose label font size
- choose label opacity
- choose label background / halo style
- choose label leader line visibility
- choose label pinning behavior
- choose label collision policy
- choose label priority rules

### Label Layout Rules

- labels should avoid overlapping each other
- labels should avoid covering key geometry when possible
- labels should move smoothly with camera motion
- labels should anchor to relevant geometry points
- labels should remain readable during orbit and pan

### Label Formatting Rules

Use concise, engineering-friendly label formats:

- show only the most relevant data first
- keep units consistent
- avoid redundant values
- prefer short tags over long sentences
- allow multi-line labels when necessary

### Label Prioritization

If labels must be hidden due to density, use the following priority:

1. selected object labels
2. hovered object labels
3. supports and restraints
4. line references
5. major OD / branch / equipment labels
6. secondary / duplicate labels

### Label Clean-Display Modes

The settings drawer must support at least these label modes:

- Off
- Minimal
- Run Only
- Selected Only
- Hover Only
- Supports Only
- Major Objects
- Smart Density
- Full Detail

The default should be Smart Density: one label per run, plus explicit labels for
supports, selected objects, and important fittings.

---

## UI Revamp

### Layout Goals

The tab should feel clean, structured, and professional.

### Recommended Layout Structure

- top control strip
- left or center viewport
- right-side settings and display panel
- collapsible advanced settings groups
- compact label and axis settings

### UI Requirements

- controls should be grouped by task
- settings should be understandable at a glance
- advanced settings should not clutter the default view
- important toggles should be reachable without scrolling through noise
- spacing and typography should be visually calm
- the settings icon should open the full display drawer described below

### Display Panel Sections

Suggested sections:

- Camera
- Navigation
- Axis
- View Cube
- Section / Cutting Plane
- Labels
- Properties
- Restraints / Supports
- Selection / Visibility
- Legend
- Display Presets
- Bookmarks / Saved Views

### UX Defaults

Default settings should prioritize:

- clear orientation
- low label clutter
- smooth orbiting
- obvious view reset behavior
- readable model presentation

---

## Property Panel Revamp

### Goals

The property display must behave like an engineering property inspector, not a
single-line tooltip.

### Required Property Groups

The property panel must show all available fields, grouped by meaning:

- identity
- connectivity
- geometry
- process
- material
- insulation
- analysis
- restraint / support
- metadata

### Required Fields

At minimum, the property display must include:

- T1
- T2
- T3
- P1
- P2
- fluid density
- insulation thickness
- insulation density
- wall thickness
- corrosion allowance
- diameter / bore
- line number
- from node
- to node
- support name
- support GUID
- restraint type
- restraint state
- branch / reducer / bend metadata

### Property Display Rules

- hovered object should show a compact summary card
- selected object should show the full property inspector
- pinned object should stay visible while the user navigates
- properties must show units dynamically
- raw data and derived data should be separable
- the panel should allow copy, search, expand, collapse, and pin

### Selected Component Inspector

When the user clicks a pipe or component in the viewport:

- the object becomes the active selection
- the property panel must switch to that selected component
- the panel must list all available properties for that component
- the panel must preserve both raw and derived values
- the panel must group fields by engineering category
- the panel must not hide secondary properties unless the user collapses them
- the panel must update immediately on selection change
- the selected object must be easy to re-select, pin, or isolate

If multiple components are selected, show a selection summary plus individual
component property sections.

### Viewport Property Chips

In addition to the side panel, the viewport should show compact property chips for
selected or hovered objects:

- line number
- component type
- size
- material
- temperature
- pressure
- support name for restraints

Keep the viewport chips small. The full property table belongs in the side panel.

---

## Restraint / Support Visualization

### Why Restraints Are Missing Today

The current brief does not promote restraints to first-class scene objects. That is
why restraints are easy to lose or never appear as proper graphics. In a Navisworks-
style viewer, restraints must be rendered by a dedicated support layer, not treated
as hidden metadata only.

### Required Support Rendering Pipeline

The implementation must:

- parse restraint / support metadata from the imported model
- bind each restraint to its host node or support coordinate
- render a support glyph in the viewport when visibility is enabled
- render the support name and support GUID when labels are enabled
- support hover, selection, and pinning states
- support active load-case highlighting

### Support States

Each restraint must have explicit display states:

- visible
- hidden
- hovered
- selected
- pinned
- active
- fired / emphasized
- clipped by section

### Support Visual Rules

- anchors, guides, stops, springs, and rigid supports should have distinct glyphs
- the glyph size should scale with zoom
- the glyph color should reflect state and/or support type
- selected restraints should receive a stronger outline or halo
- active / fired restraints should have a stronger emphasis than passive restraints
- support callouts must not flood the screen

### Fired / Active Logic

The work instruction must define what "fired" means on screen:

- if a restraint is hovered, fire a temporary emphasis state
- if a restraint is selected, fire a persistent emphasis state
- if a restraint is active in the current load case, fire a load-state emphasis state
- if a restraint is within the cut region, show a clipped or partially clipped state

### Support Visibility Controls

The settings panel must allow the user to:

- show all restraints
- show only selected restraints
- show only active restraints
- show only hovered restraints
- hide support labels
- hide support glyphs
- highlight restraint type
- highlight fired state
- scale restraint symbols

---

## Selection, Visibility, and Inspection

### Required Viewer Actions

Add the Navisworks-like actions that are currently missing from the brief:

- select pipe / component
- isolate selected objects
- hide selected objects
- unhide all
- focus on selection
- zoom to selection
- transparency / ghosting toggle
- find by tag / line number / node
- measure distance / angle / radius
- search by property value

### Visibility Rules

- visibility state must apply to geometry, labels, and restraints consistently
- isolate should not silently remove the current section state
- transparency should preserve selection and label priority
- hidden objects should remain searchable if that behavior is enabled

---

## Settings / Gear Panel Revamp

### Goals

The settings icon must open a detailed, professional-grade viewer configuration
panel. The settings panel should feel like the control center of the viewer.

### Required Sections

The settings drawer must include these groups:

- View
- Navigation
- Camera
- Axis
- View Cube
- Labels
- Properties
- Restraints / Supports
- Section / Cut Plane
- Selection / Visibility
- Appearance
- Bookmarks / Presets
- Performance
- Reset / Defaults

### View Section

- perspective / orthographic switch
- home view
- fit to model
- fit to selection
- saved named views
- background style
- grid on / off

### Navigation Section

- select mode
- select pipe / component mode
- pan mode
- 3D orbit mode
- 2D orbit / planar rotation mode
- orbit speed
- pan speed
- zoom speed
- damping
- mouse button mapping
- touch / trackpad behavior
- invert scroll option

### Camera Section

- field of view
- near / far planes
- camera target
- camera reset
- default projection
- animation on view change

### Axis Section

- axis convention preset
- up axis
- north axis
- east axis
- axis gizmo toggle
- axis label size
- axis label color
- axis precision
- axis lock toggle

### View Cube Section

- show / hide cube
- cube size
- cube opacity
- face labels
- edge labels
- snap-to-face toggle
- cube corner behavior

### Labels Section

- show labels
- one label per pipe stretch
- show selected labels
- show hovered labels
- label density
- label font size
- label halo
- label background
- label leader lines
- label collision mode
- label priority mode
- label pinning

### Properties Section

- compact summary card on hover
- full property inspector on selection
- show raw data
- show derived data
- group properties by category
- unit display mode

### Restraints / Supports Section

- show restraints
- show restraint names
- show restraint GUIDs
- highlight active / fired state
- scale support symbols
- filter support types
- show only selected supports

### Section / Cut Plane Section

- enable sectioning
- axis-aligned plane selection
- offset slider
- cap on / off
- invert clip
- multiple section presets

### Selection / Visibility Section

- isolate selected
- hide selected
- transparency / ghosting
- focus selection
- unhide all
- selection color

### Appearance Section

- theme preset
- `IsoTheme` for pencil / technical line-art presentation
- `3D Theme` for shaded pipe presentation
- background color
- line thickness
- edge overlay
- antialiasing
- high quality / performance mode

### Theme Modes

The viewer must support two high-level display themes:

#### `IsoTheme`

Use this for the pencil / technical presentation mode:

- clean line-art look
- stronger edge emphasis
- minimal shading
- restrained surface fills
- clear label and symbol contrast
- suitable for review, markup, and print-like inspection

#### `3D Theme`

Use this for shaded model presentation:

- visible depth and volume
- stronger lighting cues
- material-aware surfaces where supported
- softer edge emphasis than `IsoTheme`
- suitable for presentation and spatial understanding

Theme switching must preserve camera state, selection, section state, and label
visibility settings.

### Bookmarks / Presets Section

- save current view
- rename preset
- restore preset
- delete preset
- set default home view

### Reset / Defaults Section

- reset camera
- reset labels
- reset axis
- reset view cube
- reset all viewer settings
- restore factory defaults

### Settings Persistence

Persist all viewer settings per user and per workspace if possible. The settings
panel must not be a dead-end menu. It should control the full viewer experience.

---

## Settings Model

The geometry tab should support a settings object that can be persisted.

Suggested settings:

- `cameraMode`
- `projection`
- `fov`
- `nearPlane`
- `farPlane`
- `rotateSpeed`
- `panSpeed`
- `zoomSpeed`
- `dampingFactor`
- `axisConvention`
- `upAxis`
- `northAxis`
- `eastAxis`
- `showAxisGizmo`
- `showViewCube`
- `showLabels`
- `labelMode`
- `labelDensity`
- `labelPrecision`
- `labelFontSize`
- `labelBackground`
- `labelLeaderLines`
- `labelCollisionMode`
- `labelPinning`
- `themePreset`
- `renderStyle`
- `sectionEnabled`
- `sectionAxis`
- `sectionOffset`
- `sectionCap`
- `showLegend`
- `showProperties`
- `propertyGroups`
- `showRestraints`
- `showOnlySelectedRestraints`
- `showActiveRestraints`
- `showTransparency`
- `showBookmarks`
- `showGrid`
- `showSelectionHelpers`

Persist settings in the existing state / storage mechanism rather than creating a separate one-off path.

---

## Rendering and Performance Rules

- do not rebuild the entire scene if only a label or camera setting changes
- separate geometry updates from UI updates
- use throttling for high-frequency camera events
- avoid unnecessary DOM churn
- keep label rendering efficient
- prevent repeated expensive traversals on every frame

### Performance Targets

- smooth interaction on large models
- stable camera response
- no flicker on label updates
- no noticeable lag during mode switching

---

## Acceptance Criteria

The revamp is complete only when all of these are true:

- the geometry tab looks and feels like a professional viewer
- navigation modes are clear and reliable
- camera behavior is predictable
- axis settings are visible and functional
- View Cube works and matches the camera
- cutting plane tools work without breaking the view
- labels can be simplified or expanded through controls
- labels do not repeat on every pipe segment by default
- at least one label appears per visible pipe stretch
- the property panel shows T3, fluid density, insulation thickness, and insulation density
- clicking a pipe opens its full property panel
- the selected component property panel lists every available property for that object
- restraints appear as scene objects and can be hovered, selected, and emphasized
- the settings drawer exposes all major viewer view options
- the viewer can toggle between `IsoTheme` and `3D Theme`
- the UI feels organized, not crowded
- model inspection is easier than before
- existing data loading still works

---

## QA Checklist

Verify the following:

- orbit does not drift unexpectedly
- pan does not rotate the model
- reset returns to a stable default view
- switching between perspective and orthographic preserves the target
- View Cube snaps correctly
- axis gizmo matches the chosen convention
- cutting plane clips as expected
- labels are readable and can be reduced
- repeated labels collapse across the same pipe run
- properties are visible in both the side panel and compact viewport summary
- selecting a pipe updates the property panel with the full component property set
- restraints show visible, selected, and fired states correctly
- settings icon opens the full control drawer
- theme preset switches between pencil-style and shaded 3D style
- label settings persist after reload
- geometry still renders after all UI changes
- theme switching preserves selection, sectioning, and camera state

---

## Implementation Order

1. Define the geometry viewer settings model.
2. Implement camera and navigation behavior.
3. Implement axis convention mapping and axis gizmo updates.
4. Implement View Cube interactions.
5. Implement section / cutting plane controls.
6. Rework label display rules and label density controls.
7. Implement property panel grouping and viewport property chips.
8. Implement restraint / support rendering and state handling.
9. Refactor the geometry tab UI layout.
10. Add persistence and default settings.
11. Run validation and regression checks.

---

## Non-Goals

Do not change these unless a specific requirement demands it:

- ACCDB parsing logic
- element continuity logic
- report generation outside the geometry tab
- stress calculation logic
- nozzle, support, or summary tab behavior

---

## Final Instruction To The Implementing AI

Implement the geometry tab as a full viewer revamp. Favor clarity, control, and
engineering-grade interaction quality over quick visual tweaks. The tab should
feel deliberate, configurable, and readable. Keep the model data path stable, but
rebuild the experience around it.
