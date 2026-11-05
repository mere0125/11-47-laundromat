# 11:47 Laundromat

An interactive distance study by Mere Cui for Spatial AI.

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

Five people follow authored station routines with staggered starts and different dwell times. The attendant checks the room, the blue coat carries laundry, the student visits the folding aisle, the red scarf waits near the dryers, and the raincoat goes to the soap machine and dryers. These are illustrative routines, not a calibrated model of human behavior.

Autonomous routes use the same collision-checked grid as manual walking. A moving figure yields if its next step would bring it within 22 plan units of another person; after a longer wait, an autonomous figure waits before trying its next station. This visual collision threshold is separate from the existing 1.2-meter personal-space warning. Taking manual control holds that person's routine for 45 simulation seconds. Pause freezes both the room clock and routine timing; Start Over restores all nine original positions and all routine timers.

The nine-person register shows each person's current activity and remains selectable. It is three columns on desktop and two on narrow screens. Both distance selectors include all nine people.

**Mere Cui — Spatial AI, November 2026**
