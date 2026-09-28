/* PANOPTES - Earth explorer optimized for mobile. Original implementation. */
// The current app has no service worker. Remove a registration from an older build, if any.
if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister())).catch(() => {});
Cesium.Ion.defaultAccessToken = 'REPLACE_WITH_YOUR_CESIUM_ION_TOKEN';

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  baseLayer: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
  infoBox: false, selectionIndicator: false,
});
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#172b39');
// Prefer a recognizable coarse Earth before the detailed descendants finish.
viewer.scene.globe.loadingDescendantLimit = 4;
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.globe.enableLighting = true;
// Keep daytime ocean legible at close zoom; retain the space-scale terminator.
viewer.scene.globe.lightingFadeOutDistance = 900000;
viewer.scene.globe.lightingFadeInDistance = 4500000;
viewer.scene.globe.showWaterEffect = false;
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
viewer.scene.postRender.addEventListener(function onFirstFrame(){viewer.scene.postRender.removeEventListener(onFirstFrame);window.dispatchEvent(new Event('panoptes-globe-ready'))});

(async () => {
  try {
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(await Cesium.IonImageryProvider.fromAssetId(2)); // Bing aerial, no burned-in labels
  } catch (e) { console.warn('imagery fallback', e); }
  try {
    viewer.scene.setTerrain(new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromIonAssetId(1,{requestWaterMask:true}))); // watermask is needed for Cesium's real sun-glint shader
  } catch (e) { console.warn('terrain unavailable', e); }
  try {
    // Globe imagery and terrain take priority over the separate buildings network.
    // Do not delay the building layer forever if the imagery provider is slow.
    await new Promise(resolve => {
      let done=false; const finish=()=>{if(done)return;done=true;clearTimeout(timer);viewer.scene.globe.tileLoadProgressEvent.removeEventListener(check);resolve()};
      const check=()=>{if(viewer.imageryLayers.length&&viewer.scene.globe.tilesLoaded)finish()};
      const timer=setTimeout(finish,6500);viewer.scene.globe.tileLoadProgressEvent.addEventListener(check);check();
    });
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
        ["true", "color('#bcbfc0', 0.92)"],
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
// Intro completion is driven by the final letter animation in the page, not the globe's render timing.
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
optionsBtn.onclick = () => {
  // Settings is modal: tapping the top-right menu closes it instead of opening a hidden-under panel.
  const modal=document.getElementById('settings');
  if(!modal.classList.contains('hidden')){document.getElementById('settings-close').click();optionsMenu.classList.add('hidden');optionsBtn.setAttribute('aria-expanded','false');return}
  const open=optionsMenu.classList.toggle('hidden');optionsBtn.setAttribute('aria-expanded',String(!open));
};
document.getElementById('flight-status').onclick = () => { if(!document.getElementById('settings').classList.contains('hidden'))return; optionsMenu.classList.remove('hidden'); optionsBtn.setAttribute('aria-expanded', 'true'); };
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
let lastViewNear=null;
function syncViewControl() {
  const near = viewer.scene.mode === Cesium.SceneMode.SCENE3D && viewer.camera.positionCartographic.height < BUILDING_VIEW_HEIGHT;
  const wasHidden = layers.classList.contains('hidden');
  if(lastViewNear!==near){layers.classList.toggle('hidden', !near);lastViewNear=near}
  if (near && wasHidden) requestAnimationFrame(() => {
    const b = document.querySelector('[data-layer].selected'), a = b.getBoundingClientRect(), p = layers.getBoundingClientRect(), track = document.getElementById('layer-highlight');
    track.style.width = `${a.width}px`; track.style.height = `${a.height}px`; track.style.transform = `translateY(${a.top-p.top}px)`;
  });
  if (window.osmBuildings) {const shouldShow=near && selectedView === '3d';if(window.osmBuildings.show!==shouldShow)window.osmBuildings.show=shouldShow}
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
/* v27.0.3: the view control wakes while the camera moves and rests as a pill. */
const layersPill=document.getElementById('layers-pill');
let viewCollapseTimer=null,lastZoomHeight=viewer.camera.positionCartographic.height,lastZoomAt=0;
function showViewWhileMoving(){
  if(layers.classList.contains('hidden'))return;
  const h=viewer.camera.positionCartographic.height;
  if(!Number.isFinite(h))return;
  const heightChange=Math.abs(Math.log(Math.max(1,h)/Math.max(1,lastZoomHeight)));
  lastZoomHeight=h;
  if(heightChange<.002)return;
  lastZoomAt=performance.now();
  layers.classList.remove('resting');
  clearTimeout(viewCollapseTimer);
  viewCollapseTimer=setTimeout(()=>{if(performance.now()-lastZoomAt>=1250&&!layers.classList.contains('hidden'))layers.classList.add('resting')},1450);
}
layersPill.addEventListener('click',()=>{layers.classList.remove('resting');clearTimeout(viewCollapseTimer);viewCollapseTimer=setTimeout(()=>layers.classList.add('resting'),3000)});
viewer.camera.changed.addEventListener(showViewWhileMoving);
viewer.camera.moveEnd.addEventListener(showViewWhileMoving);
setTimeout(()=>{if(!layers.classList.contains('hidden'))layers.classList.add('resting')},2200);

viewer.camera.changed.addEventListener(()=>{syncViewControl();syncFar3dView()});
viewer.camera.moveEnd.addEventListener(()=>{syncViewControl();syncFar3dView()});
requestAnimationFrame(() => selectLayer(layerBtns.find(b => b.dataset.layer === '2d'), true));
window.addEventListener('resize', () => selectLayer(document.querySelector('[data-layer].selected') || layerBtns[0], true));
// Desktop-only single-key shortcuts. Never hijack text input, browser modifier
// shortcuts, or controls with a native key action.
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const active=document.activeElement;
  const editing=active?.matches?.('input,textarea,select,[contenteditable],button')||active?.closest?.('[contenteditable]');
  if(e.key==='Escape'){
    document.querySelectorAll('[role="dialog"]').forEach(el=>el.classList.add('hidden'));
    optionsMenu.classList.add('hidden');sug.classList.remove('open');q.blur();return;
  }
  if(editing)return;
  switch(e.key.toLowerCase()){
    case '2': selectLayer(layerBtns.find(b=>b.dataset.layer==='2d'));break;
    case '3': selectLayer(layerBtns.find(b=>b.dataset.layer==='3d'));break;
    case '/': e.preventDefault();q.focus();break;
    case 's': optionsMenu.classList.add('hidden');settings.classList.remove('hidden');break;
    case 'n': compass.click();break;
  }
});


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
document.getElementById('settings-close').onclick=()=>{settings.classList.add('hidden');settingsTrack.classList.remove('appearance-open');appearancePanel.inert=true;appearancePanel.setAttribute('aria-hidden','true');document.getElementById('settings-main').inert=false;document.getElementById('settings-main').setAttribute('aria-hidden','false')};
const settingsTrack=document.getElementById('settings-track'),appearancePanel=document.getElementById('settings-appearance');
function setAppearancePage(open){
  // Set the destination state first. Moving focus into a transformed/offscreen
  // panel in the same turn made mobile Chrome scroll it into view abruptly.
  settingsTrack.classList.toggle('appearance-open',open);
  appearancePanel.inert=!open;
  appearancePanel.setAttribute('aria-hidden',String(!open));
  document.getElementById('settings-main').inert=open;
  document.getElementById('settings-main').setAttribute('aria-hidden',String(open));
  const target=open?document.getElementById('appearance-back'):document.getElementById('appearance-open');
  setTimeout(()=>{if(settingsTrack.classList.contains('appearance-open')===open&&!settings.classList.contains('hidden'))target.focus({preventScroll:true})},window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:830);
}
document.getElementById('appearance-open').onclick=()=>setAppearancePage(true);document.getElementById('appearance-back').onclick=()=>setAppearancePage(false);
settings.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsTrack.classList.contains('appearance-open')){e.stopPropagation();setAppearancePage(false)}});
/* v26.1.3 appearance controls: these alter UI only, never the globe imagery. */
const stationModeSelect=document.getElementById('station-mode'),uiThemeSelect=document.getElementById('ui-theme'),glassBg=document.getElementById('glass-bg'),glassFg=document.getElementById('glass-fg');
try{const v=localStorage.getItem('panoptes-station-mode');if(['single','combined'].includes(v))stationModeSelect.value=v;
const t=localStorage.getItem('panoptes-ui-theme');if(['black','white','liquid'].includes(t))uiThemeSelect.value=t;
for(const [input,key] of [[glassBg,'panoptes-glass-bg'],[glassFg,'panoptes-glass-fg']]){const raw=localStorage.getItem(key),n=Number(raw);if(raw!==null&&Number.isFinite(n)&&n>=Number(input.min)&&n<=Number(input.max))input.value=n}}
catch{}
function applyAppearance(){document.documentElement.dataset.uiTheme=uiThemeSelect.value;document.documentElement.style.setProperty('--glass-bg-alpha',(Number(glassBg.value)/100).toFixed(2));document.documentElement.style.setProperty('--ui-foreground-alpha',(Number(glassFg.value)/100).toFixed(2));document.getElementById('glass-bg-value').textContent=glassBg.value+'%';document.getElementById('glass-fg-value').textContent=glassFg.value+'%'}
applyAppearance();for(const [el,key] of [[uiThemeSelect,'panoptes-ui-theme'],[glassBg,'panoptes-glass-bg'],[glassFg,'panoptes-glass-fg']])el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{applyAppearance();try{localStorage.setItem(key,el.value)}catch{}});
stationModeSelect.addEventListener('change',()=>{try{localStorage.setItem('panoptes-station-mode',stationModeSelect.value)}catch{};if(stationModeSelect.value==='single'&&issOn&&cssOn){stationSwitching=true;cssButton.click();stationSwitching=false}if(stationModeSelect.value==='single'&&!issOn&&!cssOn)issToggle.click();syncStationLens()});

