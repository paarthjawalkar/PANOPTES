/* PANOPTES - Earth explorer optimized for mobile. Original implementation. */
// The current app has no service worker. Remove a registration from an older build, if any.
if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
Cesium.Ion.defaultAccessToken = "REPLACE_WITH_YOUR_CESIUM_ION_TOKEN";

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  baseLayer: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
  infoBox: false, selectionIndicator: false,
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1420');
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.showWaterEffect = true;
viewer.scene.globe.oceanNormalMapUrl = Cesium.buildModuleUrl("Assets/Textures/waterNormalsSmall.jpg");
// Gentle blue limb and horizon haze. Keep Cesium's native sky/ground scattering,
// rather than overlaying a screen-space halo that would drift as the camera moves.
viewer.scene.skyAtmosphere.show = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.24;
viewer.scene.skyAtmosphere.saturationShift = 0.18;
viewer.scene.skyAtmosphere.atmosphereLightIntensity = 12;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.globe.atmosphereBrightnessShift = 0.12;
viewer.scene.globe.atmosphereSaturationShift = 0.06;
viewer.scene.fog.enabled = true;
viewer.scene.fog.density = 0.00005;
viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
viewer.scene.fxaa = true;
viewer.scene.postProcessStages.fxaa.enabled = true;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
// A two-finger pinch is exclusively zoom; Cesium's default also maps it to tilt,
// which can make an intended zoom-out spin/drag the globe at oblique angles.
viewer.scene.screenSpaceCameraController.tiltEventTypes = [Cesium.CameraEventType.MIDDLE_DRAG, {eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL}];
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

function cameraState(){const c=viewer.camera.positionCartographic;return {lon:Cesium.Math.toDegrees(c.longitude),lat:Cesium.Math.toDegrees(c.latitude),height:c.height,heading:viewer.camera.heading,pitch:viewer.camera.pitch,roll:viewer.camera.roll}}
function saveView(destination){try{history.replaceState({panoptesView:cameraState()},'',location.href);history.pushState({panoptesView:destination},'',location.href)}catch{}}
window.addEventListener('popstate',e=>{if(sessionStorage.getItem('panoptes-hard-home')==='1'){history.replaceState({panoptesHardHome:true,panoptesView:{lon:0,lat:25,height:22000000,heading:0,pitch:-Math.PI/2,roll:0}},'',location.pathname);return}const v=e.state?.panoptesView;if(!v)return;viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(v.lon,v.lat,v.height),orientation:{heading:v.heading,pitch:v.pitch,roll:v.roll},duration:1.1})});
function flyTo(lat, lon) {
  try{sessionStorage.removeItem('panoptes-hard-home')}catch{}
  saveView({lon,lat,height:1800,heading:0,pitch:Cesium.Math.toRadians(-46),roll:0});
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
  const sphere = new Cesium.BoundingSphere(target, 150);
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-46), 1800),
    duration: 3.2,
    complete:()=>{try{history.replaceState({panoptesView:cameraState()},'',location.href)}catch{}},
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
const compass = document.getElementById('compass');
function syncCompass() {
  const h=((Cesium.Math.toDegrees(viewer.camera.heading)%360)+360)%360;
  const compassDirection=['N','NE','E','SE','S','SW','W','NW'][Math.round(h/45)%8];
  document.getElementById('compass-needle').style.transform = `rotate(${-h}deg)`;
  compass.setAttribute('aria-label',`Heading ${compassDirection}; tap to face north`);
}
viewer.camera.changed.addEventListener(syncCompass);
compass.onclick = () => viewer.camera.flyTo({destination: viewer.camera.position, orientation: {heading: 0, pitch: viewer.camera.pitch, roll: 0}, duration: .7});
syncCompass();
optionsBtn.onclick = () => { const open = optionsMenu.classList.toggle('hidden'); optionsBtn.setAttribute('aria-expanded', String(!open)); };
document.getElementById('flight-status').onclick = () => { optionsMenu.classList.remove('hidden'); optionsBtn.setAttribute('aria-expanded', 'true'); };
for(const name of ['about','help','faq','contact','support']){
  const id=name==='about'?'info':name;
  document.getElementById(name+'-option').onclick=()=>{optionsMenu.classList.add('hidden');optionsBtn.setAttribute('aria-expanded','false');document.getElementById(id).classList.remove('hidden')};
}
for(const b of document.querySelectorAll('.aux-close'))b.onclick=()=>b.closest('[role=dialog]').classList.add('hidden');
document.getElementById('info-close').onclick = () => document.getElementById('info').classList.add('hidden');

