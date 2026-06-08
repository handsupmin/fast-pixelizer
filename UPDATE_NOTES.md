# Update Notes

## Unreleased

- Expanded snap quality eval with phase-alignment, alpha-preservation, and RGB palette-budget criteria.
- Added a semi-transparent synthetic fixture with a known `48x32` grid.
- Added known-grid expectations for package-generated `32x32` and `64x64` demo pixelate examples.
- Improved `snap()` on exact square pixelate outputs by detecting raw transition grids before falling back to noisier profile estimates.
- Expanded snap quality eval with low-palette retention metrics and an 8-color indexed synthetic fixture.

## 1.3.3

- Expanded `npm run eval:snap-quality` with synthetic fixtures for JPEG compression, non-integer scaling, and non-square scaled pixels.
- Improved uniform-cell detection so exact run-length grids can use independent horizontal and vertical scale factors.
- Fixed non-square scaled pixel art such as a `40x40` source stretched to `320x240`, which previously detected as `5x4` and now recovers `40x40`.
- Updated the aspect metric to compare known-grid synthetic fixtures against their expected grid aspect instead of the stretched source aspect.
- Added regression coverage for non-square scaled pixel art.

## 1.3.2

- Expanded `npm run eval:snap-quality` with synthetic fixtures that have known ground-truth grids.
- Added quality criteria for synthetic ground-truth miss, macro-grid under-detection, deterministic grid output, second-pass stability, output cell purity, p95 preservation loss, and contrast drift.
- Improved `snap()` for blurred scaled pixel art by using a gated peak-spacing recovery path only when the current grid is clearly under-detected.
- Improved uniform-cell detection for sparse same-color pixel art by selecting the shared run-length unit instead of large same-color regions.
- Added regression tests for blurred scaled grid recovery and sparse same-color repeat stability.

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