let savedQuality='auto';try{savedQuality=localStorage.getItem('panoptes-quality')||'auto'}catch{}
if(['auto','low','medium','high'].includes(savedQuality))qualitySelect.value=savedQuality;
// Globe SSE governs terrain AND imagery refinement. v15's 10-16px budget
// left satellite imagery visibly blocky; Cesium's stock globe budget is 2px.
// Keep building-tile budget separate: it has different default/detail costs.
let adaptivePerfLevel=0; // 0 full effect, 1 glint off, 2 lower render cost, 3 emergency render cost
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
  const fastAuto=qualitySelect.value==='auto'&&Number(document.getElementById('frame-rate')?.value)>60;
  // Mid-altitude globe and ISS focus fill the display with terrain, imagery and
  // atmosphere. Preserve close-up map detail and far-out globe sharpness; reduce
  // only this expensive band. High stays sharper than Medium, but is not a fixed
  // 2x offscreen render on high-DPR Android.
  const h=viewer.camera.positionCartographic.height, mid=h>=180000&&h<=5000000;
  // At the 6,000-7,000 km view a 1.75x Auto scale paints three times the
  // pixels of native resolution. Save fill-rate without requesting fewer
  // imagery tiles: lower the far-view render scale, not the imagery SSE.
  const far=h>5000000, cap=mid?({low:1,medium:1.3,high:1.55})[name]:far?({low:1,medium:1.15,high:1.35})[name]:p.scale;
  const minScale=far?1:0.72;
  viewer.resolutionScale=Math.max(minScale,Math.min(window.devicePixelRatio||1,fastAuto?Math.min(cap,1.4):cap,adaptivePerfLevel>=3?(far?1:.72):adaptivePerfLevel>=2?(far?1:.9):Infinity));
  // Progressive image detail must not be traded for FPS. The old emergency
  // 5px error kept the globe blurry even after tile downloads finished.
  viewer.scene.globe.maximumScreenSpaceError=mid?Math.max(p.globeSse,{low:2.5,medium:2,high:1.8}[name]):p.globeSse;
  viewer.scene.fog.enabled=name!=='low'&&viewer.camera.positionCartographic.height>120000;
  // Android fragment precision can wash out ground atmosphere at close range.
  viewer.scene.globe.showGroundAtmosphere=viewer.camera.positionCartographic.height>350000;
  viewer.scene.globe.showWaterEffect=adaptivePerfLevel===0&&name!=='low'&&viewer.camera.positionCartographic.height<1800000; // real water-mask glint, not ray tracing; Low stays cheapest
  if(window.osmBuildings){window.osmBuildings.maximumScreenSpaceError=Math.max(p.buildingSse,adaptivePerfLevel>=2?22:0);window.osmBuildings.maximumMemoryUsage=p.tiles}
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
  // Reduce expensive render resolution slightly only in Auto mode at 90/120; the
  // explicit High quality setting remains untouched if sharpness matters more.
  if(qualitySelect.value==='auto')applyQuality();
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
// Measure actual rendered frames even when the FPS badge is hidden. Degrade in stages;
// recover slowly to avoid flipping the water effect repeatedly on dense island views.
let adaptiveFrames=0,adaptiveStart=performance.now(),adaptiveLowWindows=0,adaptiveGoodWindows=0,adaptiveLastChange=0;
viewer.scene.postRender.addEventListener(()=>{
  if(document.visibilityState!=='visible'){adaptiveFrames=0;adaptiveStart=performance.now();return}
  adaptiveFrames++;const now=performance.now(),span=now-adaptiveStart;
  if(span<1200)return;
  const measured=adaptiveFrames*1000/span;adaptiveFrames=0;adaptiveStart=now;
  const floor=Number(frameRateSelect.value)>=60?48:25;
  if(measured<floor&&viewer.scene.globe.tilesLoaded){adaptiveLowWindows++;adaptiveGoodWindows=0}
  else if(measured>Math.min(57,Math.max(28,Number(frameRateSelect.value)-3))){adaptiveGoodWindows++;adaptiveLowWindows=0}
  else{adaptiveLowWindows=0;adaptiveGoodWindows=0}
  if(adaptiveLowWindows>=2&&now-adaptiveLastChange>2500&&adaptivePerfLevel<3){adaptivePerfLevel++;adaptiveLastChange=now;adaptiveLowWindows=0;applyQuality()}
  else if(adaptiveGoodWindows>=8&&now-adaptiveLastChange>18000&&adaptivePerfLevel>0){adaptivePerfLevel--;adaptiveLastChange=now;adaptiveGoodWindows=0;applyQuality()}
});
qualitySelect.onchange=()=>{try{localStorage.setItem('panoptes-quality',qualitySelect.value)}catch{}applyQuality()};
window.addEventListener('online',applyQuality);
navigator.connection?.addEventListener?.('change',()=>{if(qualitySelect.value==='auto')applyQuality()});
applyQuality();
let perfBand=viewer.camera.positionCartographic.height>=180000&&viewer.camera.positionCartographic.height<=5000000;
let detailedWaterBand=viewer.camera.positionCartographic.height<1800000;
viewer.camera.changed.addEventListener(()=>{const h=viewer.camera.positionCartographic.height;viewer.scene.fog.enabled=qualitySelect.value!=='low'&&h>120000;viewer.scene.globe.showGroundAtmosphere=h>350000;const next=h>=180000&&h<=5000000;const waterBand=h<1800000;if(next!==perfBand||waterBand!==detailedWaterBand){perfBand=next;detailedWaterBand=waterBand;applyQuality()}});

