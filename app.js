const STORAGE_KEY = "madison-dashboard-events-v1";
const WORKOUT_KEY = "madison-dashboard-workouts-v1";
const FITNOTES_KEY = "madison-dashboard-fitnotes-v1";
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
const fallbackVoyageStore = {
  mode: "local",
  async session() {
    return null;
  },
  async load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      console.warn("Could not load local city pins.", error);
      return [];
    }
  },
  async save(places) {
    const sanitized = Array.isArray(places) ? places : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    return sanitized;
  },
  async signIn() {
    throw new Error("Local-only mode: sign-in is unavailable in this version.");
  },
  async signOut() {
    return null;
  },
};
window.voyageStoreReady ??= Promise.resolve(fallbackVoyageStore);

let events = loadEvents();
let workoutLogs = loadWorkoutLogs();
let fitNotesLoadError = "";
let fitNotesData = loadFitNotesData();
let activeWorkout = null;
let activeFilter = "all";
let selectedEventId = null;
let hoveredEventId = null;
let selectedSeason = "all";
let monthOffset = 0;
let monthLocked = false;
let fitnessView = "library";
let selectedExerciseId = "";
let selectedMuscleId = "";
let progressionView = "selected";
let weeklyVolumeView = "timeline";
let fitNotesStatus = fitNotesData.workouts.length
  ? "Loaded saved FitNotes data from this browser."
  : "Import a FitNotes .fnw backup to create your training charts.";
