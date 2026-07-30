# Draw module architecture

The draw module is organized by responsibility. A file should live beside the
state and behavior it owns, not in a generic `helpers` or `services` bucket.

## Feature domains

- `actions/`: draw command names, parameter contracts, and command dispatch.
- `canvas/`: Fabric canvas lifecycle, object/event managers, Fabric setup, and
  interaction overrides.
- `claims/`: collaborative claimed-area state and enforcement.
- `document/`: loading, drafts, serialization, export, and preview generation.
- `history/`: undo/redo state, action capture, and reversible operations.
- `input/`: gestures, gesture/render coordination, and keyboard shortcuts.
- `objects/`: object operations, serialization, spatial indexing, and z-order.
- `rendering/`: the render engine, layers, tile pipeline, bakery worker client,
  and render metrics.
- `sharing/`: drawing recipients, sending, and sharing UI state.
- `sync/`: room state, wire contracts, and remote action synchronization.
- `tools/`: drawing-tool state and behavior.
- `ui/`: draw-screen UI state.

## Rendering internals

`rendering/renderEngine.ts` is the public engine entry point. Its implementation
is split by job:

- `coordination/`: frames, invalidation, baking, and overview scheduling.
- `tiles/`: tile geometry, storage, compositing, baking, and stamping.
- `bakery/`: worker protocol, health policy, assets, and the main-thread client.
- `committedLayer.ts`, `liveLayer.ts`, and `worldOverview.ts`: the three visual
  layers composed by the engine.

Callers should import the public `RenderEngine`. Coordination classes are
implementation details, not alternate engines.

## State rule

Pinia is reserved for reactive state consumed by Vue or shared across screens.
Canvas infrastructure and render-engine state use plain factories and classes.

Examples:

- `document/document.store.ts`: reactive save/load and draft state.
- `history/history.store.ts`: reactive undo/redo availability.
- `canvas/drawObjectManager.ts`: non-reactive scene and engine coordination.
- `canvas/drawEventManager.ts`: non-reactive Fabric event attachment.

## Dependency direction

```text
Vue components
  ↓
session / ui / document / sharing / tools / history / sync
  ↓
canvas
  ↓
rendering / objects / input
```

Render internals must not import Vue or Pinia stores. Canvas integration may
connect the engine to application state through explicit adapters.
