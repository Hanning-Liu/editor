# Label Studio customization reuse

The topology checks, stable ring-area calculation and machine-precision fragment policy in `packages/core/src/lib/functional-zone-geometry.ts` are adapted from Hanning-Liu/label-studio, `hanning/frontend/domain/occupancy/geometry.js`. That source repository carries the accompanying Apache-2.0 LICENSE and NOTICE, preserved here. The rest of Pascal retains its existing license.

The seven cases in `packages/core/src/lib/__fixtures__/label-studio-zone-cases.json` originate from `examples/occupancy-v1/geometry-cases.json`. Their expected output geometry/area was computed by the existing customization's `difference` and `area` functions before porting the tests. Source commit, per-file hashes and dirty status are recorded in the local-integration acceptance evidence.

Adaptations: image percentages become level-local metres; the original parent/void/concavity checks are applied to functional zones; one logical zone retains all disjoint components and native holes. The old earcut decomposition used for Label Studio result storage is not copied. 3D display uses Three.js's native shape triangulation, with a render-area acceptance assertion.
