/* PANOPTES Earth explorer. */
Cesium.Ion.defaultAccessToken = "REPLACE_WITH_YOUR_CESIUM_ION_TOKEN";

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
  infoBox: false, selectionIndicator: false,
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1420');
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.globe.enableLighting = true;
// Gentle blue limb and horizon haze. Keep Cesium's native sky/ground scattering,
// rather than overlaying a screen-space halo that would drift as the camera moves.
viewer.scene.skyAtmosphere.show = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.24;
viewer.scene.skyAtmosphere.saturationShift = 0.18;
viewer.scene.skyAtmosphere.atmosphereLightIntensity = 60;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.globe.atmosphereBrightnessShift = 0.12;
viewer.scene.globe.atmosphereSaturationShift = 0.06;
viewer.scene.fog.enabled = true;
viewer.scene.fog.density = 0.00018;
viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
viewer.scene.fxaa = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(0, 25, 22000000) });

(async () => {
  try {
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(await Cesium.IonImageryProvider.fromAssetId(2)); // Bing aerial, no burned-in labels
  } catch (e) { console.warn('imagery fallback', e); }
  try {
    viewer.scene.setTerrain(new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromIonAssetId(1)));
  } catch (e) { console.warn('terrain unavailable', e); }
  try {
    const osm = await Cesium.createOsmBuildingsAsync();
    osm.style = new Cesium.Cesium3DTileStyle({
      // OSM height data occasionally contains impossible values. Hide these outliers,
      // without deforming valid landmark geometry such as the 330m Eiffel Tower.
      show: "${feature['cesium#estimatedHeight']} === null || (${feature['cesium#estimatedHeight']} >= 0 && ${feature['cesium#estimatedHeight']} < 900)",
      color: { conditions: [
        ["${feature['building:material']} === 'glass'", "color('#b9d2db', 0.76)"],
        ["${feature['building:material']} === 'brick'", "color('#ad8274', 0.88)"],
        ["${feature['building:material']} === 'concrete'", "color('#c5c4bd', 0.9)"],
        ["${feature['building:material']} === 'stone'", "color('#c9bca7', 0.92)"],
        ["true", "color('#d3d5d2', 0.84)"],
      ]},
    });
    viewer.scene.primitives.add(osm); window.osmBuildings = osm; syncViewControl();
  } catch (e) { console.warn('buildings unavailable', e); }
})();

function flyTo(lat, lon) {
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
  const sphere = new Cesium.BoundingSphere(target, 150);
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-46), 1800),
    duration: 3.2,
  });
}

/* ---- Search: Wikipedia/Wikidata fame ranking + Nominatim fallback ---- */
const q = document.getElementById('q');
const sug = document.getElementById('suggest');
const cache = new Map();
let lastCall = 0, debounce = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wikiSearch(term) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=6&format=json&origin=*&srsearch=' + encodeURIComponent(term);
  const j = await (await fetch(u)).json();
  const titles = (j.query?.search || []).map(x => x.title);
  if (!titles.length) return [];
  const meta = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=coordinates|pageprops&colimit=6&titles=' + encodeURIComponent(titles.join('|')))).json();
  const pages = Object.values(meta.query?.pages || {});
  const wdIds = pages.map(p => p.pageprops?.wikibase_item).filter(Boolean);
  let fame = {};
  if (wdIds.length) {
    try {
      const wdj = await (await fetch('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=sitelinks&ids=' + wdIds.join('|'))).json();
      for (const [id, e] of Object.entries(wdj.entities || {})) fame[id] = Object.keys(e.sitelinks || {}).length;
    } catch {}
  }
  return pages.filter(p => p.coordinates?.length).map(p => ({
    name: p.title,
    lat: p.coordinates[0].lat, lon: p.coordinates[0].lon,
    fame: fame[p.pageprops?.wikibase_item] || 0, src: 'Wikipedia',
  })).sort((a, b) => b.fame - a.fame);
}
async function nominatim(term) {
  const now = Date.now();
  if (now - lastCall < 1100) await sleep(1100 - (now - lastCall));
  lastCall = Date.now();
  const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=' + encodeURIComponent(term);
  const j = await (await fetch(u, { headers: { Accept: 'application/json' } })).json();
  return (j || []).map(x => ({
    name: x.display_name.split(',').slice(0, 2).join(','),
    lat: +x.lat, lon: +x.lon,
    fame: ({ country: 6, state: 5, city: 4, town: 3, village: 2 })[x.addresstype] || 1,
    src: 'OSM',
  }));
}
async function search(term) {
  if (cache.has(term)) return cache.get(term);
  let out = [];
  try { out = await wikiSearch(term); } catch {}
  if (!out.length) { try { out = await nominatim(term); } catch {} }
  cache.set(term, out);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return out;
}
function render(list) {
  sug.innerHTML = '';
  if (!list.length) { sug.classList.remove('open'); return; }
  for (const r of list.slice(0, 6)) {
    const b = document.createElement('button');
    b.innerHTML = '<span></span><small></small>';
    b.querySelector('span').textContent = r.name;
    b.querySelector('small').textContent = r.src;
    b.onclick = () => { sug.classList.remove('open'); q.value = r.name; flyTo(r.lat, r.lon); };
    sug.appendChild(b);
  }
  sug.classList.add('open');
}
q.addEventListener('input', () => {
  clearTimeout(debounce);
  const t = q.value.trim();
  if (t.length < 3) { sug.classList.remove('open'); return; }
  debounce = setTimeout(async () => render(await search(t)), 350);
});
q.addEventListener('keydown', async e => {
  if (e.key === 'Enter') {
    const t = q.value.trim(); if (!t) return;
    const list = await search(t);
    if (list.length) { sug.classList.remove('open'); flyTo(list[0].lat, list[0].lon); }
  }
});
document.addEventListener('click', e => { if (!sug.contains(e.target) && e.target !== q) sug.classList.remove('open'); });

