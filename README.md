# 11:47 Laundromat

An interactive spatial-agent study by Mere Cui for Spatial AI.

Nine people share a late-night laundromat. Occupants have live locations, the floor can be queried, and the room compares two distinct spatial metrics.

## Metrics

- **Isovist distance** compares two binary visibility fields. Sightlines are ray-cast against walls, washers, dryers, folding tables, carts, benches, and the utility room. The displayed percentage is their Jaccard difference: `0%` means the same visible set and `100%` means no visible sample is shared.
- **Attention-distribution distance** compares two normalized distributions across five attractors: wall clock, dryers, front door, phone glow, and soap machine. The displayed value is a 1-Wasserstein Earth Mover distance using attractor-to-attractor floor distance as transport cost.

The default pair is deliberately far by isovist but close by attention: machines divide their views while the wall clock occupies both waits. The attention distributions are authored behavioral assumptions, not measured cognition or eye-tracking.

## Proximity rules

- If two people are less than 1.2 meters apart, the room asks for personal space.
- If someone is within 0.8 meters of an active drum, its door is blocked.
- If someone leaves less than 0.9 meters at the entrance, the exit is marked as blocked.
- If two attention distributions are less than 30 transport steps apart and share one dominant focus, their attention is marked as too close.

The drawing uses an approximate scale of 1.8 centimeters per plan unit. Dragging a person recalculates the physical clearances in real time.

## Position and movement

- **Between** appears when a person occupies the open aisle separating the two folding tables.
- **Adjacent** appears when a person is within 28 plan units of a washer or dryer edge with no occupiable gap between them.
- **Among** appears when at least three people form a cluster whose largest pairwise separation is below 118 plan units.
- **Toward** and **away** compare the start and end distance to the closest reference object at the beginning of a drag.
- **Past** appears when the drag path enters and leaves the near field of a washer, dryer, or folding table.

The colored paths retain the last three movement events for fourteen seconds. They are computed from the actual drag trajectory rather than assigned as decorative labels.

The scene is drawn in browser code. Insert a coin to wake a drum, click a person to make them point A, and choose point B on the receipt.

## The cutaway room

The default view is a procedural 2.5D cutaway built in Canvas. Furniture, enamel casings, clothes, little paper figures, wall glazing, rain and light are drawn in code. No generated images, downloaded scene models, or external rendering libraries are used.

Choose a person and click an open floor tile to walk there. Routing uses an eight-neighbor grid with collision-checked edges against the same furniture footprints used by the distance calculations. Dragging is also available. Arrow keys move the selected person when the canvas is focused. Camera controls turn and zoom the scene. The floor-plan button exposes the same world from overhead, and the sight/attention button toggles analytical fields.

An adjacent person opens an idle machine door. A running machine stays locked, and a machine with its door open cannot start. The aisle lights up when someone is between the tables, and a shared ground shape appears for a three-person cluster.

Rendering and measurement share the same ground coordinates. The visibility model still treats furniture footprints as solid plan obstructions. It is a stylized planar simulation, not a full 3D visibility, lighting, eye-tracking, or pedestrian-behavior model. Decorative overhead fixtures do not block walking.

The pre-cutaway version is retained in the Git tag `before-spatial-stage-20261105`.

## A room with nine people

The original four are joined by a blue coat carrying a wash basket, a student with a phone and backpack, a seated reader, a red scarf with a laundry bag, and a yellow raincoat with a folded umbrella. Each has its own normalized five-part attention distribution. The figures have different clothes, hair, props, and standing or seated poses.

The register shows each person's current activity and remains selectable. It is three columns on desktop and two on narrow screens. Both distance selectors include the current population.

## Spatial agents

The Spatial Agents workshop replaces the earlier station scripts with two goal-driven types. The previous nine-person version is retained in `before-spatial-agents-20261105`.

- **Customers** discover a washer, wash, discover a dryer, dry, fold at a table, and return to their remembered starting place. Their performance target is all four steps within 240 simulation seconds, with shorter travel preferred.
- **The attendant** discovers and inspects all 14 machines, repairing faults encountered along the way. The inspection target is 180 simulation seconds; elapsed time, walked distance, inspection count and repairs remain visible. Inspection requires a recent visual observation within 75 plan units. Repair requires approaching the machine and spending four simulation seconds there.

Each person starts with a remembered home position and a partial first observation, not the complete map. Customers see a 100-degree cone up to 210 plan units; the attendant sees 125 degrees up to 250 units. Furniture footprints occlude these views. Recognizing an object reveals its own extent, a simplified object-recognition assumption. It does not reveal hidden neighboring furniture or machine states.

Every person has a separate 50-by-29 belief grid, object records, last-seen people, a movement trail and landmark snapshots. A landmark records the last observed affordance or machine state, observation time, and its offset from that person's starting place. An unseen machine can change without silently updating their memory. The pocket map visualizes unknown floor, remembered floor, current vision, obstacles, occupants and landmarks. Switching people changes the map.

Planning uses A* over that person's belief grid. Unknown cells cost 1.65 times remembered free cells, encouraging routes through already learned places. Only remembered object footprints and currently sensed people enter the planner. A separate physical collision gate stops penetration; a collision reveals local information and prompts replanning. The legacy full-map route finder is not used by these agents.

People yield when the next step would bring bodies within 24 plan units, try known free sidesteps, and retry temporarily blocked destinations. A finished person can receive a local request to make room. This body threshold is distinct from the broader 1.2-meter personal-space warning. Remembered landmarks guide later visits and the final return; the notebook reports the measured return distance. There is no claim that a particular remembered route is globally optimal.

### A busier room

**9 MORE PEOPLE** adds nine customers with independent maps, bringing the room to 18. **Shared traces** overlays unique-person counts per traversed floor tile and counts of people who independently discovered the same landmark. This is an observer's aggregate, never a shared map supplied to agents. **START OVER** restores the original nine people and clears knowledge, machine ownership, goals and aggregate traces.

**LOOK AROUND** rotates the selected person's sensor. **JAM A DRYER** changes the world; an agent must observe the fault before knowing it. Clicking a remembered landmark requests a route using that person's knowledge. Manual floor clicks and dragging remain available; **let them decide** returns control to the agent. Pause freezes simulation time and movement.

The **time** button cycles between 1×, 4× and 8× observation speeds. Time targets and machine durations use simulation seconds at every speed, with physics substeps kept at 40 milliseconds or less. Reset returns to 1×.

### Scope and verification

Wash, dry and folding times are compressed to 16, 13 and 6 simulation seconds. These timings, vision ranges, movement rules and goal deadlines are authored workshop parameters, not measured laundry cycles or a validated model of human cognition. Visibility remains planar, and agents are represented by floor points with a body-separation rule. The observer can see the room while each agent's decisions remain limited to private observations.

`node tests/agents.cjs` checks independent partial maps, cone direction and occlusion, stale observations, planning without the full-map oracle, obstacle and person avoidance, goal progression, all-machine inspection, repair, 18-person initialization, aggregate evidence and reset. `AGENT_TEST_STEPS=3000 node tests/agents.cjs` runs a 300-simulation-second baseline plus a 30-second crowd check. The baseline completes the laundry sequence for all eight customers and inspects all 14 machines; actual times and yields can vary with frame timing and interaction.

The implementation follows the two-page assignment in [Spatial Agents](https://awmartin-xyz.s3.amazonaws.com/spatial-ai/assignments/spai-workshop-agents.pdf). A separate editable screenshot deck documents the evolving maps and aggregate behavior for submission.

**Mere Cui — Spatial AI, November 2026**