/* Camera ellipsoid height, not a measured map scale or ground clearance. */
const altitudeDisplay=document.getElementById('camera-altitude');
let lastAltitudeText='',lastAltitudeAt=0;
function updateCameraAltitude(){
  const h=Math.max(0,viewer.camera.positionCartographic.height), now=performance.now();
  if(now-lastAltitudeAt<120)return;
  lastAltitudeAt=now;
  const value=h>=100000?Math.round(h/1000).toLocaleString()+' km':h>=10000?(h/1000).toFixed(1)+' km':h>=1000?(h/1000).toFixed(2)+' km':Math.round(h).toLocaleString()+' m';
  const text='Camera: '+value;
  if(text!==lastAltitudeText){altitudeDisplay.textContent=text;lastAltitudeText=text}
}
viewer.camera.changed.addEventListener(updateCameraAltitude);
viewer.camera.moveEnd.addEventListener(updateCameraAltitude);
updateCameraAltitude();

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
function endHoldZoom(e){
  clearTimeout(holdTimer);
  if(holdCandidate&&!holdZoom&&e.type==='touchend'){
    // Second tap released without a hold: zoom toward the tap itself.
    const t=e.changedTouches[0];if(t){
      const pos=new Cesium.Cartesian2(t.clientX,t.clientY);
      const hit=viewer.camera.pickEllipsoid(pos);
      if(hit){const c=Cesium.Cartographic.fromCartesian(hit),h=Math.max(120,viewer.camera.positionCartographic.height*.58);
        viewer.camera.flyTo({destination:Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,h),orientation:{heading:viewer.camera.heading,pitch:viewer.camera.pitch,roll:viewer.camera.roll},duration:.35});}
      else viewer.camera.zoomIn(Math.max(80,viewer.camera.positionCartographic.height*.42));
    }
  }
  holdCandidate=false;if(holdZoom){holdZoom=false;viewer.scene.screenSpaceCameraController.enableInputs=true}
}
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
let soundContext;let lastDetent=0,lastTouchSample=null;
// Browsers expose vibration timing, not motor strength. A quick gesture gets
// closer/longer detent ticks; a slow gesture gets sparse short pulses.
function gestureDetent(speed){
  if(!feedback.haptics.checked||!navigator.vibrate)return;
  const now=performance.now(),fast=Math.min(1,Math.max(0,(speed-0.16)/1.3));
  const spacing=145-fast*95;
  if(now-lastDetent<spacing)return;
  lastDetent=now;
  navigator.vibrate(fast>.7?[11,14,9]:fast>.32?[8,19,7]:[5]);
}
canvas.addEventListener('touchstart',e=>{lastTouchSample=e.touches.length?{x:e.touches[0].clientX,y:e.touches[0].clientY,t:performance.now()}:null},{passive:true});
canvas.addEventListener('touchmove',e=>{
  const t=e.touches[0];if(!t||!lastTouchSample)return;
  const now=performance.now(),dt=Math.max(8,now-lastTouchSample.t),speed=Math.hypot(t.clientX-lastTouchSample.x,t.clientY-lastTouchSample.y)/dt;
  if(speed>.07)gestureDetent(speed);
  lastTouchSample={x:t.clientX,y:t.clientY,t:now};
},{passive:true});
canvas.addEventListener('touchend',e=>{if(!e.touches.length)lastTouchSample=null},{passive:true});
canvas.addEventListener('touchcancel',()=>{lastTouchSample=null},{passive:true});
function feedbackPulse(kind='tap'){
  if(feedback.haptics.checked&&navigator.vibrate)navigator.vibrate(kind==='gesture'?[7,18,7]:[9]);
  if(!feedback.sound.checked)return;
  try{soundContext??=new (window.AudioContext||window.webkitAudioContext)();const o=soundContext.createOscillator(),g=soundContext.createGain(),now=soundContext.currentTime;
    o.type='sine';o.frequency.setValueAtTime(kind==='gesture'?410:520,now);o.frequency.exponentialRampToValueAtTime(330,now+.045);
    g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.0001,Number(feedback.volume.value)/100*.018),now+.006);g.gain.exponentialRampToValueAtTime(.0001,now+.065);
    o.connect(g).connect(soundContext.destination);o.start(now);o.stop(now+.07);
  }catch{}
}
document.addEventListener('click',e=>{if(e.target.closest('button,#brand,[role="button"]'))feedbackPulse()},{capture:true});
// Continuous gestures produce detents above; no redundant end-of-gesture buzz.