/* Explicit, sharp on-screen labels: only resolved city/area names. Never label waterways from broad ocean classes. */
const placeLabel = document.getElementById('place-label');
let placeTimer, lastPlaceKey = '', lastPlaceAt = 0, lastLabelName = '';
function showPlaceName(name) {
  if (name === lastLabelName) return;
  lastLabelName = name;
  placeLabel.textContent = name ? name.toLocaleUpperCase() : '';
  placeLabel.dataset.text = placeLabel.textContent;
  placeLabel.classList.remove('glitch-in');
  void placeLabel.offsetWidth;
  if (name) placeLabel.classList.add('glitch-in');
}
viewer.camera.moveEnd.addEventListener(() => {
  clearTimeout(placeTimer);
  placeTimer = setTimeout(async () => {
    const pos = viewer.camera.positionCartographic;
    if (!pos || pos.height > 850000 || Date.now() - lastPlaceAt < 10000) { if (pos?.height > 850000) showPlaceName(''); return; }
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
      const n = pos.height < 5000
        ? (a.neighbourhood || a.suburb || a.city_district || a.city || a.town || a.village || a.municipality || a.county || '')
        : (a.city || a.town || a.village || a.municipality || a.county || a.state || '');
      showPlaceName(n);
    } catch { showPlaceName(''); }
  }, 2200);
});

/* 2D and 3D are camera/building modes on the same round Earth, not projection modes.
   Offer the control only once city detail is close enough to show buildings. */
