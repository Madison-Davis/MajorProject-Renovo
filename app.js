const STORAGE_KEY = "madison-dashboard-events-v1";
const WORKOUT_KEY = "madison-dashboard-workouts-v1";
const MAP_REGIONS = {
  sarasota: { label: "Sarasota, FL", center: [27.3364, -82.5307], zoom: 12 },
  "bay-area": { label: "San Francisco Bay Area", center: [37.76, -122.34], zoom: 9.5 },
};

const seedEvents = [
  { id: "seed-1", title: "A slow morning at Project Coffee", category: "restaurant", date: "2026-08-16", region: "sarasota", lat: 27.3364, lng: -82.5307, location: "Downtown Sarasota", description: "Coffee, a window seat, and nowhere to be in a hurry. A little reminder to leave some breathing room in the weekend.", images: [], links: [], seed: true },
  { id: "seed-8", title: "A late-summer gallery afternoon", category: "event", date: "2026-08-29", region: "sarasota", lat: 27.3425, lng: -82.5483, location: "Towles Court, Sarasota", description: "A sample city memory to show how event pins appear in the August starting view. Replace this starter entry with one of your own.", images: [], links: [], seed: true },
  { id: "seed-2", title: "An evening at SFMOMA", category: "event", date: "2026-09-12", region: "bay-area", lat: 37.7857, lng: -122.4011, location: "South of Market, San Francisco", description: "An unhurried visit through the galleries. Save a note here about the exhibit or the piece you want to remember.", images: [], links: [], seed: true },
  { id: "seed-3", title: "Dinner in downtown Sarasota", category: "restaurant", date: "2026-10-03", region: "sarasota", lat: 27.3375, lng: -82.5433, location: "Downtown Sarasota", description: "A cozy neighborhood dinner worth putting on the list for next time.", images: [], links: [], seed: true },
  { id: "seed-4", title: "Sunday in Golden Gate Park", category: "event", date: "2026-11-08", region: "bay-area", lat: 37.7694, lng: -122.4862, location: "Golden Gate Park, San Francisco", description: "A little city wandering, fresh air, and a pause between plans.", images: [], links: [], seed: true },
  { id: "seed-5", title: "Dinner on St. Armands Circle", category: "restaurant", date: "2027-02-20", region: "sarasota", lat: 27.3166, lng: -82.5795, location: "St. Armands Circle, Sarasota", description: "A lively dinner and a good one to remember. Add your own places and memories whenever you're ready.", images: [], links: [], seed: true },
  { id: "seed-6", title: "An evening by Lake Merritt", category: "event", date: "2027-04-10", region: "bay-area", lat: 37.8021, lng: -122.258, location: "Oakland, California", description: "An evening out by the lake. Your city atlas is ready for its first real memories.", images: [], links: [], seed: true },
  { id: "seed-7", title: "Lunch near the Ferry Building", category: "restaurant", date: "2027-06-05", region: "bay-area", lat: 37.7955, lng: -122.3937, location: "Embarcadero, San Francisco", description: "A sunny lunch stop in a favorite part of town.", images: [], links: [], seed: true },
];

const machineLibrary = [
  { name: "Lat pulldown", muscles: "Lats · biceps · upper back" },
  { name: "Seated row", muscles: "Mid-back · lats · rear delts" },
  { name: "Chest press", muscles: "Chest · triceps · front delts" },
  { name: "Leg press", muscles: "Quads · glutes · hamstrings" },
  { name: "Leg curl", muscles: "Hamstrings · calves" },
  { name: "Shoulder press", muscles: "Delts · triceps · upper chest" },
];
const workoutTemplates = [
  { name: "Upper body", detail: "4 machines · 35–45 min", exercises: ["Lat pulldown", "Seated row", "Chest press", "Shoulder press"] },
  { name: "Lower body", detail: "3 machines · 30–40 min", exercises: ["Leg press", "Leg curl", "Seated row"] },
  { name: "Full body", detail: "5 machines · 45–55 min", exercises: ["Leg press", "Chest press", "Lat pulldown", "Leg curl", "Shoulder press"] },
];
const starterLogs = [
  { date: "2026-11-03", name: "Upper body", duration: 38 },
  { date: "2026-11-06", name: "Lower body", duration: 34 },
  { date: "2026-11-10", name: "Full body", duration: 46 },
];
const sampleMuscleBalance = [
  ["Back", 76], ["Chest", 62], ["Quads", 59], ["Glutes", 54], ["Shoulders", 48], ["Hamstrings", 43], ["Arms", 39],
];
const machineTrends = [
  ["Lat pulldown", "+8%", "steady"], ["Leg press", "+5%", "steady"], ["Chest press", "+3%", "building"], ["Seated row", "+6%", "steady"],
];