/* v25 ISS: observed position from Where the ISS at; SGP4-predicted ground track
   from a recent TLE. No path segment is claimed to be observed travel history. */
const issToggle=document.getElementById('iss-toggle'),issCenter=document.getElementById('iss-center'),issStatus=document.getElementById('iss-status');
let issOn=false,issFollow=false,issFocusTarget=null,issMarker=null,issTrack=[],issTrail=[],issModel=null,issTrackEpoch=0,issSatrec=null,issTleTime=0,issLastPos=null,issTimer=null,issBusy=false;
const issCard=document.getElementById('iss-card'),issFacts=document.getElementById('iss-facts');
const issCam=document.getElementById('iss-cam');
document.getElementById('iss-close').onclick=()=>{issCard.classList.add('hidden');issCam.querySelector('iframe').removeAttribute('src');issCam.hidden=true};
function issChooseCam(kind){
  const outside=kind==='out';
  const id=outside?'awQzjn72bI0':'M3HKLzjvKPc';
  issCam.hidden=false;
  document.getElementById('iss-cam-note').textContent=outside?'External camera: Earth-facing view. NASA may show a previously recorded loop when the live camera is unavailable.':'Interior/crew feed: inside views only when the crew is on duty. At other times NASA switches to outside views or a signal-loss screen. This is not a guaranteed always-on interior camera.';
  issCam.querySelector('iframe').src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1';
  document.getElementById('iss-cam-link').href='https://www.youtube.com/watch?v='+id;
}
document.getElementById('iss-cam-out').onclick=()=>issChooseCam('out');
document.getElementById('iss-cam-in').onclick=()=>issChooseCam('in');
const issCrew=[['Jessica Meir','Commander · NASA'],['Jack Hathaway','Flight engineer · NASA'],['Sophie Adenot','Flight engineer · ESA'],['Andrey Fedyaev','Flight engineer · Roscosmos'],['Anil Menon','Flight engineer · NASA'],['Pyotr Dubrov','Flight engineer · Roscosmos'],['Anna Kikina','Flight engineer · Roscosmos']];
const crewBox=document.getElementById('iss-crew');
if(Date.now()<Date.parse('2026-09-30T10:00:00Z')){const list=document.createElement('ul');list.className='crew-list';for(const [name,role] of issCrew){const li=document.createElement('li'),link=document.createElement('a'),small=document.createElement('span');link.href='https://en.wikipedia.org/wiki/'+encodeURIComponent(name.replaceAll(' ','_'));link.target='_blank';link.rel='noopener';link.textContent=name;small.textContent=role;li.append(link,small);list.append(li)}crewBox.replaceWith(list)}
function issSetStatus(t){issStatus.textContent=t}
function issFactsUpdate(s){
  const dt=new Date(s.timestamp*1000).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'});
  const fields=[['Altitude',Math.round(s.altitude).toLocaleString()+' km'],['Speed',Math.round(s.velocity).toLocaleString()+' km/h'],['Latitude',Math.abs(s.latitude).toFixed(3)+'° '+(s.latitude>=0?'N':'S')],['Longitude',Math.abs(s.longitude).toFixed(3)+'° '+(s.longitude>=0?'E':'W')],['Fix time',dt+' UTC']];
  issFacts.replaceChildren(...fields.map(([label,value])=>{const cell=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('span');strong.textContent=value;small.textContent=label;cell.append(strong,small);return cell}));
}
function issUpdateVisual(){
  if(!issMarker)return;
  const near=viewer.camera.positionCartographic.height<3500000||issFollow;
  if(issMarker.show===near)issMarker.show=!near;
  if(issModel&&issModel.show!==near)issModel.show=near;
}
function issSetTrail(s){
  // The full orbit is one visible line. A separate recent-history ribbon
  // overlapped it as a second cyan route on the phone; do not draw it.
  for(const e of issTrail)viewer.entities.remove(e);issTrail=[];
}
viewer.camera.changed.addEventListener(issUpdateVisual);