const layerBtns = [...document.querySelectorAll('[data-layer]')];
const layers = document.getElementById('layers');
const BUILDING_VIEW_HEIGHT = 400000;
let selectedView = '2d';
// 2D/3D buttons express the user's preference, not a Cesium scene-mode morph.
// At wide zoom, flatten the camera angle; restore the preferred 3D pitch on
// close zoom. The two thresholds prevent bouncing around the boundary.
let autoFlat3d=false,autoViewBusy=false,autoViewTimer=0;
function syncFar3dView(){
  if(selectedView!=='3d'||autoViewBusy)return;
  const h=viewer.camera.positionCartographic?.height;
  if(!Number.isFinite(h))return;
  const flatten=!autoFlat3d&&h>1100000,restore=autoFlat3d&&h<720000;
  if(!flatten&&!restore)return;
  autoFlat3d=flatten;
  autoViewBusy=true;
  const xy=new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2);
  const hit=viewer.camera.pickEllipsoid(xy);
  const c=hit&&Cesium.Cartographic.fromCartesian(hit);
  const destination=c?Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,Math.max(500,h)):viewer.camera.position;
  viewer.camera.flyTo({destination,orientation:{heading:viewer.camera.heading,pitch:flatten?Cesium.Math.toRadians(-89):Cesium.Math.toRadians(-54),roll:0},duration:.65,
    complete:()=>{autoViewBusy=false},cancel:()=>{autoViewBusy=false}});
  clearTimeout(autoViewTimer);autoViewTimer=setTimeout(()=>{autoViewBusy=false},950);
}
function syncViewControl() {
  const near = viewer.scene.mode === Cesium.SceneMode.SCENE3D && viewer.camera.positionCartographic.height < BUILDING_VIEW_HEIGHT;
  const wasHidden = layers.classList.contains('hidden');
  layers.classList.toggle('hidden', !near);
  if (near && wasHidden) requestAnimationFrame(() => {
    const b = document.querySelector('[data-layer].selected'), a = b.getBoundingClientRect(), p = layers.getBoundingClientRect(), track = document.getElementById('layer-highlight');
    track.style.width = `${a.width}px`; track.style.height = `${a.height}px`; track.style.transform = `translateY(${a.top-p.top}px)`;
  });
  if (window.osmBuildings) window.osmBuildings.show = near && selectedView === '3d';
}
function selectLayer(btn, initial = false) {
  if (!btn) return;
  selectedView = btn.dataset.layer;
  autoFlat3d=false;
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
viewer.camera.changed.addEventListener(()=>{syncViewControl();syncFar3dView()});
viewer.camera.moveEnd.addEventListener(()=>{syncViewControl();syncFar3dView()});
requestAnimationFrame(() => selectLayer(layerBtns.find(b => b.dataset.layer === '2d'), true));
window.addEventListener('resize', () => selectLayer(document.querySelector('[data-layer].selected') || layerBtns[0], true));

/* Real-time flight layer (only enabled when guarded proxy returns live aircraft).
   Trajectory is a short heading projection, not an observed route history. */
const FLIGHT_API='https://gods-view-api.paarthjawalkar.workers.dev/flights';
const aircraft=new Map();
const flightStatus=document.getElementById('flight-status');
const flightOption=document.getElementById('flight-option');
const flightCard=document.getElementById('flight-card');
const flightDetail=document.getElementById('flight-detail');
document.getElementById('flight-close').onclick=()=>flightCard.classList.add('hidden');
const flightIcons=new Cesium.PinBuilder();
const iconCanvas=flightIcons.fromText('✈',Cesium.Color.WHITE,40).toDataURL();
let lastFlightFetch=0, flightsPaused=true, flightLoading=false;
function setFlightState(text,active=false){
  flightsPaused=!active;
  flightStatus.textContent=text;
  flightStatus.setAttribute('aria-label',active?'Live flights available':text);
  flightOption.textContent=text;
  flightOption.disabled=!active;
}
function clearAircraft(){for(const a of aircraft.values()){viewer.entities.remove(a.dot);viewer.entities.remove(a.path)}aircraft.clear()}
function aircraftName(a){return a.flight||a.registration||a.hex||'Aircraft'}
function showAircraft(a){
  flightDetail.replaceChildren();
  const h=document.createElement('strong');h.textContent=aircraftName(a);
  const p=document.createElement('div');p.textContent=[a.type?'Type '+a.type:'Type unknown',Number.isFinite(a.alt_baro)?Math.round(a.alt_baro).toLocaleString()+' ft':'Altitude unknown',a.gs?Math.round(a.gs)+' kt':'Speed unavailable'].join(' · ');
  const c=document.createElement('small');c.textContent='Live reported position from ADSB.lol. Destination, origin and actual past trajectory unavailable from this feed.';
  flightDetail.append(h,p,c);flightCard.classList.remove('hidden');
}
function updateAircraft(list){
  const now=new Set();
  for(const a of list.slice(0,250)){
    if(!a.hex||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||a.lat>90||a.lat<-90||a.lon>180||a.lon<-180) continue;
    now.add(a.hex);
    let item=aircraft.get(a.hex);
    const deg=Cesium.Math.toRadians(Number(a.track)||0), km=Math.min(28,Math.max(5,(Number(a.gs)||200)*.04));
    const lat2=a.lat-Math.cos(deg)*km/111.32;
    const lon2=a.lon-Math.sin(deg)*km/(111.32*Math.max(.12,Math.cos(Cesium.Math.toRadians(a.lat))));
    const altitude=Math.max(1500,Math.min(15000,(Number(a.alt_baro)||0)*.3048));
    const pos=Cesium.Cartesian3.fromDegrees(a.lon,a.lat,altitude);
    if(item){item.a=a;item.dot.position=pos;item.path.polyline.positions=[Cesium.Cartesian3.fromDegrees(lon2,lat2,altitude),pos];continue}
    const path=viewer.entities.add({polyline:{positions:[Cesium.Cartesian3.fromDegrees(lon2,lat2,altitude),pos],width:1,material:Cesium.Color.WHITE.withAlpha(.32),show:true}});
    const dot=viewer.entities.add({position:pos,billboard:{image:iconCanvas,width:25,height:25,rotation:-deg,verticalOrigin:Cesium.VerticalOrigin.CENTER,disableDepthTestDistance:6000,scaleByDistance:new Cesium.NearFarScalar(40000,1,800000,.4)},properties:{aircraftHex:a.hex}});
    aircraft.set(a.hex,{a,dot,path});
  }
  for(const [hex,item] of aircraft)if(!now.has(hex)){viewer.entities.remove(item.dot);viewer.entities.remove(item.path);aircraft.delete(hex)}
}
viewer.screenSpaceEventHandler.setInputAction(m=>{
  const hit=viewer.scene.pick(m.position);const hex=hit?.id?.properties?.aircraftHex?.getValue();
  if(hex&&aircraft.has(hex))showAircraft(aircraft.get(hex).a);
},Cesium.ScreenSpaceEventType.LEFT_CLICK);
async function refreshAircraft(){
  if(flightLoading||document.visibilityState!=='visible'||viewer.camera.positionCartographic.height>650000) return;
  const t=Date.now();if(t-lastFlightFetch<60000)return;
  const xy=new Cesium.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2);
  const hit=viewer.camera.pickEllipsoid(xy);if(!hit)return;
  const p=Cesium.Cartographic.fromCartesian(hit);lastFlightFetch=t;flightLoading=true;
  const u=`${FLIGHT_API}?lat=${Cesium.Math.toDegrees(p.latitude).toFixed(4)}&lon=${Cesium.Math.toDegrees(p.longitude).toFixed(4)}`;
  try{
    const response=await fetch(u,{signal:AbortSignal.timeout(11000),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error(`Feed ${response.status}`);
    const data=await response.json();if(!Array.isArray(data.ac)||data.source!=='adsb.lol')throw Error('Invalid feed');
    updateAircraft(data.ac);setFlightState(data.ac.length?`${aircraft.size} live flights`:'No nearby flights',true);
  }catch(e){clearAircraft();setFlightState('Flights paused');lastFlightFetch=t+60000}
  finally{flightLoading=false}
}
viewer.camera.moveEnd.addEventListener(refreshAircraft);
setInterval(refreshAircraft,60000);
setFlightState('Flights paused');

/* Small phone interactions without changing Cesium's camera tilt/pinch mapping. */
const brand=document.getElementById('brand');
let homeTimer=0,hardHomeFired=false;
function goHome(hard=false){
  if(!hard)saveView({lon:0,lat:25,height:22000000,heading:0,pitch:-Math.PI/2,roll:0});
  q.value='';sug.classList.remove('open');q.blur();flightCard.classList.add('hidden');showPlaceName('');
  if(hard){clearAircraft();try{sessionStorage.setItem('panoptes-hard-home','1');history.replaceState({panoptesHardHome:true,panoptesView:{lon:0,lat:25,height:22000000,heading:0,pitch:-Math.PI/2,roll:0}},'',location.pathname)}catch{}}
  viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(0,25,22000000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-90),roll:0},duration:2});
}
brand.onclick=()=>{if(hardHomeFired){hardHomeFired=false;return}goHome(false)};
brand.addEventListener('pointerdown',e=>{hardHomeFired=false;homeTimer=setTimeout(()=>{hardHomeFired=true;goHome(true)},850)});
for(const ev of ['pointerup','pointerleave','pointercancel'])brand.addEventListener(ev,()=>clearTimeout(homeTimer));
brand.addEventListener('contextmenu',e=>e.preventDefault());
document.getElementById('brand').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.click()}};
q.addEventListener('keydown',e=>{if(e.key==='Enter')q.blur()});

