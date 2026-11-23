# Proposals

Design notes for work that is planned but not started (or only partly done).
Each file describes the problem, the proposed design and a suggested order of work.

| Proposal | Status |
|---|---|
| [Tree placement and world features](tree-placement.md) | proposed, tree builder and climate placement done |
| [Rendering performance](rendering-performance.md) | partly done |
| [Worker pipeline: world worker as coordinator](worker-pipeline.md) | partly done: protocol, scheduler, world worker owning edits and simulation |
| [Water flow](water-flow.md) | done: levels, source and flowing water; slopes and cost later |
| [Water Fresnel: real face normals](water-fresnel.md) | proposed; now the sides follow the top |
| [Block definitions and climate tints](block-definitions.md) | steps 1, 2 done: `blocks.json`, run-time mesher table, textures composed at load (colour ops, spruce); climate tints and the layer budget proposed |
| [Lighting: sky and block light, 8 levels](lighting.md) | steps 1..3 done: light bits, vertex light, shader, the light pass, edits; particles, plants; water next |