function issPoint(s){return Cesium.Cartesian3.fromDegrees(s.longitude,s.latitude,Math.max(0,s.altitude)*1000)}
function validIss(s){return s&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)&&Number.isFinite(s.altitude)&&Number.isFinite(s.velocity)&&Math.abs(s.latitude)<=90&&Math.abs(s.longitude)<=180&&s.id===25544&&Number.isFinite(s.timestamp)&&Date.now()/1000-s.timestamp<150&&s.timestamp-Date.now()/1000<60}
function issPredict(date){
  if(!issSatrec||Date.now()-issTleTime>6*3600e3)return null;
  const pv=satellite.propagate(issSatrec,date);if(!pv?.position)return null;
  const gd=satellite.eciToGeodetic(pv.position,satellite.gstime(date));
  const lon=satellite.degreesLong(gd.longitude),lat=satellite.degreesLat(gd.latitude);
  return [lon,lat,gd.height];
}
function issSetPath(){
  for(const entity of issTrack)viewer.entities.remove(entity);issTrack=[];
  if(!issSatrec)return;
  // Draw a single closed orbital ground-track overview in Earth-fixed coordinates.
  // A ground track sampled over a finite 135-minute window had a visible end
  // mid-map. Hold the Earth rotation fixed for each full-orbit snapshot;
  // otherwise its rotation prevents the end and start from joining.
  const now=Date.now(),periodMs=2*Math.PI/issSatrec.no*60000;
  const gmst=satellite.gstime(new Date(now)),positions=[];
  for(let i=0;i<180;i++){
    const pv=satellite.propagate(issSatrec,new Date(now-periodMs/2+periodMs*i/180));
    if(!pv?.position)break;
    const e=satellite.eciToEcf(pv.position,gmst);
    const geo=satellite.eciToGeodetic(pv.position,gmst);
    // Ground-track overview remains visible without drawing a second route.
    positions.push(Cesium.Cartesian3.fromRadians(geo.longitude,geo.latitude,15000));
  }
  if(positions.length!==180)return;
  positions.push(positions[0]);
  issTrack.push(viewer.entities.add({polyline:{positions,width:2,material:Cesium.Color.CYAN.withAlpha(.7),clampToGround:false},properties:{iss:true}}));
  issTrackEpoch=now;
}
async function issGetTle(){
  if(issSatrec&&Date.now()-issTleTime<2*3600e3)return;
  const r=await fetch('https://api.wheretheiss.at/v1/satellites/25544/tles',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Orbit data unavailable');
  const t=await r.json();if(!/^1 25544/.test(t.line1||'')||!/^2 25544/.test(t.line2||'')||!Number.isFinite(t.tle_timestamp)||Date.now()/1000-t.tle_timestamp>7*86400)throw Error('Invalid orbit data');
  const rec=satellite.twoline2satrec(t.line1,t.line2);
  const now=satellite.propagate(rec,new Date());if(!now?.position||rec.error)throw Error('Invalid orbit model');
  if(!issOn)return;
  issSatrec=rec;issTleTime=Date.now();issSetPath();if(issLastPos)issSetTrail(issLastPos);
}
function issMoveCamera(s,first=false){
  if(!s)return;
  const target=issPoint(s);
  if(first){
    // Keep a non-identity camera transform centered on the model. Cesium then
    // rotates and zooms around this target instead of the Earth's center.
    viewer.camera.lookAt(target,new Cesium.HeadingPitchRange(0,Cesium.Math.toRadians(-18),180000));
  }else if(issFocusTarget){
    // A new reported fix arrives every 20 s. Preserve the user's orbit angle,
    // pitch and zoom; never run a timer that repeatedly resets gestures.
    const range=Cesium.Cartesian3.distance(viewer.camera.positionWC,issFocusTarget);
    viewer.camera.lookAt(target,new Cesium.HeadingPitchRange(viewer.camera.heading,viewer.camera.pitch,Math.max(3000,range)));
  }
  issFocusTarget=target;
}
function issOrbitStart(){
  issFollow=true;issCenter.setAttribute('aria-pressed','true');syncStationLens();
  issMoveCamera(issLastPos,true);issUpdateVisual();
}
function issOrbitStop(){
  issFollow=false;issFocusTarget=null;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  issCenter.setAttribute('aria-pressed','false');issUpdateVisual();syncStationLens();
}

async function issRefresh(){
  if(!issOn||issBusy||(document.visibilityState!=='visible'&&issLastPos))return;
  issBusy=true;
  try{
    const response=await fetch('https://api.wheretheiss.at/v1/satellites/25544',{signal:AbortSignal.timeout(11000),cache:'no-store'});
    if(!response.ok)throw Error('ISS feed unavailable');
    const s=await response.json();if(!issOn)return;if(!validIss(s))throw Error('ISS fix stale');
    issLastPos=s;
    if(!issMarker){
      const pulse=new Cesium.CallbackProperty(()=>13+3*Math.sin(Date.now()/320),false);
      issMarker=viewer.entities.add({name:'ISS - reported position',position:issPoint(s),point:{pixelSize:pulse,color:Cesium.Color.fromCssColorString('#8bd9ff'),outlineColor:Cesium.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:'✦ ISS',font:'bold 15px system-ui',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-22),disableDepthTestDistance:Number.POSITIVE_INFINITY},properties:{iss:true}});
      issModel=viewer.entities.add({name:'ISS - NASA 3D model',position:issPoint(s),orientation:Cesium.Transforms.headingPitchRollQuaternion(issPoint(s),new Cesium.HeadingPitchRoll(0,Cesium.Math.toRadians(-22),0)),model:{uri:'assets/iss-nasa.glb',scale:18,minimumPixelSize:430,maximumScale:14000,runAnimations:true},label:{text:'ISS · model enlarged for viewing',font:'12px system-ui',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-54),disableDepthTestDistance:Number.POSITIVE_INFINITY},properties:{iss:true}});
    }else {issMarker.position=issPoint(s);issModel.position=issPoint(s);issModel.orientation=Cesium.Transforms.headingPitchRollQuaternion(issPoint(s),new Cesium.HeadingPitchRoll(0,Cesium.Math.toRadians(-22),0))}
    issFactsUpdate(s);issUpdateVisual();
    issCenter.disabled=false;syncStationLens();
    issSetStatus(cssButton.dataset.pauseNotice==='shown'?'ISS live · Tiangong paused':'Live · '+Math.round(s.altitude)+' km');
    if(issFollow)issMoveCamera(s);
    if(!issSatrec||Date.now()-issTleTime>2*3600e3)issGetTle().catch(e=>console.warn('ISS route unavailable',e));
    if(Date.now()-issTrackEpoch>5*60e3)issSetPath();if(issSatrec)issSetTrail(s);
  }catch(e){if(issOn){issSetStatus('ISS unavailable');issOrbitStop();issCenter.disabled=true;syncStationLens()}}
  finally{issBusy=false}
}
issToggle.onclick=()=>{
  if(!issOn&&stationModeSelect.value==='single'&&cssOn){stationSwitching=true;cssButton.click();stationSwitching=false}if(!issOn&&cssOn&&cssFollow)cssFollow=false;
  if(issOn&&stationModeSelect.value==='single'&&!stationSwitching)return;
  issOn=!issOn;issToggle.setAttribute('aria-pressed',String(issOn));

  syncStationLens();
  if(issOn){delete cssButton.dataset.pauseNotice;issSetStatus('Locating ISS...');issRefresh();issTimer=setInterval(issRefresh,20000)}
  else{clearInterval(issTimer);issTimer=null;issOrbitStop();issCenter.disabled=true;if(issMarker){viewer.entities.remove(issMarker);issMarker=null}if(issModel){viewer.entities.remove(issModel);issModel=null}for(const e of issTrail)viewer.entities.remove(e);issTrail=[];issCard.classList.add('hidden');issCam.hidden=true;issCam.querySelector('iframe').removeAttribute('src');for(const e of issTrack)viewer.entities.remove(e);issTrack=[];issSetStatus(cssOn?'Tiangong · predicted':'ISS off')}
};
issCenter.onclick=()=>{if(issOn===cssOn)return;if(issFollow){issOrbitStop();return}if(cssFollow){cssFollow=false;syncStationLens();return}if(issOn){if(issLastPos)issOrbitStart()}else if(cssOn&&cssLast){cssFollow=true;cssMoveCamera();syncStationLens()}};


