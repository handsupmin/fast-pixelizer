# Update Notes

## 1.3.1

- Added `npm run eval:snap-quality` for model and demo fixture evaluation.
- Added objective snap quality criteria for aspect preservation, micro-grid detection, idempotence, boundary evidence, source disorder, and preservation MAE.
- Improved `snap()` on high-resolution generated images by preventing texture-level grid detection and clamping implausibly dense final grids.
- Added a uniform-cell repeat-snap fast path so already-snapped outputs keep their grid on repeated runs.
- Added regression coverage for repeat stability on demo snap outputs.
- Split snap internals into smaller modules for quantization, edge profiles, uniform-grid detection, and cell resampling.

## 1.3.0

- Added rectangular `pixelate()` grids via `resolution: { cols, rows }`.
- Added `fitResolutionToAspect(input, n)` for scalar-to-rectangular grids that keep square cells on non-square images.

## 1.2.0

- Stabilized repeated `snap()` on already-clean images.
- Regularized square-canvas snap output so X/Y grid counts no longer drift apart.
- Added snap regression tests and the first snap autoresearch report.
