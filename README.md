# PANOPTES

An original mobile-browser Earth explorer by Paarth Jawalkar. PANOPTES uses CesiumJS, Cesium ion terrain and Bing aerial imagery, with Wikipedia/Wikidata and OpenStreetMap-based search.

## Status

The `main` branch records numbered development snapshots. v10 is the current production build; v11-v23 are previews and need Android testing. Live flights are paused. Photorealistic 3D landmark data is not enabled while a safe free-tier cutoff is unresolved. Extreme polar imagery gaps and device performance remain under investigation. Do not use this app for navigation.

The history was recreated from saved release archives. Credential strings in all revisions were replaced with placeholders. Bundled Cesium library files were removed in favor of CDN links. To run locally, replace `REPLACE_WITH_YOUR_CESIUM_ION_TOKEN` in `app.js` with your own token outside a public commit, then serve the directory from a static web server. Do not commit credential-bearing copies or archives. External data-provider terms apply.

## Feedback

Ideas and bug reports are welcome through GitHub Issues. Please include your device, browser, steps to reproduce, and a screenshot when useful. Paarth will review suggestions. Public replies require his approval.

## Data and library credits

- [CesiumJS](https://cesium.com/learn/cesiumjs/) for the globe renderer; Cesium ion for terrain, imagery delivery and OSM Buildings. CesiumJS is Apache-2.0 licensed; datasets have separate terms.
- [Bing Maps](https://www.microsoft.com/en-us/maps/bing-maps/product) aerial imagery through Cesium ion.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors and [Nominatim](https://nominatim.org/) for geographic data and search.
- [Wikipedia](https://www.wikipedia.org/) and [Wikidata](https://www.wikidata.org/) for landmark search.
- [Nasalization](https://www.typodermicfonts.com/nasalization/) by Typodermic Fonts for the supplied static wordmark image. Rights to the image/font are not granted by this repository.

No broad open-source license is granted to this repository or the supplied wordmark. Dataset and library terms remain with their respective owners.