let fitNotesError = "";
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
  return { ...event, region, lat: Number.isFinite(Number(event.lat)) && event.lat != null && event.lat !== "" ? Number(event.lat) : center[0], lng: Number.isFinite(Number(event.lng)) && event.lng != null && event.lng !== "" ? Number(event.lng) : center[1] };
}
async function persistEvents(places) {
  const store = await window.voyageStoreReady;
  return store.save(places);
}
async function loadVoyagePlaces() {
  try {
    const store = await window.voyageStoreReady;
    $('#voyage-login').hidden = store.mode !== 'cloud';
    if (store.mode === 'cloud') {
      const session = await store.session();
      $('#voyage-login-fields').hidden = !!session;
      $('#voyage-sign-out').hidden = !session;
      $('#voyage-import-label').hidden = !session;
      if (!session) {
        events = seedEvents.map((place) => ({ ...place }));
        renderEvents();
        $('#voyage-save-status').textContent = 'Sign in to see and save your places across devices.';
        return;
      }
    }
    let places = await store.load();
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(legacy)) {
      const saved = legacy.filter((place) => !place.seed && !String(place.id).startsWith('seed-')).map(normalizeEvent);
      if (saved.length) places = await store.save(saved);
      localStorage.removeItem(STORAGE_KEY);
    }
    events = [...seedEvents, ...places.map(normalizeEvent)];
    $('#voyage-save-status').textContent = store.mode === 'cloud' ? 'Your places are synced across devices.' : 'Places saved on this Mac';
    renderEvents();
  } catch (error) {
    $('#voyage-save-status').textContent = error.message || 'Could not connect to saved places. Please retry.';
    console.warn('Could not load Voyage storage.', error);
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
function loadFitNotesData() {
  try {
    const stored = JSON.parse(localStorage.getItem(FITNOTES_KEY));
    if (stored == null) return window.fitNotesAnalytics.emptyData();
    if (!Array.isArray(stored.categories) || !Array.isArray(stored.exercises) || !Array.isArray(stored.workouts)) {
      throw new Error("Saved FitNotes data is incomplete. Import your backup again.");
    }
    return stored;
  } catch (error) {
    fitNotesLoadError = error.message || "Could not read saved FitNotes data.";
    console.warn("Could not load saved FitNotes data.", error);
    return window.fitNotesAnalytics.emptyData();
  }
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
  if (viewName === "roam") {
    renderEvents();
    initializeLeafletMap();
    requestAnimationFrame(() => {
      leafletMap?.invalidateSize();
      leafletMap?.setView(MAP_REGIONS[activeRegion].center, MAP_REGIONS[activeRegion].zoom);
      renderMapPins(regionEvents());
    });
  }
  if (viewName === "renew") renderFitness();
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
      <div><div class="eyebrow" style="margin-bottom:9px">SAVED WORKOUT TEMPLATES</div><div class="template-list">${workoutTemplates.map((template, index) => `<div class="template-row"><span class="template-info"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.detail)}</small></span><button data-start-template="${index}">START ↗</button></div>`).join("")}</div><p style="margin:12px 0 0;color:#777;font-size:8px;text-align:left;line-height:1.7">For exercises from your own log, import a FitNotes backup in the Insights section.</p></div></div>`;
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
  const summary = window.fitNotesAnalytics.summarize(fitNotesData);
  const selectedExercise = summary.exercises.find((exercise) => exercise.id === selectedExerciseId) ||
    summary.exercises.find((exercise) => exercise.points.length) ||
    summary.exercises[0];
  if (selectedExercise) selectedExerciseId = selectedExercise.id;
  const selectedMuscle = summary.muscles.find((muscle) => muscle.id === selectedMuscleId) || summary.muscles[0];
  if (selectedMuscle) selectedMuscleId = selectedMuscle.id;
  const status = fitNotesLoadError || fitNotesStatus;
  return `<div class="fitness-pane-head"><div><div class="eyebrow">YOUR FITNOTES TRAINING</div><h3>Strength, over time</h3><p>Charts use completed sets from your imported FitNotes backups. Your data stays in this browser.</p></div><div class="fitnotes-import-actions"><input class="fitnotes-file-input" id="fitnotes-file" type="file" accept=".fnw,.json,application/json" /><button class="button-primary" type="button" data-open-fitnotes>IMPORT FITNOTES BACKUP <span>↥</span></button>${fitNotesData.workouts.length ? `<button class="button-quiet" type="button" data-clear-fitnotes> CLEAR IMPORTED DATA</button>` : ""}</div></div>
    <div class="fitnotes-import-status" role="status">${escapeHtml(status)}</div>${fitNotesError ? `<p class="fitnotes-import-error" role="alert">${escapeHtml(fitNotesError)}</p>` : ""}
    ${summary.workoutCount ? renderFitnessInsights(summary, selectedExercise, selectedMuscle) : `<div class="fitnotes-empty"><span class="preview-orbit">◌</span><h4>Your training will show up here.</h4><p>Import a FitNotes <code>.fnw</code> backup to see your muscle-group split, weekly sets, and exercise progress.</p></div>`}`;
}
function renderFitnessInsights(summary, selectedExercise, selectedMuscle) {
  const range = `${formatDate(summary.firstDate, { month: "short", day: "numeric", year: "numeric" })} – ${formatDate(summary.lastDate, { month: "short", day: "numeric", year: "numeric" })}`;
  const exerciseOptions = summary.exercises.map((exercise) =>
    `<option value="${escapeHtml(exercise.id)}" ${exercise.id === selectedExercise?.id ? "selected" : ""}>${escapeHtml(exercise.name)}</option>`
  ).join("");
  const muscleOptions = summary.muscles.map((muscle) =>
    `<option value="${escapeHtml(muscle.id)}" ${muscle.id === selectedMuscle?.id ? "selected" : ""}>${escapeHtml(muscle.name)}</option>`
  ).join("");
  const progressionChart = progressionView === "all"
    ? renderMultiExerciseTrendChart(summary.exercises)
    : progressionView === "muscle"
      ? renderMultiExerciseTrendChart(selectedMuscle.exercises.map((entry) => summary.exercises.find((exercise) => exercise.id === entry.id)).filter(Boolean))
      : renderExerciseTrendChart(selectedExercise);
  const progressionDescription = progressionView === "selected"
    ? "Choose an exercise to see its logged load trend."
    : progressionView === "muscle"
      ? "One chart for all trained exercises in the selected group; multi-tagged exercises appear in each group."
      : "All trained exercises on one chart, normalized to their first logged load.";
  const weeklyVolumeDisplay = weeklyVolumeView === "table"
    ? renderWeeklyMuscleTable(summary.muscles, summary.weeklyActivity)
    : renderWeeklyMuscleTimeline(summary.muscles, summary.weeklyActivity);
  return `<div class="fitness-stat-grid"><div class="fitness-stat"><strong>${summary.workoutCount}</strong><span>WORKOUTS</span></div><div class="fitness-stat"><strong>${summary.totalSets}</strong><span>COMPLETED SETS</span></div><div class="fitness-stat"><strong>${summary.exerciseCount}</strong><span>EXERCISES</span></div><div class="fitness-stat"><strong>${escapeHtml(range)}</strong><span>DATE RANGE</span></div></div>
    <div class="fitness-insight-grid">
      <article class="fitness-insight-card"><div class="fitness-chart-heading"><div><div class="eyebrow">MUSCLE GROUPS</div><h4>Share of training</h4></div><span class="chart-note">TAGGED SETS</span></div>${renderMuscleShareChart(summary.muscles)}</article>
      <article class="fitness-insight-card"><div class="fitness-chart-heading"><div><div class="eyebrow">WEEKLY VOLUME</div><h4>Average sets per week</h4><p>Multi-muscle exercises count in each tagged group.</p></div><span class="chart-note">${summary.weeks.toFixed(1)} WEEKS TRACKED</span></div>${renderWeeklyMuscleChart(summary.muscles)}</article>
      <article class="fitness-insight-card fitness-insight-wide"><div class="fitness-chart-heading"><div><div class="eyebrow">WEEKLY VOLUME</div><h4>Actual sets each week</h4><p>Weekly set counts for each muscle group across the imported date range.</p></div><div class="progression-mode-switch" role="group" aria-label="Weekly volume display">${[["timeline", "TIME SERIES"], ["table", "TABLE"]].map(([view, label]) => `<button type="button" data-weekly-volume-view="${view}" class="${weeklyVolumeView === view ? "active" : ""}" aria-pressed="${weeklyVolumeView === view}">${label}</button>`).join("")}</div></div>${weeklyVolumeDisplay}</article>
      <article class="fitness-insight-card fitness-insight-wide"><div class="fitness-chart-heading"><div><div class="eyebrow">EXERCISE PROGRESSION</div><h4>${progressionView === "selected" ? "Best logged load by workout" : "Exercise load change over time"}</h4><p>${progressionDescription}</p></div><div class="progression-tools"><div class="progression-mode-switch" role="group" aria-label="Exercise progression display">${[["selected", "ONE EXERCISE"], ["all", "SHOW ALL"], ["muscle", "BY MUSCLE GROUP"]].map(([mode, label]) => `<button type="button" data-progression-view="${mode}" class="${progressionView === mode ? "active" : ""}" aria-pressed="${progressionView === mode}">${label}</button>`).join("")}</div>${progressionView === "selected" ? `<label class="exercise-select-label">EXERCISE<select id="exercise-trend-select">${exerciseOptions}</select></label>` : progressionView === "muscle" ? `<label class="exercise-select-label">MUSCLE GROUP<select id="muscle-trend-select">${muscleOptions}</select></label>` : ""}</div></div>${progressionChart}</article>
      <article class="fitness-insight-card fitness-insight-wide"><div class="fitness-chart-heading"><div><div class="eyebrow">CONSISTENCY</div><h4>Workouts per week</h4><p>Completed sessions across your imported history.</p></div><span class="chart-note">${summary.weeklyActivity.length > 12 ? "LATEST 12 WEEKS · MONDAY START" : "WEEK STARTS MONDAY"}</span></div>${renderWeeklyWorkoutChart(summary.weeklyActivity)}</article>
      <article class="fitness-insight-card fitness-insight-wide"><div class="fitness-chart-heading"><div><div class="eyebrow">MOVEMENT MAP</div><h4>Exercises for each muscle group</h4><p>Exercises tagged for multiple groups count in each one.</p></div></div>${renderMuscleFocusList(summary.muscles)}</article>
    </div>`;
}
function renderMuscleShareChart(muscles) {
  if (!muscles.length) return `<p class="chart-empty">No categorized sets in this export.</p>`;
  return `<div class="progress-list insight-progress-list">${muscles.map((muscle) => `<div class="progress-row"><span>${escapeHtml(muscle.name)}</span><span class="progress-track"><i style="width:${Math.min(100, muscle.share)}%"></i></span><strong>${muscle.share.toFixed(1)}%</strong></div>`).join("")}</div><div class="trend-caption"><span>Share of tagged muscle-group sets</span><span>${muscles.length} GROUPS</span></div>`;
}
function renderWeeklyMuscleChart(muscles) {
  if (!muscles.length) return `<p class="chart-empty">Import workouts with completed sets to see weekly volume.</p>`;
  const maximum = Math.max(...muscles.map((muscle) => muscle.setsPerWeek), 1);
  return `<div class="weekly-muscle-list">${muscles.map((muscle) => `<div class="weekly-muscle-row"><span>${escapeHtml(muscle.name)}</span><span class="progress-track"><i style="width:${(muscle.setsPerWeek / maximum) * 100}%"></i></span><strong>${muscle.setsPerWeek.toFixed(1)}</strong></div>`).join("")}</div><div class="trend-caption"><span>Average completed sets per week</span><span>FULL DATE RANGE</span></div>`;
}
function renderWeeklyMuscleTimeline(muscles, weeklyActivity) {
  if (!muscles.length || !weeklyActivity.length) return "";
  const width = 960;
  const height = 290;
  const padding = { top: 20, right: 20, bottom: 42, left: 48 };
  const maximum = Math.max(1, ...weeklyActivity.flatMap((week) => muscles.map((muscle) => week.muscleSets[muscle.id] || 0)));
  const x = (index) => weeklyActivity.length === 1
    ? padding.left + (width - padding.left - padding.right) / 2
    : padding.left + (index / (weeklyActivity.length - 1)) * (width - padding.left - padding.right);
  const y = (sets) => padding.top + ((maximum - sets) / maximum) * (height - padding.top - padding.bottom);
  const ticks = [...new Set([0, Math.ceil(maximum / 2), maximum])];
  const labelIndexes = [...new Set([
    0,
    Math.round((weeklyActivity.length - 1) / 3),
    Math.round(((weeklyActivity.length - 1) * 2) / 3),
    weeklyActivity.length - 1,
  ])];
  return `<svg class="fitness-chart-svg weekly-timeline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly completed set counts over time for each muscle group">
    ${ticks.map((tick) => `<g><line x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid-line"></line><text x="${padding.left - 9}" y="${y(tick) + 3}" text-anchor="end" class="chart-axis-label">${tick}</text></g>`).join("")}
    ${muscles.map((muscle, seriesIndex) => {
      const values = weeklyActivity.map((week) => week.muscleSets[muscle.id] || 0);
      const points = values.map((sets, index) => `${x(index)},${y(sets)}`).join(" ");
      return `<g class="chart-series" data-chart-series="${seriesIndex}"><polyline points="${points}" class="muscle-timeline-line"></polyline>${values.map((sets, index) => `<circle cx="${x(index)}" cy="${y(sets)}" r="2.5" class="muscle-timeline-point"><title>${escapeHtml(muscle.name)} · ${sets} sets · week of ${escapeHtml(formatDate(weeklyActivity[index].weekStart))}</title></circle>`).join("")}</g>`;
    }).join("")}
    ${labelIndexes.map((index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === weeklyActivity.length - 1 ? "end" : "middle"}" class="chart-axis-label">${escapeHtml(formatDate(weeklyActivity[index].weekStart, { month: "short", day: "numeric", year: "2-digit" }))}</text>`).join("")}
  </svg><div class="weekly-timeline-legend">${muscles.map((muscle, index) => `<span class="chart-series-label" data-chart-series="${index}"><i></i>${escapeHtml(muscle.name)}</span>`).join("")}</div>`;
}
function renderWeeklyMuscleTable(muscles, weeklyActivity) {
  if (!muscles.length || !weeklyActivity.length) return `<div class="chart-empty">No weekly set counts to show.</div>`;
  return `<div class="weekly-volume-table-wrap" role="region" aria-label="Weekly completed sets by muscle group" tabindex="0"><table class="weekly-volume-table">
    <thead><tr><th scope="col">WEEK OF</th>${muscles.map((muscle) => `<th scope="col">${escapeHtml(muscle.name)}</th>`).join("")}</tr></thead>
    <tbody>${weeklyActivity.map((week) => `<tr><th scope="row">${escapeHtml(formatDate(week.weekStart, { month: "short", day: "numeric", year: "2-digit" }))}</th>${muscles.map((muscle) => `<td>${week.muscleSets[muscle.id] || 0}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}
function renderExerciseTrendChart(exercise) {
  if (!exercise?.points.length) return `<div class="chart-empty">No working loads recorded for this exercise yet.</div>`;
  const width = 760;
  const height = 220;
  const padding = { top: 18, right: 24, bottom: 38, left: 48 };
  const points = exercise.points;
  const values = points.map((point) => point.load);
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (minimum === maximum) {
    minimum = Math.max(0, minimum - 1);
    maximum += 1;
  }
  const x = (index) => points.length === 1
    ? padding.left + (width - padding.left - padding.right) / 2
    : padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + ((maximum - value) / (maximum - minimum)) * (height - padding.top - padding.bottom);
  const ticks = [maximum, (maximum + minimum) / 2, minimum];
  const line = points.map((point, index) => `${x(index)},${y(point.load)}`).join(" ");
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return `<svg class="fitness-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Best logged load for ${escapeHtml(exercise.name)} over time">
    ${ticks.map((tick) => `<g><line x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid-line"></line><text x="${padding.left - 9}" y="${y(tick) + 3}" text-anchor="end" class="chart-axis-label">${tick.toLocaleString(undefined, { maximumFractionDigits: 1 })}</text></g>`).join("")}
    <polyline points="${line}" class="chart-trend-line"></polyline>
    ${points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.load)}" r="3.5" class="chart-trend-point"><title>${escapeHtml(formatDate(point.date, { month: "short", day: "numeric", year: "numeric" }))}: ${point.load} load</title></circle>`).join("")}
    ${labelIndexes.map((index) => `<text x="${x(index)}" y="${height - 10}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}" class="chart-axis-label">${escapeHtml(formatDate(points[index].date, { month: "short", day: "numeric" }))}</text>`).join("")}
    <text x="${padding.left}" y="11" class="chart-axis-label">LOAD</text>
  </svg><div class="trend-caption"><span>${escapeHtml(exercise.name)} · ${points.length} workouts with a recorded load</span><span>${points[0].load} → ${points[points.length - 1].load}</span></div>`;
}
function renderMultiExerciseTrendChart(exercises) {
  const series = exercises.map((exercise) => {
    const points = exercise.points.filter((point) => point.load > 0);
    if (!points.length) return null;
    const initialLoad = points[0].load;
    return {
      name: exercise.name,
      points: points.map((point) => ({
        ...point,
        change: ((point.load - initialLoad) / initialLoad) * 100,
        timestamp: new Date(`${point.date}T12:00:00`).getTime(),
      })),
    };
  }).filter(Boolean);
  if (!series.length) return `<div class="chart-empty">No recorded loads for these trained exercises.</div>`;

  const width = 960;
  const height = 290;
  const padding = { top: 20, right: 20, bottom: 42, left: 54 };
  const timestamps = series.flatMap((item) => item.points.map((point) => point.timestamp));
  const firstTime = Math.min(...timestamps);
  const lastTime = Math.max(...timestamps);
  const dates = series.flatMap((item) => item.points.map((point) => point.date)).sort();
  const values = series.flatMap((item) => item.points.map((point) => point.change));
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (minimum === maximum) {
    minimum = -5;
    maximum = 5;
  } else {
    const margin = (maximum - minimum) * 0.08;
    minimum -= margin;
    maximum += margin;
  }
  const x = (timestamp) => firstTime === lastTime
    ? padding.left + (width - padding.left - padding.right) / 2
    : padding.left + ((timestamp - firstTime) / (lastTime - firstTime)) * (width - padding.left - padding.right);
  const y = (value) => padding.top + ((maximum - value) / (maximum - minimum)) * (height - padding.top - padding.bottom);
  const ticks = [...new Set([minimum, (minimum + maximum) / 2, maximum].map((tick) => Math.round(tick)))];
  const dateLabels = [...new Set([dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]])];
  return `<svg class="fitness-chart-svg progression-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Exercise load change compared with each exercise's first recorded load">
    ${ticks.map((tick) => `<g><line x1="${padding.left}" x2="${width - padding.right}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid-line"></line><text x="${padding.left - 9}" y="${y(tick) + 3}" text-anchor="end" class="chart-axis-label">${tick > 0 ? "+" : ""}${tick}%</text></g>`).join("")}
    ${series.map((item, seriesIndex) => {
      const points = item.points.map((point) => `${x(point.timestamp)},${y(point.change)}`).join(" ");
      return `<g class="chart-series" data-chart-series="${seriesIndex}"><polyline points="${points}" class="exercise-progression-line"><title>${escapeHtml(item.name)}</title></polyline>${item.points.map((point) => `<circle cx="${x(point.timestamp)}" cy="${y(point.change)}" r="2.5" class="exercise-progression-point"><title>${escapeHtml(item.name)} · ${escapeHtml(formatDate(point.date))}: ${point.change > 0 ? "+" : ""}${point.change.toFixed(1)}%</title></circle>`).join("")}</g>`;
    }).join("")}
    ${dateLabels.map((date, index) => `<text x="${x(new Date(`${date}T12:00:00`).getTime())}" y="${height - 12}" text-anchor="${index === 0 ? "start" : index === dateLabels.length - 1 ? "end" : "middle"}" class="chart-axis-label">${escapeHtml(formatDate(date, { month: "short", day: "numeric", year: "2-digit" }))}</text>`).join("")}
  </svg><div class="progression-chart-legend">${series.map((item, index) => `<span class="chart-series-label" data-chart-series="${index}"><i></i>${escapeHtml(item.name)}</span>`).join("")}</div><div class="trend-caption"><span>${series.length} exercises with recorded loads</span><span>CHANGE FROM EACH EXERCISE'S FIRST LOAD</span></div>`;
}
function renderWeeklyWorkoutChart(activity) {
  if (!activity.length) return `<p class="chart-empty">No completed workouts to chart yet.</p>`;
  const weeks = activity.slice(-12);
  const width = 760;
  const height = 190;
  const padding = { top: 16, right: 16, bottom: 38, left: 38 };
  const maxWorkouts = Math.max(...weeks.map((week) => week.workouts), 1);
  const slot = (width - padding.left - padding.right) / weeks.length;
  const barWidth = Math.min(34, slot * 0.56);
  return `<svg class="fitness-chart-svg weekly-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Number of workouts per week">
    ${[...new Set([0, Math.ceil(maxWorkouts / 2), maxWorkouts])].map((tick) => {
      const top = padding.top + ((maxWorkouts - tick) / maxWorkouts) * (height - padding.top - padding.bottom);
      return `<g><line x1="${padding.left}" x2="${width - padding.right}" y1="${top}" y2="${top}" class="chart-grid-line"></line><text x="${padding.left - 9}" y="${top + 3}" text-anchor="end" class="chart-axis-label">${tick}</text></g>`;
    }).join("")}
    ${weeks.map((week, index) => {
      const barHeight = (week.workouts / maxWorkouts) * (height - padding.top - padding.bottom);
      const barX = padding.left + (index * slot) + ((slot - barWidth) / 2);
      const barY = height - padding.bottom - barHeight;
      return `<g><rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4" class="chart-week-bar"><title>${escapeHtml(formatDate(week.weekStart, { month: "short", day: "numeric" }))}: ${week.workouts} workouts, ${week.sets} sets</title></rect><text x="${barX + barWidth / 2}" y="${height - 12}" text-anchor="middle" class="chart-axis-label">${escapeHtml(formatDate(week.weekStart, { month: "short", day: "numeric" }))}</text></g>`;
    }).join("")}
  </svg>`;
}
function renderMuscleFocusList(muscles) {
  if (!muscles.length) return `<p class="chart-empty">No exercise focus data found in this export.</p>`;
  return `<div class="muscle-focus-grid">${muscles.map((muscle) => `<section class="muscle-focus-card"><div class="muscle-focus-head"><strong>${escapeHtml(muscle.name)}</strong><span>${muscle.setsPerWeek.toFixed(1)} sets / wk</span></div><ul>${muscle.exercises.map((exercise) => `<li><span>${escapeHtml(exercise.name)}</span><small>${exercise.workouts} ${exercise.workouts === 1 ? "workout" : "workouts"}</small></li>`).join("")}</ul></section>`).join("")}</div>`;
}
function highlightChartSeries(card, activeIndex = null) {
  $$("[data-chart-series]", card).forEach((series) => {
    const active = activeIndex !== null && series.dataset.chartSeries === activeIndex;
    series.classList.toggle("chart-series-active", active);
    series.classList.toggle("chart-series-muted", activeIndex !== null && !active);
  });
}
function bindFitnessActions() {
  const content = $("#fitness-content");
  if (content.dataset.chartHoverBound !== "true") {
    content.dataset.chartHoverBound = "true";
    content.addEventListener("pointerover", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-chart-series]") : null;
      const card = target?.closest(".fitness-insight-card");
      if (target && card) highlightChartSeries(card, target.dataset.chartSeries);
    });
    content.addEventListener("pointerout", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-chart-series]") : null;
      const card = target?.closest(".fitness-insight-card");
      if (!target || !card) return;
      const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest("[data-chart-series]") : null;
      if (related?.closest(".fitness-insight-card") === card) {
        highlightChartSeries(card, related.dataset.chartSeries);
      } else {
        highlightChartSeries(card);
      }
    });
  }
  const importButton = $("[data-open-fitnotes]", content);
  const fileInput = $("#fitnotes-file", content);
  if (importButton && fileInput) importButton.addEventListener("click", () => fileInput.click());
  if (fileInput) fileInput.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;
    try {
      let payload;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new Error("Could not read this file as JSON. Choose an unmodified FitNotes .fnw backup.");
      }
      const imported = window.fitNotesAnalytics.parseExport(payload);
      if (!imported.workouts.length) throw new Error("No completed sets were found in this FitNotes backup.");
      const existingIds = new Set(fitNotesData.workouts.map((workout) => workout.id));
      const added = imported.workouts.filter((workout) => !existingIds.has(workout.id)).length;
      const updated = imported.workouts.length - added;
      const merged = window.fitNotesAnalytics.mergeData(fitNotesData, imported);
      localStorage.setItem(FITNOTES_KEY, JSON.stringify(merged));
      fitNotesData = merged;
      fitNotesLoadError = "";
      fitNotesError = "";
      fitNotesStatus = `Imported ${imported.workouts.length} completed workouts (${added} new, ${updated} refreshed). Saved on this browser only.`;
      if (!fitNotesData.exercises.some((exercise) => exercise.id === selectedExerciseId)) selectedExerciseId = "";
    } catch (error) {
      fitNotesError = error.message || "Could not import this FitNotes backup.";
      fitNotesStatus = "Import failed. Your saved charts were not changed.";
    } finally {
      input.value = "";
      renderFitness();
    }
  });
  const clearButton = $("[data-clear-fitnotes]", content);
  if (clearButton) clearButton.addEventListener("click", () => {
    if (!window.confirm("Remove imported FitNotes data from this browser?")) return;
    try {
      localStorage.removeItem(FITNOTES_KEY);
      fitNotesData = window.fitNotesAnalytics.emptyData();
      fitNotesLoadError = "";
      fitNotesStatus = "Imported FitNotes data was removed from this browser.";
      fitNotesError = "";
      selectedExerciseId = "";
      renderFitness();
    } catch (error) {
      fitNotesError = error.message || "Could not remove saved FitNotes data.";
      renderFitness();
    }
  });
  const exerciseSelect = $("#exercise-trend-select", content);
  if (exerciseSelect) exerciseSelect.addEventListener("change", () => {
    selectedExerciseId = exerciseSelect.value;
    renderFitness();
  });
  const muscleSelect = $("#muscle-trend-select", content);
  if (muscleSelect) muscleSelect.addEventListener("change", () => {
    selectedMuscleId = muscleSelect.value;
    renderFitness();
  });
  $$("[data-progression-view]", content).forEach((button) => button.addEventListener("click", () => {
    progressionView = button.dataset.progressionView;
    renderFitness();
  }));
  $$("[data-weekly-volume-view]", content).forEach((button) => button.addEventListener("click", () => {
    weeklyVolumeView = button.dataset.weeklyVolumeView;
    renderFitness();
  }));
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
      $('#voyage-save-status').textContent = (await window.voyageStoreReady).mode === 'cloud' ? 'Place saved to your account.' : 'Place saved on this Mac';
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
    $('#obsidian-summary').textContent = 'Obsidian is disconnected. Run python3 server.py in the Renovo folder and open http://127.0.0.1:8000. Any goals still displayed are from the last successful refresh.';
  } finally {
    obsidianRequestPending = false;
  }
}
refreshObsidianGoals();
setInterval(refreshObsidianGoals, 5000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshObsidianGoals(); });

let voyageReady = loadVoyagePlaces();
$('#voyage-login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const store = await window.voyageStoreReady;
    await store.signIn(form.elements.email.value.trim(), form.elements.password.value);
    form.elements.password.value = '';
    voyageReady = loadVoyagePlaces();
    await voyageReady;
  } catch (error) {
    $('#voyage-save-status').textContent = error.message || 'Could not sign in.';
  } finally { button.disabled = false; }
});
$('#voyage-sign-out').addEventListener('click', async () => {
  try {
    await (await window.voyageStoreReady).signOut();
    events = seedEvents.map((place) => ({ ...place }));
    renderEvents();
    voyageReady = loadVoyagePlaces();
  } catch (error) { $('#voyage-save-status').textContent = error.message; }
});
$('#voyage-import').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const places = Array.isArray(data) ? data : data.places;
    if (!Array.isArray(places) || places.some((place) => !place || typeof place.id !== 'string' || typeof place.title !== 'string' || !['restaurant', 'event'].includes(place.category))) throw new Error('Choose a Voyage JSON file containing a places array.');
    const saved = places.filter((place) => !place.seed && !place.id.startsWith('seed-')).map(normalizeEvent);
    if (saved.length) await persistEvents(saved);
    voyageReady = loadVoyagePlaces();
    await voyageReady;
  } catch (error) { $('#voyage-save-status').textContent = error.message; }
  finally { event.target.value = ''; }
});
