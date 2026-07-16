---
title: Interactive 3D Scenes with Three.js Skill
category: Design
description: Ship web 3D that loads fast, looks lit rather than rendered, and doesn't leak memory when the route unmounts. Covers color management and tone mapping, PBR lighting, glTF/Draco budgets, raycasting, instancing, disposal discipline, and the reduced-motion and no-WebGL fallbacks most demos skip.
usage: Load this skill before asking your AI assistant to build or debug a Three.js scene — a product viewer, a hero animation, a data sculpture. Describe the scene, the target device, and your asset budget; the assistant will set up renderer color management correctly, keep draw calls bounded, and write the teardown path in the same pass as the setup path.
platforms: [Claude, ChatGPT, Cursor]
priceUsd: 0
timeSavedHours: 24
pocUrl: https://github.com/mrdoob/three.js
---

# Interactive 3D Scenes with Three.js Skill

## 1. Philosophy

Most web 3D looks like a demo. It is technically correct and reads as plastic — a shiny torus under a single point light on a gray background. The gap between demo and product is not skill with math; it is a short list of decisions almost everyone gets wrong once.

1. **Color management is not polish; it is the difference between "3D" and "rendered."** Working in linear space, tone mapping to sRGB on output, and marking which textures are color versus data is what makes lighting behave physically. Skip it and no amount of light tweaking will save you.
2. **Lighting sells realism; models don't.** An environment map contributes more perceived quality than tripling your polygon count. Real scenes have light bouncing from everywhere; a lone `DirectionalLight` never occurs in nature and the eye knows it.
3. **The budget is a design constraint, stated up front.** "60fps on a three-year-old Android over 4G" implies a triangle count, a texture budget, and a draw-call ceiling. Decide these before modeling, not after the first profiling panic.
4. **Every `new` needs a matching `dispose()`.** The garbage collector does not free GPU memory. A scene that mounts and unmounts twenty times without teardown will crash the tab — on the user's machine, not yours.
5. **3D is an enhancement.** WebGL fails, GPUs get blocklisted, and people set `prefers-reduced-motion` for real medical reasons. The fallback is part of the feature.

## 2. Tech Stack

- **Three.js** — https://github.com/mrdoob/three.js — licensed **MIT**. The standard JavaScript 3D library, rendering via WebGL2 with a WebGPU backend available.
- **Vite** (MIT) — dev server and bundler; handles the asset pipeline for `.glb` and `.ktx2` files.
- **glTF / GLB** with **Draco** geometry compression and **KTX2 / Basis Universal** texture compression — loaders live in `examples/jsm/loaders`, decoders in `examples/jsm/libs`.
- Supporting cast: `OrbitControls` (examples/jsm), the `gltf-transform` CLI (MIT) for offline optimization, `stats.js` for a frame counter during development only.

This skill is an independent, original guide; it is not affiliated with or endorsed by the Three.js maintainers. All example code is original to this skill.

## 3. Patterns

### 3.1 Renderer setup and the resize loop everyone writes wrong

```js
import * as THREE from "three"

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(3, 1.8, 4)

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas
    // Clamp DPR: a 3x phone renders 9x the pixels of a 1x screen for
    // near-zero perceptual gain and a guaranteed thermal throttle.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false) // false: do NOT write inline style; CSS owns layout
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  return { renderer, scene, camera, ro }
}
```

Three details matter. `setSize(w, h, false)` — the `false` stops Three writing inline width/height that fights your CSS and produces an infinite resize loop inside a flex container. `ResizeObserver` on the canvas beats `window.resize`, which misses sidebar collapses and split panes entirely. And the near plane at `0.1` rather than a reflexive `0.001`: depth precision is logarithmic, so a tiny near plane spends the whole depth buffer on the first centimeter and gives you z-fighting across the scene.

### 3.2 Color management and tone mapping

The highest-leverage section here. Color management is on by default in modern Three.js, but you must still declare texture intent:

