# 11:47 Laundromat

An interactive distance study by Mere Cui for Spatial AI.

Four people wait inside a late-night laundromat. Occupants have live locations, the floor can be queried, and the room compares two distinct spatial metrics.

## Metrics

- **Isovist distance** compares two binary visibility fields. Sightlines are ray-cast against walls, washers, dryers, folding tables, carts, benches, and the utility room. The displayed percentage is their Jaccard difference: `0%` means the same visible set and `100%` means no visible sample is shared.
- **Attention-distribution distance** compares two normalized distributions across five attractors: wall clock, dryers, front door, phone glow, and soap machine. The displayed value is a 1-Wasserstein Earth Mover distance using attractor-to-attractor floor distance as transport cost.

The default pair is deliberately far by isovist but close by attention: machines divide their views while the wall clock occupies both waits. The attention distributions are authored behavioral assumptions, not measured cognition or eye-tracking.

The scene is drawn in browser code. Insert a coin to wake a drum, click a person to make them point A, and choose point B on the receipt.

**Mere Cui — Spatial AI, October 2026**