/* Tiangong (CSS Tianhe 48274). Predict from fresh public TLE; never call it a live fix. */
const cssButton=document.getElementById('css-toggle'),cssCard=document.getElementById('css-card'),cssFacts=document.getElementById('css-facts');
let cssOn=false,cssFollow=false,cssSatrec=null,cssEpoch=0,cssMarker=null,cssPath=[],cssTimer=null,cssLast=null;
function cssMoveCamera(){if(cssLast)viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(cssLast[0],cssLast[1],cssLast[2]*1000+950000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-78),roll:0},duration:.7})}
document.getElementById('css-close').onclick=()=>cssCard.classList.add('hidden');
function cssClear(){cssFollow=false;for(const e of cssPath)viewer.entities.remove(e);cssPath=[];if(cssMarker)viewer.entities.remove(cssMarker);cssMarker=null;clearInterval(cssTimer);cssTimer=null;cssLast=null;cssCard.classList.add('hidden')}
function cssPredict(d){if(!cssSatrec||Date.now()-cssEpoch>72*3600e3)return null;const pv=satellite.propagate(cssSatrec,d);if(!pv?.position)return null;const g=satellite.eciToGeodetic(pv.position,satellite.gstime(d));return [satellite.degreesLong(g.longitude),satellite.degreesLat(g.latitude),g.height]}
function cssRender(){const current=cssPredict(new Date());if(!cssOn||!current)return;cssLast=current;const pos=Cesium.Cartesian3.fromDegrees(current[0],current[1],current[2]*1000);if(!cssMarker)cssMarker=viewer.entities.add({position:pos,point:{pixelSize:12,color:Cesium.Color.fromCssColorString('#ffa65c'),outlineColor:Cesium.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},label:{text:'TIANGONG · predicted',font:'bold 13px system-ui',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-21),disableDepthTestDistance:Number.POSITIVE_INFINITY},properties:{css:true}});else cssMarker.position=pos;
const cells=[['Altitude',Math.round(current[2])+' km'],['Latitude',Math.abs(current[1]).toFixed(2)+'° '+(current[1]>=0?'N':'S')],['Longitude',Math.abs(current[0]).toFixed(2)+'° '+(current[0]>=0?'E':'W')],['TLE age',Math.round((Date.now()-cssEpoch)/3600000)+' h']];cssFacts.replaceChildren(...cells.map(([label,value])=>{const cell=document.createElement('div'),a=document.createElement('strong'),b=document.createElement('span');a.textContent=value;b.textContent=label;cell.append(a,b);return cell}));if(cssFollow)cssMoveCamera();syncStationLens();}
async function cssActivate(){
  // The two available clients disagree on element freshness and no independent
  // live position has validated the prediction. Fail closed: do not draw a
  // marker, route, altitude or follow target until a source is verified.
  cssClear();cssOn=false;cssSatrec=null;cssEpoch=0;
  cssButton.setAttribute('aria-pressed','false');
  cssButton.title='Tiangong position paused: orbit source needs verification';
  cssButton.dataset.pauseNotice='shown';
  issSetStatus(issOn?'ISS live · Tiangong paused':'Tiangong position paused');
  syncStationLens();
}
cssButton.onclick=()=>{cssActivate()};
// Two-segment layout. In combined mode, a single lens expands to span both.
let stationSwitching=false;
const stationLens=document.getElementById('station-lens'),stationControls=document.getElementById('iss-controls');
const stationSegments=document.getElementById('station-segments'),followRow=document.getElementById('station-follow'),followLens=document.getElementById('follow-lens'),stationUnfollow=document.getElementById('station-unfollow');
function syncStationLens(){
  stationControls.classList.toggle('station-single',stationModeSelect.value==='single');
  stationSegments.dataset.state=issOn?(cssOn?'both':'iss'):(cssOn?'css':'none');
  issToggle.setAttribute('aria-pressed',String(issOn));cssButton.setAttribute('aria-pressed',String(cssOn));
  const one=(issOn!==cssOn),following=issFollow||cssFollow;
  followRow.hidden=!one;
  issCenter.disabled=!one||(issOn?!Boolean(issLastPos):!Boolean(cssLast));
  issCenter.setAttribute('aria-pressed',String(following));stationUnfollow.setAttribute('aria-pressed',String(!following));
  followRow.classList.toggle('following',following);
  stationLens.classList.add('visible');
}
stationUnfollow.onclick=()=>{if(issFollow)issOrbitStop();if(cssFollow){cssFollow=false;syncStationLens()}};
if(stationModeSelect.value==='single'&&!issOn&&!cssOn)issToggle.click();
requestAnimationFrame(syncStationLens);
viewer.screenSpaceEventHandler.setInputAction(m=>{const hit=viewer.scene.pick(m.position);if(hit?.id?.properties?.iss?.getValue()&&issLastPos){issCard.classList.remove('hidden');cssCard.classList.add('hidden');issFactsUpdate(issLastPos);issOrbitStart()}else if(hit?.id?.properties?.css?.getValue()&&cssLast){if(issFollow)issOrbitStop();cssCard.classList.remove('hidden');issCard.classList.add('hidden');viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(cssLast[0],cssLast[1],cssLast[2]*1000+950000),orientation:{heading:0,pitch:Cesium.Math.toRadians(-78),roll:0},duration:1.3})}},Cesium.ScreenSpaceEventType.LEFT_CLICK);