let events = loadEvents();
let workoutLogs = loadWorkoutLogs();
let activeWorkout = null;
let activeFilter = "all";
let selectedEventId = null;
let hoveredEventId = null;
let selectedSeason = "all";
let monthOffset = 0;
let monthLocked = false;
let fitnessView = "library";
let calendarDate = new Date();
let activeRegion = "sarasota";
let leafletMap = null;
let markerLayer = null;
let pendingCoordinates = null;
let pendingMarker = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored)) return [...seedEvents, ...stored.filter((item) => !String(item.id).startsWith("seed-")).map(normalizeEvent)];
  } catch (error) {
    console.warn("Could not load saved city pins.", error);
  }
  return seedEvents.map((event) => ({ ...event }));
}
function normalizeEvent(event) {
  const inferredRegion = /bay area|san francisco|oakland|berkeley/i.test(event.location || "") ? "bay-area" : "sarasota";
  const region = MAP_REGIONS[event.region] ? event.region : inferredRegion;
  const center = MAP_REGIONS[region].center;
  return { ...event, region, lat: Number(event.lat) || center[0], lng: Number(event.lng) || center[1] };
}
async function persistEvents(places) {
  const response = await fetch('/api/voyage/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Could not save places to voyage/public/data.json. Make sure the local server is running.');
  return (await response.json()).places;
}
async function loadVoyagePlaces() {
  try {
    const response = await fetch('/api/voyage/places', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Voyage server unavailable');
    let places = (await response.json()).places;
    const legacy = events.filter((place) => !place.seed);
    if (legacy.length) places = await persistEvents(legacy);
    events = [...seedEvents, ...places.map(normalizeEvent)];
    localStorage.removeItem(STORAGE_KEY);
    $('#voyage-save-status').textContent = 'Places saved on this Mac';
    renderEvents();
  } catch (error) {
    $('#voyage-save-status').textContent = 'File storage offline. Start python3 server.py and reload. Browser-saved places remain available.';
    console.warn('Could not load Voyage file storage.', error);
  }
}
function loadWorkoutLogs() {
  try {
    const stored = JSON.parse(localStorage.getItem(WORKOUT_KEY));
    if (Array.isArray(stored)) return [...starterLogs, ...stored];
  } catch (error) {
    console.warn("Could not load saved workouts.", error);
  }
  return starterLogs.map((log) => ({ ...log }));
}
function persistWorkoutLogs() {
  localStorage.setItem(WORKOUT_KEY, JSON.stringify(workoutLogs.filter((log) => !starterLogs.some((seed) => seed.date === log.date && seed.name === log.name))));
}
function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function safeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}
function escapeHtml(text = "") {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function formatDate(dateString, options = { month: "long", day: "numeric", year: "numeric" }) {
  const date = new Date(`${dateString}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "Date to be added" : date.toLocaleDateString(undefined, options);
}
function monthAtOffset(offset) {
  return (7 + offset + 12) % 12;
}
function seasonForMonth(month) {
  if ([7, 8, 9].includes(month)) return "fall";
  if ([10, 11, 0].includes(month)) return "winter";
  if ([1, 2, 3].includes(month)) return "spring";
  return "summer";
}
function monthNames(style = "long") {
  return Array.from({ length: 12 }, (_, index) => new Date(2026, index, 1).toLocaleDateString(undefined, { month: style }));
}
function filteredEvents() {
  let result = [...events];
  if (activeFilter !== "all") result = result.filter((event) => event.category === activeFilter);
  if (activeFilter === "event" && selectedSeason !== "all") {
    const selectedMonth = monthAtOffset(monthOffset);
    result = result.filter((event) => {
      const date = new Date(`${event.date}T12:00:00`);
      if (Number.isNaN(date.getTime()) || seasonForMonth(date.getMonth()) !== selectedSeason) return false;
      return !monthLocked || date.getMonth() === selectedMonth;
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
function dateParts(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return { day: Number.isNaN(date.getTime()) ? "—" : date.getDate(), month: Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { month: "short" }).toUpperCase() };
}

function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  $("#greeting").textContent = greeting;
  $("#today-label").textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  $("#date-day").textContent = now.toLocaleDateString(undefined, { weekday: "long" });
  $("#date-full").textContent = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  $("#weekday-label").textContent = now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();
}

function switchView(viewName) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  $("#topbar-section").textContent = viewName.toUpperCase();
  if (viewName === "voyage") {
    renderEvents();
    initializeLeafletMap();
    requestAnimationFrame(() => {
      leafletMap?.invalidateSize();
      leafletMap?.setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom);
      renderMapPins(regionEvents());
    });
  }
  if (viewName === "vitality") renderFitness();
}

function renderFitness() {
  const content = $("#fitness-content");
  $$(".fitness-tab").forEach((tab) => {
    const selected = tab.dataset.fitness === fitnessView;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  if (fitnessView === "library") content.innerHTML = renderLibrary();
  if (fitnessView === "calendar") content.innerHTML = renderCalendar();
  if (fitnessView === "active") content.innerHTML = renderActiveWorkout();
  if (fitnessView === "results") content.innerHTML = renderResults();
  bindFitnessActions();
}
function renderLibrary() {
  return `<div class="fitness-pane-head"><div><div class="eyebrow">YOUR STARTER LIBRARY</div><h3>Machines &amp; templates</h3><p>Starter examples based on common gym machines. Edit these to match your own equipment and training sheet.</p></div><span class="tag">DEMO DATA</span></div>
    <div class="fitness-layout"><div><div class="eyebrow" style="margin-bottom:9px">MACHINES · MUSCLE GROUPS</div><div class="machine-list">${machineLibrary.map((machine, index) => `<div class="machine-row"><span class="machine-index">${String(index + 1).padStart(2, "0")}</span><span class="machine-info"><strong>${escapeHtml(machine.name)}</strong><small>Saved machine</small></span><span class="machine-muscle">${escapeHtml(machine.muscles)}</span></div>`).join("")}</div></div>
      <div><div class="eyebrow" style="margin-bottom:9px">SAVED WORKOUT TEMPLATES</div><div class="template-list">${workoutTemplates.map((template, index) => `<div class="template-row"><span class="template-info"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.detail)}</small></span><button data-start-template="${index}">START ↗</button></div>`).join("")}</div><p style="margin:12px 0 0;color:#777;font-size:8px;text-align:left;line-height:1.7">For your recorded exercise list, open the linked starter sheet in the Fitness results section.</p></div></div>`;
}
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());
  const monthLogs = workoutLogs.filter((log) => log.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`));
  const workedDays = new Set(monthLogs.map((log) => Number(log.date.slice(-2))));
  const dayCells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (dayCells.length % 7) dayCells.push(null);
  return `<div class="fitness-pane-head"><div><div class="eyebrow">CONSISTENCY, NOT PERFECTION</div><h3>Your workout calendar</h3><p>Log a session in Active workout and it will show up here.</p></div><button class="small-action" data-fitness="active">＋ LOG A WORKOUT</button></div>
    <div class="calendar-top"><button data-calendar-shift="-1" aria-label="Previous month">←</button><strong>${calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button data-calendar-shift="1" aria-label="Next month">→</button></div>
    <div class="calendar-grid">${["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span class="calendar-day-label">${day}</span>`).join("")}${dayCells.map((day) => {
      if (!day) return `<span class="calendar-day empty"></span>`;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return `<span class="calendar-day ${workedDays.has(day) ? "worked" : ""} ${key === todayKey ? "today" : ""}">${day}</span>`;
    }).join("")}</div>
    <div class="calendar-log">${monthLogs.length ? monthLogs.map((log) => `<div class="calendar-session"><span>◌</span><strong>${escapeHtml(log.name)}</strong><span>${formatDate(log.date, { month: "short", day: "numeric" })} · ${Number(log.duration) || 0} min</span></div>`).join("") : `<div class="calendar-session"><span>◌</span><strong>No sessions logged this month</strong><span>Start whenever you're ready.</span></div>`}</div>`;
}
function renderActiveWorkout() {
  if (!activeWorkout) return `<div class="fitness-pane-head"><div><div class="eyebrow">NO RUSH, NO STREAK TO KEEP</div><h3>Ready when you are.</h3><p>Pick a saved template or begin with a blank session. Workout tracking is stored in this browser.</p></div><span class="tag">PRIVATE LOG</span></div><div class="template-list">${workoutTemplates.map((template, index) => `<div class="template-row"><span class="template-info"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.detail)}</small></span><button data-start-template="${index}">START WORKOUT ↗</button></div>`).join("")}</div><button class="small-action" style="margin-top:11px" data-start-template="-1">START A BLANK WORKOUT ＋</button>`;
  const elapsed = Math.max(1, Math.round((Date.now() - activeWorkout.startedAt) / 60000));
  return `<div class="fitness-pane-head"><div><div class="eyebrow">IN PROGRESS · ${elapsed} MIN</div><h3>${escapeHtml(activeWorkout.name)}</h3><p>Change sets and weights as you go, then finish the session to add it to your calendar.</p></div><span class="tag">TODAY</span></div><div class="active-workout-head"><div><strong>Session notes</strong><small>${activeWorkout.exercises.length} movements · started ${new Date(activeWorkout.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div><span class="status-dot"></span></div><div class="workout-sets">${activeWorkout.exercises.map((exercise, index) => `<div class="workout-set"><span>${escapeHtml(exercise)}</span><span>Sets <input aria-label="Sets for ${escapeHtml(exercise)}" type="number" min="1" max="10" value="3" /></span><span>Reps <input aria-label="Reps for ${escapeHtml(exercise)}" type="number" min="1" max="50" value="10" /></span><span>Load <input aria-label="Load for ${escapeHtml(exercise)}" type="number" min="0" max="999" placeholder="—" /></span></div>`).join("")}</div><div class="workout-actions"><button class="button-primary" data-complete-workout>FINISH WORKOUT ✓</button><button class="button-quiet" data-cancel-workout>CANCEL</button></div>`;
}
function renderResults() {
  return `<div class="fitness-pane-head"><div><div class="eyebrow">A BALANCED VIEW OF YOUR WORK</div><h3>Strength, over time</h3><p>Illustrative starter estimates only. Replace them with your logged sets and exercise-machine results.</p></div><a class="button-quiet" href="https://docs.google.com/spreadsheets/d/1ZrKmhuijHuqvMnU4HpC_AG9-UEum2fO3PlOQjgmqvuY/edit?gid=524723206#gid=524723206" target="_blank" rel="noreferrer">OPEN FITNESS SOURCE SHEET ↗</a></div><div class="fitness-layout"><div><div class="eyebrow" style="margin-bottom:14px">WORK DISTRIBUTION BY MUSCLE GROUP</div><div class="progress-list">${sampleMuscleBalance.map(([muscle, percent]) => `<div class="progress-row"><span>${muscle}</span><span class="progress-track"><i style="width:${percent}%"></i></span><strong>${percent}%</strong></div>`).join("")}</div><div class="trend-caption"><span>Relative share of example training volume</span><span>LAST 4 WEEKS · SAMPLE</span></div></div><div><div class="eyebrow" style="margin-bottom:14px">MACHINE TRENDS</div><div class="machine-list">${machineTrends.map(([machine, change, note]) => `<div class="machine-row"><span class="machine-index">↗</span><span class="machine-info"><strong>${machine}</strong><small>${note} · example trend</small></span><span class="machine-muscle">${change}</span></div>`).join("")}</div><div class="trend-caption"><span>Change in working load</span><span>ILLUSTRATIVE</span></div></div></div>`;
}
function bindFitnessActions() {
  const content = $("#fitness-content");
  $$('[data-start-template]').forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.startTemplate);
    const template = workoutTemplates[index];
    activeWorkout = { name: template ? template.name : "Open session", exercises: template ? [...template.exercises] : ["Lat pulldown", "Leg press"], startedAt: Date.now() };
    fitnessView = "active";
    renderFitness();
  }));
  $$('[data-fitness]', content).forEach((button) => button.addEventListener("click", () => {
    fitnessView = button.dataset.fitness;
    renderFitness();
  }));
  $$('[data-calendar-shift]').forEach((button) => button.addEventListener("click", () => {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + Number(button.dataset.calendarShift), 1);
    renderFitness();
  }));
  const complete = $(`[data-complete-workout]`);
  if (complete) complete.addEventListener("click", () => {
    const duration = Math.max(1, Math.round((Date.now() - activeWorkout.startedAt) / 60000));
    workoutLogs.push({ date: localDateKey(new Date()), name: activeWorkout.name, duration });
    persistWorkoutLogs();
    activeWorkout = null;
    fitnessView = "calendar";
    renderFitness();
  });
  const cancel = $(`[data-cancel-workout]`);
  if (cancel) cancel.addEventListener("click", () => { activeWorkout = null; renderFitness(); });
}

function regionEvents() {
  return filteredEvents().filter((event) => event.region === activeRegion);
}
function renderEvents() {
  const visibleEvents = regionEvents();
  const visibleIds = new Set(visibleEvents.map((event) => event.id));
  if (selectedEventId && !visibleIds.has(selectedEventId)) selectedEventId = null;
  if (hoveredEventId && !visibleIds.has(hoveredEventId)) hoveredEventId = null;
  const activeEvent = events.find((event) => event.id === (selectedEventId || hoveredEventId));
  $("#month-control").hidden = activeFilter !== "event";
  $("#map-count-label").textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? "PLACE" : "PLACES"}`;
  $("#list-count").textContent = `${visibleEvents.length} ${visibleEvents.length === 1 ? "ENTRY" : "ENTRIES"}`;
  renderMapPins(visibleEvents);
  $("#event-list").innerHTML = visibleEvents.length ? visibleEvents.map((event) => {
    const { day, month } = dateParts(event.date);
    return `<div class="event-list-row ${selectedEventId === event.id ? "selected" : ""}" role="button" tabindex="0" data-list-event="${escapeHtml(event.id)}"><span class="list-date">${day}<small>${month}</small></span><span class="list-title"><strong>${escapeHtml(event.title)}</strong><small>${formatDate(event.date)}${event.seed ? " · STARTER EXAMPLE" : ""}</small></span><span class="list-location">${escapeHtml(event.location || "Location not added")}</span><span class="list-category">${event.category}</span><span class="list-arrow">↗</span></div>`;
  }).join("") : `<div class="event-list-empty">Nothing in this slice of the year yet. Save a moment and it will appear here.</div>`;
  renderEventPreview(activeEvent && visibleIds.has(activeEvent.id) ? activeEvent : null);
  bindEventSelection();
}
function initializeLeafletMap() {
  const container = $("#leaflet-map");
  if (leafletMap) {
    requestAnimationFrame(() => leafletMap.invalidateSize());
    return;
  }
  if (!window.L) {
    container.innerHTML = `<div class="map-load-error">The map library could not load. Check your internet connection and refresh.</div>`;
    return;
  }
  container.setAttribute("aria-label", `Interactive grayscale map of ${MAP_REGIONS[activeRegion].label}`);
  leafletMap = L.map(container, { zoomControl: false, zoomSnap: 0.5, minZoom: 7, maxZoom: 16 }).setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom);
  markerLayer = L.layerGroup().addTo(leafletMap);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16,
    attribution: "Tiles &copy; Esri &middot; HERE, Garmin, OpenStreetMap contributors, and the GIS user community",
  }).addTo(leafletMap);
  leafletMap.on("click", (event) => {
    pendingCoordinates = { region: activeRegion, lat: event.latlng.lat, lng: event.latlng.lng };
    if (pendingMarker) pendingMarker.remove();
    pendingMarker = L.circleMarker(event.latlng, { radius: 8, color: "#fff", weight: 2, fillColor: "#171717", fillOpacity: 1 }).addTo(leafletMap);
    pendingMarker.bindTooltip("Next saved place", { direction: "top", offset: [0, -8] }).openTooltip();
  });
  renderMapPins(regionEvents());
}
function renderMapPins(mapEvents) {
  if (!markerLayer || !window.L) return;
  markerLayer.clearLayers();
  mapEvents.forEach((event) => {
    const marker = L.marker([Number(event.lat), Number(event.lng)], {
      icon: L.divIcon({
        className: "event-map-marker",
        html: `<span class="map-pin-dot ${event.category} ${selectedEventId === event.id ? "selected" : ""}"></span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      title: event.title,
      alt: `${event.title}, ${event.category}`,
    }).addTo(markerLayer);
    marker.bindTooltip(escapeHtml(event.title), { direction: "top", offset: [0, -10] });
    marker.on("add", () => {
      const markerElement = marker.getElement();
      if (markerElement) markerElement.setAttribute("role", "button");
    });
    marker.on("mouseover", () => {
      hoveredEventId = event.id;
      renderEventPreview(event);
    });
    marker.on("mouseout", () => {
      hoveredEventId = null;
      renderEventPreview(events.find((item) => item.id === selectedEventId) || null);
    });
    marker.on("click", () => {
      selectedEventId = selectedEventId === event.id ? null : event.id;
      hoveredEventId = null;
      renderEvents();
    });
  });
}
function renderEventPreview(event) {
  const preview = $("#event-preview");
  if (!event) {
    preview.innerHTML = `<div class="preview-placeholder"><span class="preview-orbit">◌</span><div class="eyebrow">A PLACE, A MOMENT</div><h3>Follow a little curiosity.</h3><p>Hover over a pin to preview a memory. Click to keep it here while you explore. Your own places can join the map below.</p></div>`;
    return;
  }
  const image = (event.images || []).map(safeUrl).find(Boolean);
  const links = (event.links || []).map(safeUrl).filter(Boolean);
  preview.innerHTML = `<div class="preview-card">${image ? `<img class="preview-image" src="${escapeHtml(image)}" alt="${escapeHtml(event.title)}" />` : `<div class="preview-image empty" aria-label="No image added">◌</div>`}<div class="preview-copy"><span class="preview-badge">${escapeHtml(event.category)}${event.seed ? " · EXAMPLE" : ""}</span><h3>${escapeHtml(event.title)}</h3><div class="preview-meta">${formatDate(event.date)}<br />${escapeHtml(event.location || "Location not added")}</div><p>${escapeHtml(event.description || "No description yet.")}</p>${links.length ? `<div class="preview-links">${links.map((link, index) => `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">LINK ${index + 1} ↗</a>`).join("")}</div>` : ""}</div><div class="preview-foot"><span>${selectedEventId === event.id ? "PINNED PREVIEW" : "HOVER PREVIEW"}</span><button data-pin-preview="${escapeHtml(event.id)}">${selectedEventId === event.id ? "UNPIN ×" : "KEEP OPEN ↗"}</button></div></div>`;
  const pinButton = $(`[data-pin-preview]`, preview);
  pinButton.addEventListener("click", () => {
    selectedEventId = selectedEventId === event.id ? null : event.id;
    hoveredEventId = null;
    renderEvents();
  });
}
function bindEventSelection() {
  $$('[data-list-event]').forEach((row) => {
    const select = () => { selectedEventId = row.dataset.listEvent; hoveredEventId = null; renderEvents(); };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
  });
}
function setMonthOffset(value) {
  monthOffset = Math.min(11, Math.max(0, Number(value)));
  monthLocked = true;
  const month = monthAtOffset(monthOffset);
  const monthName = monthNames()[month];
  $("#month-current").textContent = monthName.toUpperCase();
  $("#month-slider").value = monthOffset;
  selectedSeason = seasonForMonth(month);
  $$(".season-pill").forEach((button) => button.classList.toggle("active", button.dataset.season === selectedSeason));
  renderEvents();
}
function initEvents() {
  $$('[data-close-event]').forEach((button) => button.addEventListener('click', () => $('#event-dialog').close()));
  $$(".region-btn").forEach((button) => button.addEventListener("click", () => {
    activeRegion = button.dataset.region;
    $$(".region-btn").forEach((item) => item.classList.toggle("active", item === button));
    $("#leaflet-map").setAttribute("aria-label", `Interactive grayscale map of ${MAP_REGIONS[activeRegion].label}`);
    selectedEventId = null;
    hoveredEventId = null;
    pendingCoordinates = null;
    if (pendingMarker) { pendingMarker.remove(); pendingMarker = null; }
    if (leafletMap) leafletMap.setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom);
    renderEvents();
  }));
  $$(".category-btn").forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    $$(".category-btn").forEach((item) => item.classList.toggle("active", item === button));
    if (activeFilter === "event") setMonthOffset(0);
    else { selectedSeason = "all"; monthLocked = false; renderEvents(); }
  }));
  $$(".season-pill").forEach((button) => button.addEventListener("click", () => {
    selectedSeason = button.dataset.season;
    monthLocked = false;
    $$(".season-pill").forEach((item) => item.classList.toggle("active", item === button));
    if (selectedSeason !== "all") {
      const seasonStart = { fall: 0, winter: 3, spring: 6, summer: 9 }[selectedSeason];
      monthOffset = seasonStart;
      $("#month-slider").value = monthOffset;
      $("#month-current").textContent = monthNames()[monthAtOffset(monthOffset)].toUpperCase();
    }
    renderEvents();
  }));
  $("#month-slider").addEventListener("input", (event) => setMonthOffset(event.target.value));
  $("#clear-selection").addEventListener("click", () => { selectedEventId = null; hoveredEventId = null; renderEvents(); });
  $("#zoom-in").addEventListener("click", () => leafletMap?.zoomIn());
  $("#zoom-out").addEventListener("click", () => leafletMap?.zoomOut());
  $("#map-reset").addEventListener("click", () => leafletMap?.setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom));
  $("#add-event-button").addEventListener("click", () => {
    const form = $("#event-form");
    form.reset();
    $("#voyage-save-error").textContent = "";
    form.elements.date.value = localDateKey(new Date());
    form.elements.region.value = activeRegion;
    const coordinates = pendingCoordinates?.region === activeRegion ? pendingCoordinates : { region: activeRegion, lat: MAP_REGIONS[activeRegion].center[0], lng: MAP_REGIONS[activeRegion].center[1] };
    form.elements.lat.value = coordinates.lat.toFixed(4);
    form.elements.lng.value = coordinates.lng.toFixed(4);
    $("#event-dialog").showModal();
  });
  $("#event-form").elements.region.addEventListener("change", (event) => {
    const center = MAP_REGIONS[event.target.value].center;
    $("#event-form").elements.lat.value = center[0].toFixed(4);
    $("#event-form").elements.lng.value = center[1].toFixed(4);
  });
  $("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.querySelector('[type="submit"]').disabled) return;
    const value = new FormData(form);
    const newEvent = {
      id: `saved-${crypto.randomUUID()}`,
      title: String(value.get("title")).trim(),
      category: String(value.get("category")),
      date: String(value.get("date")),
      region: String(value.get("region")),
      lat: Number(value.get("lat")),
      lng: Number(value.get("lng")),
      location: String(value.get("location")).trim(),
      description: String(value.get("description")).trim(),
      images: String(value.get("images")).split(/\n|,/).map((item) => item.trim()).filter((item) => safeUrl(item)),
      links: String(value.get("links")).split(/\n|,/).map((item) => item.trim()).filter((item) => safeUrl(item)),
      seed: false,
    };
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await voyageReady;
      const places = await persistEvents([newEvent]);
      events = [...seedEvents, ...places.map(normalizeEvent)];
      $('#voyage-save-status').textContent = 'Place saved on this Mac';
    } catch (error) {
      $('#voyage-save-error').textContent = error.message || 'Could not save this place. Please retry.';
      return;
    } finally {
      submit.disabled = false;
    }
    activeRegion = newEvent.region;
    $$(".region-btn").forEach((button) => button.classList.toggle("active", button.dataset.region === activeRegion));
    if (leafletMap) leafletMap.setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom);
    pendingCoordinates = null;
    if (pendingMarker) { pendingMarker.remove(); pendingMarker = null; }
    activeFilter = newEvent.category;
    $$(".category-btn").forEach((button) => button.classList.toggle("active", button.dataset.filter === activeFilter));
    selectedSeason = "all";
    monthLocked = false;
    selectedEventId = newEvent.id;
    $("#event-dialog").close();
    renderEvents();
    if (activeFilter === "event") {
      const offset = (new Date(`${newEvent.date}T12:00:00`).getMonth() - 7 + 12) % 12;
      setMonthOffset(offset);
      selectedSeason = "all";
      $$(".season-pill").forEach((button) => button.classList.toggle("active", button.dataset.season === "all"));
      renderEvents();
    }
  });
}