```js
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js"

albedoMap.colorSpace = THREE.SRGBColorSpace   // color textures are authored in sRGB
normalMap.colorSpace = THREE.NoColorSpace     // data maps are numbers in an image costume
roughnessMap.colorSpace = THREE.NoColorSpace
metalnessMap.colorSpace = THREE.NoColorSpace

// Environment lighting from an HDRI, prefiltered for roughness-correct reflections.
const pmrem = new THREE.PMREMGenerator(renderer)
const hdr = await new RGBELoader().loadAsync("/env/studio_1k.hdr")
const envMap = pmrem.fromEquirectangular(hdr).texture
scene.environment = envMap   // lights every PBR material in the scene
hdr.dispose()
pmrem.dispose()
```

Tagging a normal map as `SRGBColorSpace` is the classic bug: Three decodes values that were never encoded, your surface normals bend wrong, and the model looks subtly waxy in a way you will chase through lighting for a full day. `ACESFilmicToneMapping` is what stops bright areas clipping to flat white — it is why film-look renders look like film. Drive brightness with `toneMappingExposure`, not by cranking light intensity into the clipping range.

### 3.3 Materials and lighting that don't look like a demo

`MeshStandardMaterial` is physically based: `roughness` and `metalness` are not style sliders. Metalness is nearly binary in reality — 0 for everything that isn't raw metal, 1 for metal, almost nothing between.

```js
const brushedSteel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1.0, roughness: 0.35 })
const matteShell  = new THREE.MeshStandardMaterial({ color: 0x2f3540, metalness: 0.0, roughness: 0.62 })

// Key: motivated, casts the shadow that grounds the object.
const key = new THREE.DirectionalLight(0xfff4e6, 2.4)
key.position.set(4, 6, 3)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.near = 1
key.shadow.camera.far = 20
key.shadow.camera.left = -5; key.shadow.camera.right = 5
key.shadow.camera.top = 5;   key.shadow.camera.bottom = -5
key.shadow.bias = -0.0005      // fights shadow acne
key.shadow.normalBias = 0.02   // fights peter-panning on curved surfaces
scene.add(key)

const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6)  // cool, no shadow, lifts the dark side
fill.position.set(-5, 2, -2)
const rim  = new THREE.DirectionalLight(0xffffff, 1.2)  // separates silhouette from background
rim.position.set(-2, 3, -5)
scene.add(fill, rim)
```

Tighten the shadow camera frustum to the objects that actually cast — a default 1000-unit frustum spreads 2048 texels across a kilometer and your shadows are mush. Warm key against cool fill is the oldest trick in cinematography and it works because it's how sunlight and sky actually behave. Keep `AmbientLight` near zero when you have `scene.environment`; adding both washes out every contact shadow you just paid for.

### 3.4 Loading glTF with Draco and KTX2, and the budgets that matter

```js
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"

export function createLoader(renderer) {
  const draco = new DRACOLoader().setDecoderPath("/draco/")
  const ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer)
  return new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
}

const gltf = await createLoader(renderer).loadAsync("/models/device.glb")
scene.add(gltf.scene)
```

`detectSupport(renderer)` is required — KTX2 transcodes to whatever compressed format the GPU actually supports and cannot know without the renderer. Copy decoder files into your public directory; a CDN path puts a third-party runtime dependency on your critical path.

Budgets for a hero product viewer on mid-range mobile: **under 3MB** total GLB, **under 150k triangles**, **textures at 1024² or 2048²** (a 4096² albedo costs 64MB of VRAM uncompressed and buys nothing at the size it renders), **under 100 draw calls**. Run `gltf-transform optimize in.glb out.glb --compress draco --texture-compress ktx2` before hand-optimizing anything; it routinely takes 40MB to 2MB with no visible change. KTX2 matters more than Draco: Draco shrinks download, KTX2 shrinks download *and* VRAM, because GPU-compressed textures stay compressed in memory.