/* v27.0.1: visible swipe affordance plus Pointer Events for real Android.
   Horizontal gestures start on the explicit handle; native button taps remain intact. */
const stationPill=document.getElementById('station-pill');
const stationGrab=document.getElementById('station-grab');
let stationCollapsed=false,stationStart=null;
function setStationCollapsed(collapsed){
  if(stationCollapsed===collapsed)return;
  stationCollapsed=collapsed;
  stationControls.classList.toggle('collapsed',collapsed);
  stationPill.classList.toggle('visible',collapsed);
  stationPill.setAttribute('aria-expanded',String(!collapsed));
  stationControls.setAttribute('aria-hidden',String(collapsed));
  for(const b of stationControls.querySelectorAll('button'))b.tabIndex=collapsed?-1:0;
  if(!collapsed)requestAnimationFrame(syncStationLens);
}
stationPill.addEventListener('click',()=>setStationCollapsed(false));
stationGrab.addEventListener('click',()=>setStationCollapsed(true));
stationControls.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.pointerType!=='mouse')stationStart={id:e.pointerId,x:e.clientX,y:e.clientY};},{passive:true});
stationControls.addEventListener('pointerup',e=>{if(!stationStart||stationStart.id!==e.pointerId)return;const dx=e.clientX-stationStart.x,dy=e.clientY-stationStart.y;stationStart=null;if(dx>42&&Math.abs(dx)>Math.abs(dy)*1.25)setStationCollapsed(true)},{passive:true});
stationControls.addEventListener('pointercancel',()=>{stationStart=null},{passive:true});
stationControls.addEventListener('keydown',e=>{if(e.key==='Escape'){setStationCollapsed(true);stationPill.focus()}});