$$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$$(".fitness-tab").forEach((button) => button.addEventListener("click", () => { fitnessView = button.dataset.fitness; renderFitness(); }));
updateClock();
renderFitness();
initEvents();
renderEvents();

// Read only the yearly goal lists through the local Obsidian bridge.
let obsidianRequestPending = false;
async function refreshObsidianGoals() {
  if (obsidianRequestPending || document.hidden) return;
  obsidianRequestPending = true;
  const status = $('#obsidian-status');
  try {
    const response = await fetch('/api/obsidian/goals', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Obsidian bridge unavailable');
    const data = await response.json();
    if (!Array.isArray(data.sections)) throw new Error('Invalid goals response');
    const sections = [...data.sections].sort((a, b) => b.year - a.year);
    const section = sections.find((item) => item.year === new Date().getFullYear()) || sections[0];
    const goals = section?.goals || [];
    const done = goals.filter((goal) => goal.done).length;
    $('#obsidian-year').textContent = section ? `YOUR ${section.year} INTENTIONS` : 'YOUR INTENTIONS';
    $('#obsidian-count').innerHTML = `${done} <small>done</small>`;
    $('#obsidian-goals').innerHTML = goals.length ? goals.map((goal) => `<div class="goal-row"><span class="check-mark">${goal.done ? '✓' : '○'}</span><span>${escapeHtml(goal.text)}</span><span class="goal-state">${goal.done ? 'DONE' : 'TO DO'}</span></div>`).join('') : '<p>No yearly goals found in your note.</p>';
    $('#obsidian-summary').textContent = section ? `${done} of ${goals.length} goals complete for ${section.year}. Edits in Obsidian appear here automatically.` : 'Add a year heading such as “2026 Goals” followed by a goal list in your note.';
    const link = `obsidian://open?vault=${encodeURIComponent(data.vault)}&file=${encodeURIComponent(data.source)}`;
    $$('.note-card a, .goals-foot a').forEach((anchor) => { anchor.href = link; });
    status.textContent = 'CONNECTED · REFRESHES EVERY 5S';
    status.title = `Note updated ${new Date(data.modified * 1000).toLocaleString()}`;
  } catch {
    status.textContent = 'OFFLINE · LOCAL SERVER REQUIRED';
    $('#obsidian-summary').textContent = 'Obsidian is disconnected. Run python3 server.py in the Voruva folder and open http://127.0.0.1:8000. Any goals still displayed are from the last successful refresh.';
  } finally {
    obsidianRequestPending = false;
  }
}
refreshObsidianGoals();
setInterval(refreshObsidianGoals, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshObsidianGoals(); });

const voyageReady = loadVoyagePlaces();
