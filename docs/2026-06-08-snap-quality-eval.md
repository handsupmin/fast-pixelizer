# Snap Quality Eval: Model and Demo Fixtures

## Goal

Build an objective loop for model-generated "pixel art" and package demo images, then accept only snap changes that do not downgrade the measured result.

## Dataset

| Group              | Path                                                        | Count |
| ------------------ | ----------------------------------------------------------- | ----: |
| Model examples     | `/Users/sangmin/sources/mono-pix/src/assets/examples`       |     5 |
| Demo examples      | `examples/`                                                 |    11 |
| Synthetic fixtures | generated under `.tmp/snap-quality-eval-*/synthetic-source` |    12 |

The model examples use the prompt `탑뷰 도트 중세 판타지 용사 파티의 모험 픽셀아트 그려줘`.

## Criteria

| Criterion           | Fail or review condition                                           | Why it matters                                                      |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Aspect preservation | grid aspect differs from the target by more than `0.03`            | Detects rectangular cells or crop-ratio drift                       |
| Ground truth        | synthetic expected-grid gap exceeds `0`                            | Prevents regressions on known-grid fixtures                         |
| Micro-grid snap     | short axis exceeds `256` cells or source cell size is below `3px`  | Catches snapping to generated texture/noise                         |
| Macro-grid snap     | source cell size exceeds `64px`                                    | Flags under-detection where a large region is mistaken for one cell |
| Idempotence         | re-snapping the snapped output changes cols+rows beyond tolerance  | True snap output should be stable                                   |
| Deep stability      | a second re-snap of the original-size snapped output changes grid  | Catches repeat-only fixes that fail one pass later                  |
| Determinism         | two snaps of the same source disagree on grid size                 | Catches non-deterministic detection                                 |
| Output purity       | snapped output cells are not single-color or square                | Verifies the core promise of snap output                            |
| Output coverage     | original-size output keeps less than `90%` of input on either axis | Flags snap results that visually shrink too far                     |
| Transparent padding | known-grid transparent-border sprite misses its expected grid      | Prevents transparent margins from being mistaken for coarse cells   |
| Partial edge crop   | known-grid source with cropped edge cells misses its expected grid | Prevents partial edge cells from shrinking the visible source grid  |
| Palette budget      | snapped RGB palette exceeds `colorVariety + 1`                     | Catches accidental color explosion while allowing transparency      |
| Palette retention   | limited-palette input keeps less than `95%` of its RGB colors      | Catches color collapse on already-indexed or hand-authored sprites  |
| Boundary evidence   | inferred boundaries are weaker than `0.6x` average axis gradient   | Flags weak or hallucinated grids                                    |
| Phase alignment     | inferred boundaries score below `0.5` against nearby peaks         | Flags grids that are strong but shifted off the true lattice phase  |
| Source disorder     | intra-cell MAE exceeds `18`                                        | Flags painterly/noisy cells inside the inferred grid                |
| Preservation        | nearest-resized snap MAE exceeds `38` or p95 exceeds `86`          | Guards against losing too much source feel                          |
| Alpha preservation  | alpha MAE exceeds `8` or p95 exceeds `40`                          | Guards transparent and semi-transparent sprites                     |
| Contrast            | snapped contrast ratio falls outside `0.45-1.8`                    | Flags washed-out or over-amplified output                           |

## Accepted Changes