/* Adaptive quality: conservative on slow networks and small devices; user may override. */
const qualitySelect=document.getElementById('quality');
const settings=document.getElementById('settings');
document.getElementById('settings-option').onclick=()=>{optionsMenu.classList.add('hidden');settings.classList.remove('hidden')};
document.getElementById('settings-close').onclick=()=>settings.classList.add('hidden');
let savedQuality='auto';try{savedQuality=localStorage.getItem('panoptes-quality')||'auto'}catch{}
if(['auto','low','medium','high'].includes(savedQuality))qualitySelect.value=savedQuality;
// Globe SSE governs terrain AND imagery refinement. v15's 10-16px budget
// left satellite imagery visibly blocky; Cesium's stock globe budget is 2px.
// Keep building-tile budget separate: it has different default/detail costs.
const qualityScores={low:{scale:1.25,globeSse:2.5,buildingSse:16,tiles:300},medium:{scale:1.75,globeSse:1.7,buildingSse:12,tiles:500},high:{scale:2,globeSse:1.3,buildingSse:8,tiles:900}};
function autoQuality(){
  const c=navigator.connection||{};
  // Low data mode or severely constrained memory merits Low. Four CPU cores,
  // a 3G reading, or a slow connection must not permanently blur the globe.
  if(c.saveData||['slow-2g','2g'].includes(c.effectiveType)||(navigator.deviceMemory&&navigator.deviceMemory<=2))return 'low';
  return navigator.deviceMemory>=8&&navigator.hardwareConcurrency>=8&&(!c.downlink||c.downlink>=8)?'high':'medium';
}
function applyQuality(){
  const name=qualitySelect.value==='auto'?autoQuality():qualitySelect.value,p=qualityScores[name];
  viewer.resolutionScale=Math.min(window.devicePixelRatio||1,p.scale);
  viewer.scene.globe.maximumScreenSpaceError=p.globeSse;
  viewer.scene.fog.enabled=name!=='low'&&viewer.camera.positionCartographic.height>120000;
  // Android fragment precision can wash out ground atmosphere at close range.
  viewer.scene.globe.showGroundAtmosphere=viewer.camera.positionCartographic.height>350000;
  viewer.scene.globe.showWaterEffect=name==='high'||(name==='medium'&&viewer.camera.positionCartographic.height<100000);
  if(window.osmBuildings){window.osmBuildings.maximumScreenSpaceError=p.buildingSse;window.osmBuildings.maximumMemoryUsage=p.tiles}
  viewer.scene.requestRender();
}
// Cesium's render loop may skip frames in request-render mode. Let camera moves
// use the regular animation loop; the chosen target is a cap, not a promise.
const frameRateSelect=document.getElementById('frame-rate');
let savedFrameRate='60';try{savedFrameRate=localStorage.getItem('panoptes-frame-rate')||'60'}catch{}
if(['30','60','90','120'].includes(savedFrameRate))frameRateSelect.value=savedFrameRate;
function applyFrameRate(){
  const fps=Number(frameRateSelect.value);
  viewer.scene.requestRenderMode=false;
  viewer.targetFrameRate=fps;
  if(viewer.cesiumWidget)viewer.cesiumWidget.targetFrameRate=fps;
  // A 120 setting only removes our 60-FPS throttle. Android/browser/GPU may still cap actual frames.
  try{localStorage.setItem('panoptes-frame-rate',frameRateSelect.value)}catch{}
}
frameRateSelect.addEventListener('change',applyFrameRate);
applyFrameRate();
// Count rendered frames rather than requestAnimationFrame callbacks: a GPU/CPU
// bottleneck can make the achieved number lower than the selected target.
const fpsToggle=document.getElementById('show-fps'),fpsCounter=document.getElementById('fps-counter');
try{fpsToggle.checked=localStorage.getItem('panoptes-show-fps')==='true'}catch{}
function syncFpsVisibility(){fpsCounter.hidden=!fpsToggle.checked;fpsCounter.style.display=fpsToggle.checked?'block':'none'}
syncFpsVisibility();
fpsToggle.addEventListener('change',()=>{syncFpsVisibility();try{localStorage.setItem('panoptes-show-fps',String(fpsToggle.checked))}catch{}});
window.addEventListener('pageshow',syncFpsVisibility);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncFpsVisibility()});
let fpsFrames=0,fpsStart=performance.now();
viewer.scene.postRender.addEventListener(()=>{
  if(!fpsToggle.checked){fpsFrames=0;fpsStart=performance.now();return}
  fpsFrames++;const now=performance.now(),elapsed=now-fpsStart;
  if(elapsed>=1000){fpsCounter.textContent=Math.round(fpsFrames*1000/elapsed)+' FPS';fpsFrames=0;fpsStart=now}
});
qualitySelect.onchange=()=>{try{localStorage.setItem('panoptes-quality',qualitySelect.value)}catch{}applyQuality()};
window.addEventListener('online',applyQuality);
navigator.connection?.addEventListener?.('change',()=>{if(qualitySelect.value==='auto')applyQuality()});
applyQuality();
viewer.camera.changed.addEventListener(()=>{const h=viewer.camera.positionCartographic.height;viewer.scene.fog.enabled=qualitySelect.value!=='low'&&h>120000;viewer.scene.globe.showGroundAtmosphere=h>350000});

