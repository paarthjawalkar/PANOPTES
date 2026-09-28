# PANOPTES changes

## v27.0.32 (current BASIC public build)

**Place-label bug after consecutive searches.** When we searched New York and then the Taj Mahal, the camera reached Agra while the on-screen label could continue to say NEW YORK. The reverse-geocode handler had a ten-second spacing guard that returned without scheduling a later lookup. A late response for the earlier camera position could also replace the new label. We now clear the old label when a new search flight starts, ignore reverse responses from an earlier flight, and schedule the next lookup after the remaining spacing time instead of dropping it. Repeated camera-move notifications can reuse a resolved place name without starting another request. On INSIDER we checked New York City to Taj Mahal in the browser: the old label cleared and the Taj aerial resolved to AGRA; a deterministic quick-flight test also covered a late old response and a duplicate camera-stop notification.

**Desktop credit rail.** We moved the existing Cesium credit rail a few pixels in from the left and bottom edges and restored full opacity while keeping its existing 80% scale. The Cesium ion logo and the data-attribution link remain visible and clickable on the main desktop view; the mobile credit rail is unchanged. We did not move the Cesium ion logo to About because a mobile browser's treatment under the mobile-app exception is unclear, and third-party imagery credits must remain accessible.

No ARGUS mode, live aircraft feed, new landmark model or unrelated diagnostic has been added in this build.

## v27.0.27b (previous BASIC public build)
Remove detached ISS geometry and its animation tracks. Verified simplified ISS model and globe boot on mobile-sized browser. Flights paused, ships not present, Tiangong paused pending verified orbit data.

## v26-preview (tested preview, not production)
Keep the boot screen until the first imagery tile has loaded. The ISS model still showed a detached gray artifact in Follow.

## v25-preview (diagnostic, not production)
Shorten the boot fallback from 8 seconds to 2.4 seconds. On testing, this could reveal bare starfield before imagery, so it was not promoted.

## v24-preview (diagnostic, not production)
Show coarser globe imagery sooner and defer OSM Buildings until the first globe tiles settle, with a 6.5-second fallback. Boot could still wait too long.

## v23
Add plain double-tap zoom toward the touch, shorter haptic ticks, and warmer OSM building shading for phone testing.

## v22
Add speed-based haptic detents and lower Auto resolution at high FPS targets for a performance test.

## v21
Keep the FPS counter visible after return; add double-tap-hold drag zoom and far-zoom 3D flatten/restore for phone testing.

## v20
Remove a voluntary inspiration credit while keeping required provider attribution.

## v19
Add a switchable counter for measured rendered frames.

## v18
Offer 30, 60, 90, and 120 FPS targets; actual frame rate depends on device load.

## v17
Make the control housings clearer while keeping the moving lens frosted.

## v16
Sharpen globe imagery by tightening tile refinement and render resolution.

## v15
Reduce close-up atmosphere washout and refine mobile visual assets.

## v14
Reverse twist direction for Android retest and simplify the compass needle.

## v13
Add browser Back view history, eye-home behavior, and fuller information screens.

## v12
Add mobile quality settings and a two-finger camera twist.

## v11
Add a guarded flight-layer interface; keep it paused until live aircraft data works.

## v10
Refine PANOPTES assets and publish the current production baseline.

## v9
Load CesiumJS from its CDN instead of bundling the library.

## v8
Keep pinch as zoom rather than tilt; add a compass and remove old service workers.

## v7
Organize controls into a compact menu and show 2D/3D controls near city zoom.

## v6
Tune atmosphere, water, and horizon appearance.

## v5
Add 2D/3D view-angle controls on the same globe.

## v4
Hide impossible building-height outliers and color buildings by reported material.

## v3
Improve place search and camera flights toward selected results.

## v2
Add satellite imagery, terrain, OSM buildings, and area labels.

## v1
Start a mobile Earth explorer with a Cesium globe, search, and PANOPTES branding.