1. Added a high-resolution plausibility guard so periodicity detection does not choose 1-2px texture lags on generated images.
2. Clamped final generated-image grids to a plausible short-axis cell count while preserving the source aspect ratio.
3. Added a uniform-cell fast path that detects already-snapped cell blocks from exact run lengths, restoring idempotence on repeat snaps.
4. Split snap internals into focused modules: quantization, profiles, uniform-grid detection, and cell resampling.
5. Added `npm run eval:snap-quality` to evaluate both model and demo fixtures.
6. Added synthetic known-grid fixtures for nearest scaling, blurred scaling, sparse same-color areas, rectangular grids, and transparency.
7. Changed uniform-cell run-length selection to prefer the shared base unit, fixing sparse same-color repeat stability.
8. Added a gated peak-spacing recovery path for clearly under-detected blurred scaled pixel art.
9. Added synthetic fixtures for JPEG compression, non-integer scaling, and non-square scaled pixels.
10. Changed exact uniform-cell detection to support independent horizontal and vertical run-length scale factors.
11. Changed synthetic aspect scoring to use the known expected-grid aspect instead of the stretched source aspect when ground truth exists.
12. Added phase-alignment, alpha-preservation, and RGB palette-budget eval criteria.
13. Added a semi-transparent known-grid synthetic fixture.
14. Added known-grid expectations for package-generated `32x32` and `64x64` demo pixelate examples.
15. Added an exact-transition recovery path for square pixelate outputs with uneven original-size cell widths.
16. Added low-palette retention metrics and an 8-color indexed synthetic fixture.
17. Added output-coverage metrics for original-size snap results.
18. Added a transparent-border known-grid synthetic fixture.
19. Changed square-grid candidate selection to prefer high-confidence uniform-cell grids over much coarser exact-transition grids.
20. Added a partial-edge-crop known-grid synthetic fixture.
21. Changed uniform-cell detection to use visible run counts when edge cells are partially cropped.

## Rejected Experiments

| Experiment                                              | Result                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peak-spacing estimate mixed with raw/quantized profiles | Improved one Midjourney case but increased model objective and repeat gap overall, so it was discarded.                                                                                              |
| Smallest strong autocorrelation lag                     | Fixed some snap-after repeats but broke `example-32-clean` and worsened aggregate objective, so it was discarded.                                                                                    |
| Unrestricted uniform-grid fast path                     | Reduced repeat gap but over-detected several demo/model inputs as `256x256`, so it was narrowed to cells larger than the high-res plausible minimum.                                                 |
| Ungated peak-spacing recovery                           | Helped blurred synthetic input but previously caused model/demo regressions, so the accepted version only runs when the current grid is clearly under-detected.                                      |
| Axis-specific periodic profile steps                    | Fixed one non-square scale hypothesis but regressed Midjourney to `406x95`, Seedream to `428x207`, and `example-64-clean` to `19x19`, so it was discarded.                                           |
| Rounded original output cell size                       | Improved output coverage mean from `0.9671` to `0.9851`, but worsened objective mean from `35.2438` to `35.3416` and non-integer fixture objective from `39.3218` to `45.7799`, so it was discarded. |

## Results

Same criteria, before final clamp/uniform changes:

| Scope          | Status counts                | Objective mean | Repeat gap total | Preservation MAE mean |
| -------------- | ---------------------------- | -------------: | ---------------: | --------------------: |
| Overall        | `5 fail / 5 pass / 6 review` |    `1810.6739` |            `273` |             `14.6455` |
| Model examples | `3 fail / 1 pass / 1 review` |    `3645.3938` |            `169` |             `18.8459` |
| Demo examples  | `2 fail / 4 pass / 5 review` |     `976.7103` |            `104` |             `12.7362` |

After accepted changes:

| Scope          | Status counts                 | Objective mean | Repeat gap total | Preservation MAE mean |
| -------------- | ----------------------------- | -------------: | ---------------: | --------------------: |
| Overall        | `0 fail / 11 pass / 5 review` |      `25.6681` |              `0` |             `11.2335` |
| Model examples | `0 fail / 4 pass / 1 review`  |      `29.5818` |              `0` |             `13.0334` |
| Demo examples  | `0 fail / 7 pass / 4 review`  |      `23.8892` |              `0` |             `10.4154` |

Expanded criteria and synthetic fixtures, before the sparse/blurred fixes:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: |
| Overall            | `2 fail / 13 pass / 6 review` |     `856.4724` |             `54` |                    `78` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `42.2894` |              `0` |                     `0` |
| Demo examples      | `0 fail / 6 pass / 5 review`  |      `41.4959` |              `0` |                     `0` |
| Synthetic fixtures | `2 fail / 3 pass / 0 review`  |    `3463.6035` |             `54` |                    `78` |