/* Temperature is opt-in only. Never fetch or show a status until its menu action is tapped. */
const weatherOption=document.getElementById('weather-option');
const weatherStatus=document.getElementById('weather-status');
const weatherLegend=document.getElementById('weather-legend');
let weatherLayer=null,weatherPending=false,weatherBlobUrl=null;
const WEATHER_API='https://panoptes-weather-global.paarthjawalkar.workers.dev/weather-global';
function weatherMessage(text,isError=false){weatherStatus.textContent=text;weatherStatus.classList.remove('hidden');weatherStatus.classList.toggle('error',isError)}
function clearWeather(){if(weatherLayer)viewer.imageryLayers.remove(weatherLayer,true);weatherLayer=null;if(weatherBlobUrl)URL.revokeObjectURL(weatherBlobUrl);weatherBlobUrl=null;weatherOption.textContent='Temperature layer';weatherStatus.classList.add('hidden');weatherLegend.classList.add('hidden');weatherLegend.classList.remove('pinned','visible');weatherLegendPinned=false;clearTimeout(weatherLegendTimer)}
const TEMP_STOPS=[[-45,[100,67,184]],[-20,[69,105,211]],[-5,[59,161,218]],[8,[75,183,125]],[20,[235,218,83]],[30,[247,146,53]],[45,[190,65,65]]];
function temperatureRGBA(t){let i=1;while(i<TEMP_STOPS.length-1&&t>TEMP_STOPS[i][0])i++;const a=TEMP_STOPS[i-1],b=TEMP_STOPS[i],f=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));return a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*f))}
function drawWeatherGrid(data){
  const {lats,lons,values}=data,nLat=lats.length,nLon=lons.length;
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=360;
  const context=canvas.getContext('2d',{willReadFrequently:false});const image=context.createImageData(720,360);
  for(let py=0;py<360;py++){
    const lat=90-(py+.5)*.5;const v=Math.max(0,Math.min(nLat-1,(lat-lats[0])/(lats[1]-lats[0])));const y0=Math.min(nLat-2,Math.floor(v)),fy=v-y0;
    for(let px=0;px<720;px++){
      const lon=-180+(px+.5)*.5;const u=(lon-lons[0])/(lons[1]-lons[0]);const x0=((Math.floor(u)%nLon)+nLon)%nLon,x1=(x0+1)%nLon,fx=u-Math.floor(u);
      const a=values[y0*nLon+x0],b=values[y0*nLon+x1],c=values[(y0+1)*nLon+x0],d=values[(y0+1)*nLon+x1];
      const temp=(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;const rgb=temperatureRGBA(temp),idx=(py*720+px)*4;
      image.data[idx]=rgb[0];image.data[idx+1]=rgb[1];image.data[idx+2]=rgb[2];image.data[idx+3]=178; // slightly stronger model colors, still transparent
    }
  }
  context.putImageData(image,0,0);return canvas;
}
async function toggleWeather(){
  if(weatherLayer){clearWeather();return}if(weatherPending)return;
  weatherPending=true;weatherMessage('Loading global model temperature...');
  try{
    const response=await fetch(WEATHER_API,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Weather unavailable (${response.status})`);
    const data=await response.json();
    if(data.source!=='Open-Meteo'||!Number.isFinite(data.updated_at)||Date.now()-data.updated_at>3600000||!Array.isArray(data.lats)||!Array.isArray(data.lons)||!Array.isArray(data.values)||data.lats.length*data.lons.length!==data.values.length||data.values.some(x=>!Number.isFinite(x))||data.lats.length!==9||data.lons.length!==15)throw Error('Weather data incomplete or stale');
    const canvas=drawWeatherGrid(data);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Weather image failed');weatherBlobUrl=URL.createObjectURL(blob);
    const provider=await Cesium.SingleTileImageryProvider.fromUrl(weatherBlobUrl,{rectangle:Cesium.Rectangle.MAX_VALUE,credit:'Open-Meteo · CC BY 4.0 · coarse current model'});
    weatherLayer=viewer.imageryLayers.addImageryProvider(provider);updateWeatherOpacity();
    weatherOption.textContent='Hide temperature';weatherStatus.classList.add('hidden');weatherLegend.classList.remove('hidden');weatherLegend.classList.remove('pinned');weatherLegendPinned=false;showWeatherLegendDuringZoom();
    weatherLegend.querySelector('.weather-time').textContent=new Date(data.updated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }catch(e){clearWeather();weatherMessage(e.message||'Weather unavailable',true)}finally{weatherPending=false}
}
// Coarse global model is useful at globe and country scale, not at street scale.
// Fade the single imagery layer out before it muddies city imagery.
function updateWeatherOpacity(){
  if(!weatherLayer)return;
  const h=viewer.camera.positionCartographic?.height||0;
  const t=Math.max(0,Math.min(1,(h-350000)/(3000000-350000)));
  weatherLayer.alpha=.69*t; // medium-strength color; city imagery still fades clean
  weatherLegend.classList.toggle('close-zoom',t<.05);
}
viewer.camera.changed.addEventListener(updateWeatherOpacity);
viewer.camera.moveEnd.addEventListener(updateWeatherOpacity);

let weatherLegendPinned=false,weatherLegendTimer=null,lastWeatherHeight=viewer.camera.positionCartographic.height;
function showWeatherLegendDuringZoom(){if(!weatherLayer)return;weatherLegend.classList.add('visible');clearTimeout(weatherLegendTimer);if(!weatherLegendPinned)weatherLegendTimer=setTimeout(()=>weatherLegend.classList.remove('visible'),1800)}
function weatherLegendCamera(){if(!weatherLayer)return;const h=viewer.camera.positionCartographic.height;if(!Number.isFinite(h))return;const moved=Math.abs(Math.log(Math.max(1,h)/Math.max(1,lastWeatherHeight)))>.002;lastWeatherHeight=h;if(moved)showWeatherLegendDuringZoom()}
function toggleWeatherLegendPin(){if(!weatherLayer)return;weatherLegendPinned=!weatherLegendPinned;weatherLegend.classList.toggle('pinned',weatherLegendPinned);weatherLegend.setAttribute('aria-label',weatherLegendPinned?'Unpin temperature legend':'Pin temperature legend');if(weatherLegendPinned){weatherLegend.classList.add('visible');clearTimeout(weatherLegendTimer)}else{weatherLegend.classList.remove('visible');clearTimeout(weatherLegendTimer)}}
weatherLegend.addEventListener('click',toggleWeatherLegendPin);
weatherLegend.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleWeatherLegendPin()}});
viewer.camera.changed.addEventListener(weatherLegendCamera);

weatherOption.addEventListener('click',toggleWeather);
// A previous preview exposed the initially-hidden status chip via a CSS specificity bug.
weatherStatus.classList.add('hidden');weatherLegend.classList.add('hidden');