### 3.5 Raycasting and draw-call discipline

```js
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let hovered = null, needsPick = false

function onPointerMove(e) {
  const r = canvas.getBoundingClientRect()
  // NDC: -1..1, y inverted. Use the canvas rect, never window dimensions.
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
  needsPick = true
}

function pick() {
  if (!needsPick) return
  needsPick = false
  raycaster.setFromCamera(pointer, camera)
  const next = raycaster.intersectObjects(pickables, false)[0]?.object ?? null
  if (next !== hovered) {
    hovered?.material.emissive.setHex(0x000000)
    next?.material.emissive.setHex(0x1a2b4a)
    hovered = next
    canvas.style.cursor = next ? "pointer" : "default"
  }
}
```

Pick inside the render loop behind a dirty flag, not in the pointer event — pointer events fire far more often than frames. Keep a flat `pickables` array rather than passing `scene` with `recursive: true`, which walks every mesh in the graph; for thousands of targets, raycast a low-poly proxy instead of render geometry. Interaction that exists only on hover is invisible to keyboard and touch users, so pair every hover affordance with a real DOM control. And for repeated objects, `InstancedMesh` collapses 3,000 identical bolts from 3,000 draw calls into one — `setMatrixAt(i, matrix)` plus `instanceMatrix.needsUpdate = true`.

### 3.6 Teardown, context loss, and fallbacks

GPU resources are outside the garbage collector's reach. This is the function every Three.js project needs and most don't have until the crash report arrives.

```js
export function destroyStage({ renderer, scene, ro, controls, raf }) {
  cancelAnimationFrame(raf)
  ro.disconnect()
  controls?.dispose()

  scene.traverse((obj) => {
    if (!obj.isMesh) return
    obj.geometry?.dispose()
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const mat of materials) {
      for (const value of Object.values(mat)) if (value?.isTexture) value.dispose()
      mat.dispose()
    }
  })
  scene.environment?.dispose()
  scene.clear()
  renderer.dispose()          // frees programs, render targets, WebGL state
  renderer.forceContextLoss() // releases the GL context; browsers cap you near 16
}
```

Three symptoms of missing teardown: memory ratchets up on every route change and never comes down; after roughly sixteen mounts the console says "Too many active WebGL contexts" and the canvas goes blank; and the loop keeps calling `render()` on a scene nobody can see, pinning a core and draining the battery. In React, return this from the `useEffect` that created the stage — from the first commit, because retrofitting means auditing every object you ever created.

Then handle the cases where 3D shouldn't or can't run:

```js
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
if (!canvas.getContext("webgl2")) mountPosterImage()        // a pre-rendered still of the same scene
else mountStage({ autoRotate: !reduced, animateEntrance: !reduced })

renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault()   // required, or the context never restores
  pauseLoop()
})
renderer.domElement.addEventListener("webglcontextrestored", () => { rebuildResources(); resumeLoop() })
```

Reduced motion means stop autorotation and entrance animations; it does not mean ship a blank box. The scene stays, user-driven orbit stays, unrequested movement goes. Context loss is normal — a driver reset, a laptop switching GPUs, a phone reclaiming memory — and `preventDefault()` is what makes recovery possible at all. Also stop rendering when nobody's watching: an `IntersectionObserver` pausing the loop offscreen plus a `visibilitychange` listener is ten lines and cuts idle CPU to zero.

## 4. Anti-patterns