After the sparse/blurred fixes:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: |
| Overall            | `0 fail / 15 pass / 6 review` |      `34.3637` |              `0` |                     `0` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `42.2894` |              `0` |                     `0` |
| Demo examples      | `0 fail / 7 pass / 4 review`  |      `34.4403` |              `0` |                     `0` |
| Synthetic fixtures | `0 fail / 4 pass / 1 review`  |      `26.2694` |              `0` |                     `0` |

Notable individual fixes:

| Fixture                    | Before                          | After                          |
| -------------------------- | ------------------------------- | ------------------------------ |
| `blurred-64x40-scale6.png` | `16x10`, expected-grid gap `78` | `64x40`, expected-grid gap `0` |
| `sparse-32x32-scale10.png` | repeat gap `54`                 | repeat gap `0`                 |
| `example-snap-before.png`  | `7x7`, macro-grid review        | `41x42`, pass                  |

After fixture expansion and the non-square scale fix:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: |
| Overall            | `0 fail / 17 pass / 7 review` |      `38.1276` |              `0` |                     `0` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `42.2894` |              `0` |                     `0` |
| Demo examples      | `0 fail / 7 pass / 4 review`  |      `34.4403` |              `0` |                     `0` |
| Synthetic fixtures | `0 fail / 6 pass / 2 review`  |      `40.5963` |              `0` |                     `0` |

New fixture checks:

| Fixture                            | `1.3.2` |   After | Expected | Gap change |
| ---------------------------------- | ------: | ------: | -------: | ---------: |
| `anisotropic-40x40-to-320x240.png` |   `5x4` | `40x40` |  `40x40` |  `71 -> 0` |
| `non-integer-48x32-to-360x240.png` |       - | `48x32` |  `48x32` |        `0` |
| `jpeg-48x32-scale8-q45.jpg`        |       - | `48x32` |  `48x32` |        `0` |

After phase/alpha/palette criteria expansion:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Phase alignment mean | Alpha MAE mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------: | -------------: |
| Overall            | `0 fail / 18 pass / 7 review` |      `39.9255` |              `0` |                     `0` |             `0.8349` |            `0` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |             `0.8044` |            `0` |
| Demo examples      | `0 fail / 7 pass / 4 review`  |      `38.7336` |              `0` |                     `0` |             `0.7138` |            `0` |
| Synthetic fixtures | `0 fail / 7 pass / 2 review`  |      `38.4391` |              `0` |                     `0` |             `0.9999` |            `0` |

New criteria checks:

| Fixture or image                    | Grid      | Phase alignment | Alpha MAE / p95 | RGB palette overage | Status   |
| ----------------------------------- | --------- | --------------: | --------------: | ------------------: | -------- |
| `semi-transparent-48x32-scale8.png` | `48x32`   |             `1` |         `0 / 0` |                 `0` | `pass`   |
| `3.gpt.png`                         | `149x149` |        `0.4765` |         `0 / 0` |                 `0` | `review` |
| `example-64-clean.png`              | `39x39`   |        `0.3349` |         `0 / 0` |                 `0` | `review` |
| `example-64-detail.png`             | `66x66`   |        `0.2797` |         `0 / 0` |                 `0` | `review` |

After exact-transition recovery:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Phase alignment mean | Preservation p95 mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------: | --------------------: |
| Overall            | `0 fail / 20 pass / 5 review` |      `33.5466` |              `0` |                     `0` |             `0.8903` |                  `35` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |             `0.8044` |                `50.4` |
| Demo examples      | `0 fail / 9 pass / 2 review`  |      `24.2361` |              `0` |                     `0` |             `0.8397` |             `21.5455` |
| Synthetic fixtures | `0 fail / 7 pass / 2 review`  |      `38.4391` |              `0` |                     `0` |             `0.9999` |             `42.8889` |

Exact-transition fixes:

| Fixture or image        | Before  | After   | Expected | Repeat gap | Status |
| ----------------------- | ------- | ------- | -------- | ---------: | ------ |
| `example-64-clean.png`  | `39x39` | `64x64` | `64x64`  |        `0` | `pass` |
| `example-64-detail.png` | `66x66` | `64x64` | `64x64`  |        `0` | `pass` |