/* ---- Voice: auto-select top result and fly ---- */
const mic = document.getElementById('mic');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) mic.style.display = 'none';
else mic.onclick = () => {
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  mic.classList.add('listening');
  rec.onresult = async e => {
    const t = e.results[0][0].transcript;
    q.value = t;
    const list = await search(t);
    if (list.length) flyTo(list[0].lat, list[0].lon); else render(list);
  };
  rec.onend = () => mic.classList.remove('listening');
  rec.onerror = () => mic.classList.remove('listening');
  rec.start();
};

/* ---- boot + info ---- */
window.addEventListener('load', () => setTimeout(() => document.getElementById('boot').classList.add('gone'), 2400));
const optionsBtn = document.getElementById('options-btn'), optionsMenu = document.getElementById('options-menu');
optionsBtn.onclick = () => { const open = optionsMenu.classList.toggle('hidden'); optionsBtn.setAttribute('aria-expanded', String(!open)); };
document.getElementById('about-option').onclick = () => { optionsMenu.classList.add('hidden'); optionsBtn.setAttribute('aria-expanded', 'false'); document.getElementById('info').classList.remove('hidden'); };
document.getElementById('info-close').onclick = () => document.getElementById('info').classList.add('hidden');

/* Explicit, sharp on-screen labels: only resolved city/area names. Never label waterways from broad ocean classes. */
const placeLabel = document.getElementById('place-label');
let placeTimer, lastPlaceKey = '', lastPlaceAt = 0;
viewer.camera.moveEnd.addEventListener(() => {
  clearTimeout(placeTimer);
  placeTimer = setTimeout(async () => {
    const pos = viewer.camera.positionCartographic;
    if (!pos || pos.height > 850000 || Date.now() - lastPlaceAt < 10000) { if (pos?.height > 850000) placeLabel.textContent = ''; return; }
    const pick = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2));
    if (!pick) return;
    const c = Cesium.Cartographic.fromCartesian(pick);
    const lat = Cesium.Math.toDegrees(c.latitude), lon = Cesium.Math.toDegrees(c.longitude);
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (key === lastPlaceKey) return;
    lastPlaceKey = key; lastPlaceAt = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
      const j = await r.json();
      const a = j.address || {};
      const n = a.city || a.town || a.village || a.municipality || a.county || '';
      placeLabel.textContent = n || '';
    } catch { placeLabel.textContent = ''; }
  }, 2200);
});

/* 2D and 3D are camera/building modes on the same round Earth, not projection modes.
   Offer the control only once city detail is close enough to show buildings. */
const layerBtns = [...document.querySelectorAll('[data-layer]')];
const layers = document.getElementById('layers');
const BUILDING_VIEW_HEIGHT = 400000;
let selectedView = '2d';
function syncViewControl() {
  const near = viewer.scene.mode === Cesium.SceneMode.SCENE3D && viewer.camera.positionCartographic.height < BUILDING_VIEW_HEIGHT;
  layers.classList.toggle('hidden', !near);
  if (window.osmBuildings) window.osmBuildings.show = near && selectedView === '3d';
}
function selectLayer(btn, initial = false) {
  if (!btn) return;
  selectedView = btn.dataset.layer;
  layerBtns.forEach(b => { b.classList.toggle('selected', b === btn); b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
  const track = document.getElementById('layer-highlight');
  const a = btn.getBoundingClientRect(), p = layers.getBoundingClientRect();
  track.style.height = `${a.height}px`; track.style.width = `${a.width}px`;
  track.style.transform = `translateY(${a.top-p.top}px)`;
  syncViewControl();
  if (!initial) {
    const wash = document.getElementById('scene-wash');
    wash.classList.remove('switching'); void wash.offsetWidth; wash.classList.add('switching');
    setTimeout(() => wash.classList.remove('switching'), 600);
    const xy = new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
    const hit = viewer.camera.pickEllipsoid(xy);
    if (hit) {
      const c = Cesium.Cartographic.fromCartesian(hit), lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      const height = Math.max(500, viewer.camera.positionCartographic.height);
      if (selectedView === '2d') viewer.camera.flyTo({destination: Cesium.Cartesian3.fromDegrees(lon, lat, height), orientation: {heading: viewer.camera.heading, pitch: Cesium.Math.toRadians(-89), roll: 0}, duration: .85});
      else viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 1), {offset: new Cesium.HeadingPitchRange(viewer.camera.heading, Cesium.Math.toRadians(-54), Math.max(500, height)), duration: .85});
    }
  }
}
layerBtns.forEach(b => b.onclick = () => selectLayer(b));
viewer.camera.changed.addEventListener(syncViewControl);
viewer.camera.moveEnd.addEventListener(syncViewControl);
requestAnimationFrame(() => selectLayer(layerBtns.find(b => b.dataset.layer === '2d'), true));
window.addEventListener('resize', () => selectLayer(document.querySelector('[data-layer].selected') || layerBtns[0], true));