/* Deliberate two-finger twist rolls the camera; a normal pinch remains zoom-only.
   Keep a dead zone so slight finger jitter during zoom-out does not spin the view. */
let twistAngle=null, twistDistance=0;
const canvas=viewer.canvas;
// Google Maps-style one-finger zoom: tap once, then press and drag on the
// second tap. Only capture a real drag, leaving a normal double tap intact.
let firstTapTime=0,firstTapX=0,firstTapY=0,holdZoom=false,holdStartY=0,holdLastY=0,holdStartX=0,holdTimer=0,holdCandidate=false;
canvas.addEventListener('touchstart',e=>{
  if(e.touches.length!==1){holdCandidate=false;holdZoom=false;clearTimeout(holdTimer);return}
  const t=e.touches[0],now=performance.now();
  const isSecond=now-firstTapTime<420&&Math.hypot(t.clientX-firstTapX,t.clientY-firstTapY)<42;
  if(isSecond){holdCandidate=true;holdStartY=holdLastY=t.clientY;holdStartX=t.clientX;firstTapTime=0;
    holdTimer=setTimeout(()=>{if(holdCandidate){holdZoom=true;viewer.scene.screenSpaceCameraController.enableInputs=false}},130);
  }else{firstTapTime=now;firstTapX=t.clientX;firstTapY=t.clientY}
},{passive:true});
canvas.addEventListener('touchmove',e=>{
  if(!holdCandidate||e.touches.length!==1)return;
  const t=e.touches[0];
  if(!holdZoom){if(Math.hypot(t.clientX-holdStartX,t.clientY-holdStartY)>12){holdCandidate=false;clearTimeout(holdTimer)}return}
  e.preventDefault();
  const dy=t.clientY-holdLastY;holdLastY=t.clientY;
  const height=Math.max(80,viewer.camera.positionCartographic.height);
  // Dragging down zooms in, dragging up zooms out; scale per pixel is
  // proportional to altitude so the movement stays continuous at any height.
  if(Math.abs(dy)>0.1){const distance=height*(Math.exp(Math.abs(dy)*.008)-1);if(dy>0)viewer.camera.zoomIn(distance);else viewer.camera.zoomOut(distance);viewer.scene.requestRender()}
},{passive:false});
function endHoldZoom(){clearTimeout(holdTimer);holdCandidate=false;if(holdZoom){holdZoom=false;viewer.scene.screenSpaceCameraController.enableInputs=true}}
canvas.addEventListener('touchend',endHoldZoom,{passive:true});
canvas.addEventListener('touchcancel',endHoldZoom,{passive:true});
function gesture(t){const a=t[0],b=t[1];return {angle:Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX),distance:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY)}}
canvas.addEventListener('touchstart',e=>{if(e.touches.length===2){const g=gesture(e.touches);twistAngle=g.angle;twistDistance=g.distance}}, {passive:true});
canvas.addEventListener('touchmove',e=>{
  if(e.touches.length!==2||twistAngle===null)return;
  const g=gesture(e.touches);let d=g.angle-twistAngle;
  if(d>Math.PI)d-=Math.PI*2;if(d< -Math.PI)d+=Math.PI*2;
  const zooming=Math.abs(g.distance-twistDistance)>Math.max(10,twistDistance*.08);
  if(!zooming&&Math.abs(d)>Cesium.Math.toRadians(3)){viewer.camera.twistRight(-d);twistAngle=g.angle;viewer.scene.requestRender()}
  twistDistance=g.distance;
}, {passive:true});
canvas.addEventListener('touchend',e=>{if(e.touches.length!==2)twistAngle=null},{passive:true});
canvas.addEventListener('touchcancel',()=>{twistAngle=null},{passive:true});

