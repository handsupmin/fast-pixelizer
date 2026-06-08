# Snap Quality Eval: Model and Demo Fixtures

## Goal

Build an objective loop for model-generated "pixel art" and package demo images, then accept only snap changes that do not downgrade the measured result.

## Dataset

| Group              | Path                                                        | Count |
| ------------------ | ----------------------------------------------------------- | ----: |
| Model examples     | `/Users/sangmin/sources/mono-pix/src/assets/examples`       |     5 |
| Demo examples      | `examples/`                                                 |    11 |
| Synthetic fixtures | generated under `.tmp/snap-quality-eval-*/synthetic-source` |     5 |

The model examples use the prompt `탑뷰 도트 중세 판타지 용사 파티의 모험 픽셀아트 그려줘`.

## Criteria

| Criterion           | Fail or review condition                                          | Why it matters                                                      |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Aspect preservation | grid aspect differs from source by more than `0.03`               | Detects rectangular cells or crop-ratio drift                       |
| Ground truth        | synthetic expected-grid gap exceeds `0`                           | Prevents regressions on known-grid fixtures                         |
| Micro-grid snap     | short axis exceeds `256` cells or source cell size is below `3px` | Catches snapping to generated texture/noise                         |
| Macro-grid snap     | source cell size exceeds `64px`                                   | Flags under-detection where a large region is mistaken for one cell |
| Idempotence         | re-snapping the snapped output changes cols+rows beyond tolerance | True snap output should be stable                                   |
| Deep stability      | a second re-snap of the original-size snapped output changes grid | Catches repeat-only fixes that fail one pass later                  |
| Determinism         | two snaps of the same source disagree on grid size                | Catches non-deterministic detection                                 |
| Output purity       | snapped output cells are not single-color or square               | Verifies the core promise of snap output                            |
| Boundary evidence   | inferred boundaries are weaker than `0.6x` average axis gradient  | Flags weak or hallucinated grids                                    |
| Source disorder     | intra-cell MAE exceeds `18`                                       | Flags painterly/noisy cells inside the inferred grid                |
| Preservation        | nearest-resized snap MAE exceeds `38` or p95 exceeds `86`         | Guards against losing too much source feel                          |
| Contrast            | snapped contrast ratio falls outside `0.45-1.8`                   | Flags washed-out or over-amplified output                           |

## Accepted Changes

1. Added a high-resolution plausibility guard so periodicity detection does not choose 1-2px texture lags on generated images.
2. Clamped final generated-image grids to a plausible short-axis cell count while preserving the source aspect ratio.
3. Added a uniform-cell fast path that detects already-snapped cell blocks from exact run lengths, restoring idempotence on repeat snaps.
4. Split snap internals into focused modules: quantization, profiles, uniform-grid detection, and cell resampling.
5. Added `npm run eval:snap-quality` to evaluate both model and demo fixtures.
6. Added synthetic known-grid fixtures for nearest scaling, blurred scaling, sparse same-color areas, rectangular grids, and transparency.
7. Changed uniform-cell run-length selection to prefer the shared base unit, fixing sparse same-color repeat stability.
8. Added a gated peak-spacing recovery path for clearly under-detected blurred scaled pixel art.

## Rejected Experiments

| Experiment                                              | Result                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Peak-spacing estimate mixed with raw/quantized profiles | Improved one Midjourney case but increased model objective and repeat gap overall, so it was discarded.                                                         |
| Smallest strong autocorrelation lag                     | Fixed some snap-after repeats but broke `example-32-clean` and worsened aggregate objective, so it was discarded.                                               |
| Unrestricted uniform-grid fast path                     | Reduced repeat gap but over-detected several demo/model inputs as `256x256`, so it was narrowed to cells larger than the high-res plausible minimum.            |
| Ungated peak-spacing recovery                           | Helped blurred synthetic input but previously caused model/demo regressions, so the accepted version only runs when the current grid is clearly under-detected. |

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

Final detailed output is written by:

```bash
npm run eval:snap-quality -- --out-dir .tmp/snap-quality-eval-final-expanded
```
