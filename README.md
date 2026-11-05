# 11:47 Laundromat

An interactive distance study by Mere Cui for Spatial AI.

Four people wait inside a late-night laundromat. Occupants have live locations, the floor can be queried, and the room compares two distinct spatial metrics.

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

**Mere Cui — Spatial AI, November 2026**