/* Optional device feedback. Default vibration follows the user's Android request;
   sound remains off until the user enables it, and never plays before interaction. */
const feedback={haptics:document.getElementById('haptics'),sound:document.getElementById('sound'),volume:document.getElementById('volume'),motion:document.getElementById('motion')};
for(const [key,el] of Object.entries(feedback)){
  const v=localStorage.getItem('panoptes-'+key);
  if(v!==null){if(el.type==='checkbox')el.checked=v==='true';else el.value=v}
  el.addEventListener('change',()=>{localStorage.setItem('panoptes-'+key,el.type==='checkbox'?String(el.checked):el.value);if(key==='motion')document.documentElement.classList.toggle('reduce-motion',el.checked)});
}
document.documentElement.classList.toggle('reduce-motion',feedback.motion.checked);
let soundContext;let lastGestureBuzz=0;
function feedbackPulse(kind='tap'){
  if(feedback.haptics.checked&&navigator.vibrate)navigator.vibrate(kind==='gesture'?8:12);
  if(!feedback.sound.checked)return;
  try{soundContext??=new (window.AudioContext||window.webkitAudioContext)();const o=soundContext.createOscillator(),g=soundContext.createGain(),now=soundContext.currentTime;
    o.type='sine';o.frequency.setValueAtTime(kind==='gesture'?410:520,now);o.frequency.exponentialRampToValueAtTime(330,now+.045);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.0001,Number(feedback.volume.value)/100*.018),now+.006);g.gain.exponentialRampToValueAtTime(.0001,now+.065);
    o.connect(g).connect(soundContext.destination);o.start(now);o.stop(now+.07);
  }catch{}
}
document.addEventListener('click',e=>{if(e.target.closest('button,#brand,[role="button"]'))feedbackPulse()},{capture:true});
canvas.addEventListener('touchend',e=>{if(e.changedTouches.length&&Date.now()-lastGestureBuzz>300){lastGestureBuzz=Date.now();feedbackPulse('gesture')}},{passive:true});
