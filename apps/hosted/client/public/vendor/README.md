# Local MapLibre worker

`maplibre-gl-worker-6.16.0.mjs` is the unmodified module worker from the pinned `maplibre-gl@6.16.0` package. Its BSD-3-Clause license is included as `MAPLIBRE-LICENSE.txt`.

Next.js/Turbopack does not preserve MapLibre's package-relative `import.meta.url` worker lookup. The application explicitly points to this same-origin static module before constructing the map. No CDN or external worker service is used.

When upgrading MapLibre, copy the matching package's `dist/maplibre-gl-worker.mjs` and license again, update the versioned filename and the URL in `portfolio-map.tsx`, and run the 3D browser acceptance test. The source worker SHA-256 for this version is `0bf06492bdb7ba3d4132b78e435621bfba60d5250967991c02b1a73affea8cd5`.

Only public third-party code belongs in this folder. Uploaded documents and real portfolio imports must never be copied here.