- **No `dispose()` path.** The definitive Three.js production bug: memory climbs across route changes until "Too many active WebGL contexts" kills the canvas. Write teardown in the same commit as setup.
- **Unclamped `devicePixelRatio`.** `setPixelRatio(window.devicePixelRatio)` on a 3x phone renders nine times the pixels for no visible gain and a thermal throttle within a minute.
- **sRGB on data maps.** Normal, roughness, metalness, and AO maps tagged `SRGBColorSpace` produce subtly wrong lighting no light tweak will fix.
- **One `PointLight` and hope.** Without `scene.environment`, PBR materials have nothing to reflect and everything reads as plastic. The HDRI is not a nice-to-have.
- **A default shadow camera frustum.** 2048 texels smeared across 1000 units gives blurry, acne-ridden shadows. Fit the frustum to the casters.
- **Raycasting the whole scene on `pointermove`.** O(triangles) work at pointer-event frequency. Dirty-flag it into the render loop and keep an explicit `pickables` list.
- **A mesh per repeated object.** 3,000 identical bolts as 3,000 `Mesh` objects is 3,000 draw calls. `InstancedMesh` makes it one.
- **Creating vectors inside the render loop.** `new THREE.Vector3()` at 60fps is 3,600 allocations a minute and a GC sawtooth in the frame graph. Hoist scratch objects and reuse them.
- **Shipping the 40MB GLB straight from Blender.** Run `gltf-transform optimize` first. The raw export is never the shippable asset.

## 5. Usage

1. Load this skill into your assistant (project skill, Cursor rule, or pasted context).
2. State the target up front — device class, network, whether this is a hero moment or background texture. Ask for the triangle, texture, and draw-call budget as the first output, before any code.
3. Ask for renderer setup and color management as their own step: tone mapping, `colorSpace` per texture type, PMREM environment. Approve that before materials exist.
4. Demand the teardown function in the same response as the setup function: "include `dispose()` for geometries, materials, textures, and the renderer, plus `forceContextLoss()`."
5. Require the fallbacks explicitly: no-WebGL poster, `prefers-reduced-motion` behavior, context-loss handling, and a DOM control for anything only reachable by hovering the canvas.
6. When debugging performance, hand over `renderer.info` (`render.calls`, `render.triangles`, `memory.geometries`, `memory.textures`) rather than a description — those four numbers diagnose nearly everything.

## 6. Example Output

Prompt with this skill loaded: *"Our marketplace hero should show a slowly rotating 3D object. Keep it light — it's above the fold."*

Expected shape of the answer — budget first, then a component with teardown and fallbacks already present:

> Above the fold means the 3D competes with LCP, so: under 1.5MB GLB, under 40k triangles, one 1024² KTX2 albedo, environment from a 512² HDRI, under 20 draw calls. The canvas mounts lazily after first paint and a poster image carries the layout until then — so no-WebGL and slow-network users see the same composition, just static.

```tsx
"use client"
import { useEffect, useRef, useState } from "react"
import { createStage, destroyStage, loadHeroModel } from "@/lib/stage"

export function HeroScene({ posterSrc }: { posterSrc: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current!
    if (!canvas.getContext("webgl2")) { setFallback(true); return }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const stage = createStage(canvas)
    let raf = 0, alive = true

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loop()
      else cancelAnimationFrame(raf)
    })
    io.observe(canvas)

    function loop() {
      raf = requestAnimationFrame(loop)
      if (!reduced) stage.pivot.rotation.y += 0.0035
      stage.renderer.render(stage.scene, stage.camera)
    }

    loadHeroModel(stage).catch(() => alive && setFallback(true))

    return () => {
      alive = false
      io.disconnect()
      destroyStage({ ...stage, raf })
    }
  }, [])

  if (fallback) {
    return <img src={posterSrc} alt="A 3D rendering of stacked skill files" className="size-full object-cover" />
  }
  return <canvas ref={canvasRef} className="size-full" aria-hidden="true" />
}
```

Note the markers of skill-compliant output: budgets were stated and defended before a line of code, `destroyStage` is wired into the effect's return rather than promised for later, the WebGL check falls back to a poster with real alt text instead of a blank box, `prefers-reduced-motion` kills the autorotation while keeping the scene, an `IntersectionObserver` stops the loop when the hero scrolls away, and the canvas is `aria-hidden` because it is decoration — the accessible content is the heading beside it, not the mesh.