After low-palette retention expansion:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Low-palette retention mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------------: |
| Overall            | `0 fail / 21 pass / 5 review` |      `32.2563` |              `0` |                     `0` |                        `1` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |                        `1` |
| Demo examples      | `0 fail / 9 pass / 2 review`  |      `24.2361` |              `0` |                     `0` |                        `1` |
| Synthetic fixtures | `0 fail / 8 pass / 2 review`  |      `34.5952` |              `0` |                     `0` |                        `1` |

Low-palette checks:

| Fixture or image                   | Grid    | Input RGB | Output RGB | Retention | Status |
| ---------------------------------- | ------- | --------: | ---------: | --------: | ------ |
| `indexed-8-color-48x32-scale8.png` | `48x32` |       `8` |        `8` |       `1` | `pass` |
| `example-32-clean.png`             | `32x32` |       `6` |        `6` |       `1` | `pass` |
| `example-64-clean.png`             | `64x64` |       `9` |        `9` |       `1` | `pass` |

After output-coverage criteria expansion:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Output coverage mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------: |
| Overall            | `0 fail / 21 pass / 5 review` |      `32.5966` |              `0` |                     `0` |             `0.9681` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |             `0.9661` |
| Demo examples      | `0 fail / 9 pass / 2 review`  |      `24.3586` |              `0` |                     `0` |             `0.9688` |
| Synthetic fixtures | `0 fail / 8 pass / 2 review`  |      `35.3452` |              `0` |                     `0` |             `0.9683` |

Output-coverage checks:

| Fixture or image                   | Input       | Output      | Coverage | New issue       | Status   |
| ---------------------------------- | ----------- | ----------- | -------: | --------------- | -------- |
| `3.gpt.png`                        | `1024x1024` | `894x894`   |  `0.873` | `output-shrink` | `review` |
| `anisotropic-40x40-to-320x240.png` | `320x240`   | `240x240`   |   `0.75` | `output-shrink` | `review` |
| `gpt-image-2.png`                  | `1448x1097` | `1336x1012` | `0.9227` | none            | `pass`   |

After transparent-padding recovery:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Output coverage mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------: |
| Overall            | `0 fail / 22 pass / 5 review` |      `31.6013` |              `0` |                     `0` |             `0.9693` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |             `0.9661` |
| Demo examples      | `0 fail / 9 pass / 2 review`  |      `24.3586` |              `0` |                     `0` |             `0.9688` |
| Synthetic fixtures | `0 fail / 9 pass / 2 review`  |      `32.6522` |              `0` |                     `0` |             `0.9712` |

Transparent-padding check:

| Fixture                               | Before | After   | Expected | Gap change | Status |
| ------------------------------------- | ------ | ------- | -------- | ---------: | ------ |
| `transparent-border-32x32-scale8.png` | `4x4`  | `32x32` | `32x32`  |  `56 -> 0` | `pass` |

After partial-edge-crop recovery:

| Scope              | Status counts                 | Objective mean | Repeat gap total | Expected-grid gap total | Output coverage mean |
| ------------------ | ----------------------------- | -------------: | ---------------: | ----------------------: | -------------------: |
| Overall            | `0 fail / 22 pass / 6 review` |      `35.2438` |              `0` |                     `0` |             `0.9671` |
| Model examples     | `0 fail / 4 pass / 1 review`  |      `45.2232` |              `0` |                     `0` |             `0.9661` |
| Demo examples      | `0 fail / 9 pass / 2 review`  |      `24.3586` |              `0` |                     `0` |             `0.9688` |
| Synthetic fixtures | `0 fail / 9 pass / 3 review`  |      `41.0639` |              `0` |                     `0` |             `0.9659` |

Partial-edge-crop check:

| Fixture                              | Before  | After   | Expected | Gap change | Status   |
| ------------------------------------ | ------- | ------- | -------- | ---------: | -------- |
| `partial-edge-crop-48x32-scale8.png` | `46x30` | `48x32` | `48x32`  |   `4 -> 0` | `review` |

Final detailed output is written by:

```bash
npm run eval:snap-quality -- --out-dir .tmp/snap-quality-eval-partial-edge-crop
```
