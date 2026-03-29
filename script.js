const predictionGrid = document.getElementById("predictionGrid");
const leagueFilters = document.getElementById("leagueFilters");
const predictorForm = document.getElementById("predictorForm");
const customResult = document.getElementById("customResult");
const boardStatus = document.getElementById("boardStatus");
const matchDateInput = document.getElementById("matchDate");
const refreshMatchesButton = document.getElementById("refreshMatches");
const leagueOptions = document.getElementById("leagueOptions");
const selectAllLeaguesButton = document.getElementById("selectAllLeagues");
const clearAllLeaguesButton = document.getElementById("clearAllLeagues");
const toggleBoardControlsButton = document.getElementById("toggleBoardControls");
const boardControlsPanel = document.getElementById("boardControlsPanel");
const paginationWrap = document.getElementById("paginationWrap");
const pageNumbers = document.getElementById("pageNumbers");
const previousPageButton = document.getElementById("previousPage");
const nextPageButton = document.getElementById("nextPage");
const sortMatchesSelect = document.getElementById("sortMatches");
const teamSearchInput = document.getElementById("teamSearch");
const generateVisibleAiButton = document.getElementById("generateVisibleAi");
const predictionsSection = document.getElementById("predictions");
const toggleFavoritesOnlyButton = document.getElementById("toggleFavoritesOnly");
const toggleAdminPanelButton = document.getElementById("toggleAdminPanel");
const favoritesSection = document.getElementById("favoritesSection");
const favoritesGrid = document.getElementById("favoritesGrid");
const favoritesStatus = document.getElementById("favoritesStatus");
const standingsSection = document.getElementById("standingsSection");
const standingsGrid = document.getElementById("standingsGrid");
const standingsStatus = document.getElementById("standingsStatus");
const adminPanel = document.getElementById("adminPanel");
const adminStatus = document.getElementById("adminStatus");
const adminAuthForm = document.getElementById("adminAuthForm");
const adminPassword = document.getElementById("adminPassword");
const adminForm = document.getElementById("adminForm");
const adminFixtureSelect = document.getElementById("adminFixtureSelect");
const adminPrediction = document.getElementById("adminPrediction");
const adminScore = document.getElementById("adminScore");
const adminConfidence = document.getElementById("adminConfidence");
const adminMarket = document.getElementById("adminMarket");
const adminNote = document.getElementById("adminNote");
const clearAdminOverridesButton = document.getElementById("clearAdminOverrides");
const clearAdminFixtureButton = document.getElementById("clearAdminFixture");
const lockAdminPanelButton = document.getElementById("lockAdminPanel");
const heroFeaturedLeague = document.getElementById("heroFeaturedLeague");
const heroFeaturedTeams = document.getElementById("heroFeaturedTeams");
const heroFeaturedTitle = document.getElementById("heroFeaturedTitle");
const heroFeaturedTime = document.getElementById("heroFeaturedTime");
const heroFeaturedScore = document.getElementById("heroFeaturedScore");
const heroPrimaryLabel = document.getElementById("heroPrimaryLabel");
const heroPrimaryValue = document.getElementById("heroPrimaryValue");
const heroPrimaryBar = document.getElementById("heroPrimaryBar");
const heroSecondaryLabel = document.getElementById("heroSecondaryLabel");
const heroSecondaryValue = document.getElementById("heroSecondaryValue");
const heroSecondaryBar = document.getElementById("heroSecondaryBar");
const heroPanelNote = document.getElementById("heroPanelNote");

const STORAGE_KEY = "goalcast-board-state";
const DETAIL_STORAGE_KEY = "goalcast-match-detail-cache";
const AI_ANALYSIS_STORAGE_KEY = "goalcast-ai-analysis-cache";
const FAVORITES_STORAGE_KEY = "goalcast-favorite-teams";
const ADMIN_OVERRIDES_STORAGE_KEY = "goalcast-admin-overrides";
const ADMIN_PASSWORD_STORAGE_KEY = "goalcast-admin-password";
const PAGE_SIZE = 9;
const AI_ANALYSIS_TTL_MS = 60 * 60 * 1000;
const availableLeagues = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "UEFA Champions League",
  "South African Premiership"
];
const marqueeTeams = [
  "Arsenal",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Chelsea",
  "Tottenham",
  "Newcastle",
  "Real Madrid",
  "Barcelona",
  "Atletico Madrid",
  "Atletico",
  "Sevilla",
  "Juventus",
  "Inter",
  "Milan",
  "Napoli",
  "Roma",
  "Bayern",
  "Dortmund",
  "Leverkusen",
  "RB Leipzig",
  "PSG",
  "Paris Saint-Germain",
  "Marseille",
  "Monaco",
  "Porto",
  "Sporting",
  "Benfica",
  "Sundowns",
  "Pirates"
];

let predictions = [];
let activeFilter = "all";
let selectedLeagues = [...availableLeagues];
let currentPage = 1;
let currentSort = "earliest";
let teamSearchQuery = "";
let boardControlsOpen = false;
let showFavoritesOnly = false;
let adminPanelOpen = false;
let adminUnlocked = false;
let expandedCards = new Set();
let collapsedFeaturedCards = new Set();
let detailCacheTtlMs = 15 * 60 * 1000;
const detailCache = new Map();
const pendingDetailRequests = new Map();
const updatedDetailTimestamps = new Map();
const aiAnalysisCache = new Map();
const pendingAiAnalysisRequests = new Map();
const favoriteTeams = new Set();
const adminOverrides = new Map();
let liveRefreshTimer = null;
let detailObserver;
let standingsData = [];
let aiStatus = {
  enabled: false,
  providers: [],
  preferredProvider: null
};

function getDetailCacheKey(fixtureId) {
  return String(fixtureId);
}

function createDetailCacheEntry(data, source = "network", cachedAt = Date.now()) {
  return {
    source,
    cachedAt,
    payload: {
      headToHead: data.headToHead || [],
      lastResults: data.lastResults || { home: [], away: [] },
    }
  };
}

function isDetailCacheEntryExpired(entry) {
  if (!entry || typeof entry.cachedAt !== "number") {
    return true;
  }

  return Date.now() - entry.cachedAt > detailCacheTtlMs;
}

function applyCachedDetailsToMatch(match) {
  if (!match || !detailCache.has(getDetailCacheKey(match.fixtureId))) {
    return false;
  }

  const cachedDetails = detailCache.get(getDetailCacheKey(match.fixtureId));
  if (isDetailCacheEntryExpired(cachedDetails)) {
    detailCache.delete(getDetailCacheKey(match.fixtureId));
    saveDetailCache();
    return false;
  }

  match.headToHead = cachedDetails.payload?.headToHead || [];
  match.lastResults = cachedDetails.payload?.lastResults || { home: [], away: [] };
  match.detailMeta = {
    source: cachedDetails.source || "memory",
    cachedAt: cachedDetails.cachedAt || null,
  };
  return true;
}

function formatCachedAge(cachedAt) {
  if (typeof cachedAt !== "number") {
    return "Cached";
  }

  const diffMs = Math.max(0, Date.now() - cachedAt);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "Cached now";
  }
  if (diffMinutes < 60) {
    return `Cached ${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Cached ${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Cached ${diffDays}d ago`;
}

function shouldLimitPrefetchToExpanded() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) {
    return false;
  }

  if (connection.saveData) {
    return true;
  }

  const effectiveType = connection.effectiveType || "";
  return effectiveType.includes("2g") || effectiveType === "slow-2g";
}

function pruneUpdatedDetailTimestamps() {
  const now = Date.now();
  updatedDetailTimestamps.forEach((timestamp, fixtureId) => {
    if (now - timestamp > 15000) {
      updatedDetailTimestamps.delete(fixtureId);
    }
  });
}

function getUpdatedLabel(fixtureId) {
  pruneUpdatedDetailTimestamps();
  const timestamp = updatedDetailTimestamps.get(String(fixtureId));
  if (!timestamp) {
    return "";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 1) {
    return "Updated just now";
  }
  return `Updated ${diffSeconds}s ago`;
}

function formatCacheTtlLabel(ttlMs) {
  const ttlMinutes = Math.round(ttlMs / 60000);
  if (ttlMinutes < 60) {
    return `${ttlMinutes} minute${ttlMinutes === 1 ? "" : "s"}`;
  }

  const ttlHours = ttlMinutes / 60;
  return `${ttlHours} hour${ttlHours === 1 ? "" : "s"}`;
}

function getAiAnalysisCacheKey(fixtureId) {
  return String(fixtureId);
}

function createAiAnalysisCacheEntry(data, cachedAt = Date.now()) {
  return {
    cachedAt,
    payload: data,
  };
}

function isAiAnalysisCacheEntryExpired(entry) {
  if (!entry || typeof entry.cachedAt !== "number") {
    return true;
  }

  return Date.now() - entry.cachedAt > AI_ANALYSIS_TTL_MS;
}

function getCachedAiAnalysis(fixtureId) {
  const key = getAiAnalysisCacheKey(fixtureId);
  if (!aiAnalysisCache.has(key)) {
    return null;
  }

  const entry = aiAnalysisCache.get(key);
  if (isAiAnalysisCacheEntryExpired(entry)) {
    aiAnalysisCache.delete(key);
    saveAiAnalysisCache();
    return null;
  }

  return entry.payload || null;
}

function setBoardStatus(message, tone = "default") {
  boardStatus.textContent = message;
  boardStatus.dataset.tone = tone;
}

function updateFavoritesButton() {
  toggleFavoritesOnlyButton.textContent = `Favorites Only: ${showFavoritesOnly ? "On" : "Off"}`;
  toggleFavoritesOnlyButton.classList.toggle("is-active", showFavoritesOnly);
}

function getAiProviderLabel() {
  if (!aiStatus.enabled || !Array.isArray(aiStatus.providers) || !aiStatus.providers.length) {
    return "AI unavailable";
  }

  const preferredProvider = aiStatus.providers.find((provider) => provider.id === aiStatus.preferredProvider);
  return preferredProvider?.label || aiStatus.providers[0].label || "AI ready";
}

function updateGenerateVisibleAiButton() {
  if (!generateVisibleAiButton) {
    return;
  }

  generateVisibleAiButton.disabled = !aiStatus.enabled || !predictions.length;
  generateVisibleAiButton.textContent = aiStatus.enabled
    ? `Generate Visible AI (${getAiProviderLabel()})`
    : "Generate Visible AI";
}

function updateAdminPanelVisibility() {
  adminPanel.hidden = !adminPanelOpen;
  toggleAdminPanelButton.classList.toggle("is-active", adminPanelOpen);
  adminAuthForm.hidden = !adminPanelOpen || adminUnlocked;
  adminForm.hidden = !adminPanelOpen || !adminUnlocked;
  lockAdminPanelButton.hidden = !adminPanelOpen || !adminUnlocked;
}

function applyAdminOverride(match) {
  const override = adminOverrides.get(String(match.fixtureId));
  if (!override) {
    return { ...match, isAdminOverride: false };
  }

  return {
    ...match,
    prediction: override.prediction || match.prediction,
    score: override.score || match.score,
    confidence: Number(override.confidence) || match.confidence,
    market: override.market || "Admin override",
    note: override.note || match.note,
    isAdminOverride: true,
  };
}

function applyAdminOverridesToPredictions() {
  predictions = predictions.map((match) => applyAdminOverride(match));
}

function updateAdminFixtureOptions() {
  if (!adminFixtureSelect) {
    return;
  }

  if (!predictions.length) {
    adminFixtureSelect.innerHTML = '<option value="">No fixtures loaded</option>';
    return;
  }

  adminFixtureSelect.innerHTML = predictions
    .map((match) => `<option value="${match.fixtureId}">${match.home} vs ${match.away} (${match.league})</option>`)
    .join("");

  populateAdminForm(adminFixtureSelect.value || String(predictions[0].fixtureId));
}

function populateAdminForm(fixtureId) {
  const fixtureKey = String(fixtureId || "");
  const match = predictions.find((item) => String(item.fixtureId) === fixtureKey);
  const override = adminOverrides.get(fixtureKey);

  if (!match) {
    adminPrediction.value = "";
    adminScore.value = "";
    adminConfidence.value = "";
    adminMarket.value = "";
    adminNote.value = "";
    return;
  }

  adminFixtureSelect.value = fixtureKey;
  adminPrediction.value = override?.prediction || match.prediction || "";
  adminScore.value = override?.score || match.score || "";
  adminConfidence.value = String(override?.confidence || match.confidence || "");
  adminMarket.value = override?.market || (override ? "Admin override" : match.market || "");
  adminNote.value = override?.note || match.note || "";
}

function isTodaySelected() {
  return (matchDateInput.value || getTodayDateString()) === getTodayDateString();
}

function getStoredAdminPassword() {
  try {
    return localStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function setStoredAdminPassword(password) {
  try {
    localStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
  } catch (error) {
    return;
  }
}

function renderFavoritesSection() {
  const favoriteMatches = sortPredictions(
    predictions.filter((match) => favoriteTeams.has(match.home) || favoriteTeams.has(match.away))
  ).slice(0, 6);

  if (!favoriteMatches.length) {
    favoritesSection.hidden = true;
    favoritesGrid.innerHTML = "";
    favoritesStatus.textContent = "Save favorite teams to pin their fixtures here.";
    return;
  }

  favoritesSection.hidden = false;
  favoritesStatus.textContent = `${favoriteMatches.length} favorite fixture${favoriteMatches.length === 1 ? "" : "s"} loaded for this board.`;
  favoritesGrid.innerHTML = favoriteMatches.map((match) => `
    <article class="favorite-card">
      <div class="favorite-card-top">
        <span class="league">${match.league}</span>
        ${isLiveStatus(match.status) ? '<span class="live-badge is-live">LIVE</span>' : ""}
      </div>
      <strong>${match.home} vs ${match.away}</strong>
      <span class="favorite-time">${formatLocalKickoff(match.kickoffIso)}</span>
      <span class="favorite-score">${getStatusLabel(match)} ${getDisplayScore(match)}</span>
    </article>
  `).join("");
}

function renderStandingsSection() {
  if (!standingsData.length) {
    standingsSection.hidden = true;
    standingsGrid.innerHTML = "";
    standingsStatus.textContent = "No standings available for the selected competitions.";
    return;
  }

  standingsSection.hidden = false;
  standingsStatus.textContent = `${standingsData.length} competition table${standingsData.length === 1 ? "" : "s"} loaded.`;
  standingsGrid.innerHTML = standingsData.map((league) => {
    const primaryTable = league.tables[0];
    return `
      <article class="standings-card">
        <div class="standings-card-header">
          <div class="league-meta ${league.leagueLogo ? "" : "no-league-logo"}">
            ${league.leagueLogo ? `<img class="league-logo" src="${league.leagueLogo}" alt="${league.league} logo" loading="lazy">` : ""}
            <span class="league-name">${league.league}</span>
            <span class="country-meta ${league.countryFlag ? "" : "no-flag"}">
              ${league.countryFlag ? `<img class="country-flag" src="${league.countryFlag}" alt="${league.country} flag" loading="lazy">` : ""}
              <span class="country-name">${league.country || ""}</span>
            </span>
          </div>
          <span class="standings-stage">${primaryTable.stage || primaryTable.type || "Table"}</span>
        </div>
        <div class="standings-table">
          <div class="standings-row standings-head">
            <span>#</span>
            <span>Team</span>
            <span>P</span>
            <span>GD</span>
            <span>Pts</span>
          </div>
          ${primaryTable.table.map((row) => `
            <div class="standings-row">
              <span>${row.position}</span>
              <span class="standings-team">
                ${row.crest ? `<img class="standings-crest" src="${row.crest}" alt="${row.team} crest" loading="lazy">` : ""}
                <strong>${row.team}</strong>
              </span>
              <span>${row.played}</span>
              <span>${row.goalDifference}</span>
              <span>${row.points}</span>
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
}

async function loadStandings() {
  const leaguesToQuery = selectedLeagues.length ? selectedLeagues : availableLeagues;
  const params = new URLSearchParams({
    leagues: leaguesToQuery.join(",")
  });

  try {
    const response = await fetch(`/api/standings?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not load standings.");
    }

    standingsData = data.standings || [];
    renderStandingsSection();
  } catch (error) {
    standingsData = [];
    renderStandingsSection();
  }
}

function scheduleLiveRefresh() {
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer);
    liveRefreshTimer = null;
  }

  if (!isTodaySelected()) {
    return;
  }

  liveRefreshTimer = window.setInterval(() => {
    loadMatches({ silent: true });
  }, 60000);
}

function scrollBoardToTop() {
  predictionsSection?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saveBoardState() {
  const state = {
    selectedDate: matchDateInput.value || getTodayDateString(),
    selectedLeagues,
    activeFilter,
    currentPage,
    currentSort,
    teamSearchQuery,
    showFavoritesOnly,
    adminPanelOpen,
    expandedCards: Array.from(expandedCards),
    collapsedFeaturedCards: Array.from(collapsedFeaturedCards),
    detailCacheTtlMs
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    return;
  }
}

function loadBoardState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
      return;
    }

    const state = JSON.parse(rawState);
    if (state.selectedDate) {
      matchDateInput.value = state.selectedDate;
    }
    if (Array.isArray(state.selectedLeagues) && state.selectedLeagues.length) {
      selectedLeagues = state.selectedLeagues.filter((league) => availableLeagues.includes(league));
    }
    if (typeof state.activeFilter === "string") {
      activeFilter = state.activeFilter;
    }
    if (typeof state.currentPage === "number" && state.currentPage > 0) {
      currentPage = state.currentPage;
    }
    if (typeof state.currentSort === "string") {
      currentSort = state.currentSort;
    }
    if (typeof state.teamSearchQuery === "string") {
      teamSearchQuery = state.teamSearchQuery;
    }
    if (typeof state.showFavoritesOnly === "boolean") {
      showFavoritesOnly = state.showFavoritesOnly;
    }
    if (typeof state.adminPanelOpen === "boolean") {
      adminPanelOpen = state.adminPanelOpen;
    }
    if (Array.isArray(state.expandedCards)) {
      expandedCards = new Set(state.expandedCards.map((value) => String(value)));
    }
    if (Array.isArray(state.collapsedFeaturedCards)) {
      collapsedFeaturedCards = new Set(state.collapsedFeaturedCards.map((value) => String(value)));
    }
    if (typeof state.detailCacheTtlMs === "number" && state.detailCacheTtlMs > 0) {
      detailCacheTtlMs = state.detailCacheTtlMs;
    }
  } catch (error) {
    return;
  }
}

function saveDetailCache() {
  try {
    const serializableEntries = Array.from(detailCache.entries()).filter(([, value]) => !isDetailCacheEntryExpired(value));
    sessionStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(serializableEntries));
  } catch (error) {
    return;
  }
}

function saveAiAnalysisCache() {
  try {
    const serializableEntries = Array.from(aiAnalysisCache.entries()).filter(([, value]) => !isAiAnalysisCacheEntryExpired(value));
    sessionStorage.setItem(AI_ANALYSIS_STORAGE_KEY, JSON.stringify(serializableEntries));
  } catch (error) {
    return;
  }
}

function loadAiAnalysisCache() {
  try {
    const rawCache = sessionStorage.getItem(AI_ANALYSIS_STORAGE_KEY);
    if (!rawCache) {
      return;
    }

    const parsedCache = JSON.parse(rawCache);
    if (!Array.isArray(parsedCache)) {
      return;
    }

    parsedCache.forEach(([key, value]) => {
      if (!isAiAnalysisCacheEntryExpired(value)) {
        aiAnalysisCache.set(String(key), value);
      }
    });
    saveAiAnalysisCache();
  } catch (error) {
    return;
  }
}

function loadDetailCache() {
  try {
    const rawCache = sessionStorage.getItem(DETAIL_STORAGE_KEY);
    if (!rawCache) {
      return;
    }

    const parsedCache = JSON.parse(rawCache);
    if (!Array.isArray(parsedCache)) {
      return;
    }

    parsedCache.forEach(([key, value]) => {
      if (!isDetailCacheEntryExpired(value)) {
        detailCache.set(String(key), {
          ...value,
          source: "session",
        });
      }
    });
    saveDetailCache();
  } catch (error) {
    return;
  }
}

function saveFavoriteTeams() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoriteTeams)));
  } catch (error) {
    return;
  }
}

function loadFavoriteTeams() {
  try {
    const rawFavorites = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!rawFavorites) {
      return;
    }

    const parsedFavorites = JSON.parse(rawFavorites);
    if (Array.isArray(parsedFavorites)) {
      parsedFavorites.forEach((team) => favoriteTeams.add(String(team)));
    }
  } catch (error) {
    return;
  }
}

function saveAdminOverrides() {
  try {
    localStorage.setItem(
      ADMIN_OVERRIDES_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(adminOverrides.entries()))
    );
  } catch (error) {
    return;
  }
}

function loadAdminOverrides() {
  try {
    const rawOverrides = localStorage.getItem(ADMIN_OVERRIDES_STORAGE_KEY);
    if (!rawOverrides) {
      return;
    }

    const parsedOverrides = JSON.parse(rawOverrides);
    Object.entries(parsedOverrides).forEach(([fixtureId, override]) => {
      adminOverrides.set(String(fixtureId), override);
    });
  } catch (error) {
    return;
  }
}

function syncControlVisibility() {
  const isMobile = window.innerWidth <= 640;
  toggleBoardControlsButton.hidden = !isMobile;
  boardControlsPanel.classList.toggle("is-open", !isMobile || boardControlsOpen);
  toggleBoardControlsButton.setAttribute("aria-expanded", String(!isMobile || boardControlsOpen));
}

function formatLocalKickoff(kickoffIso) {
  if (!kickoffIso) {
    return "Kickoff time unavailable";
  }

  const kickoffDate = new Date(kickoffIso);
  if (Number.isNaN(kickoffDate.getTime())) {
    return kickoffIso;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(kickoffDate);
}

function formatShortDate(kickoffIso) {
  if (!kickoffIso) {
    return "";
  }

  const kickoffDate = new Date(kickoffIso);
  if (Number.isNaN(kickoffDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(kickoffDate);
}

function isLiveStatus(status = "") {
  return ["IN_PLAY", "PAUSED", "LIVE"].includes(status);
}

function isCompletedStatus(status = "") {
  return ["FINISHED", "AWARDED"].includes(status);
}

function getDisplayScore(match) {
  if (isLiveStatus(match.status) || isCompletedStatus(match.status)) {
    return match.liveScore || match.score;
  }

  return match.score;
}

function getStatusLabel(match) {
  if (isLiveStatus(match.status)) {
    return "Live score";
  }
  if (isCompletedStatus(match.status)) {
    return "Final score";
  }
  return "Projected";
}

function getConfidenceBand(confidence) {
  if (confidence >= 70) {
    return "high";
  }
  if (confidence >= 58) {
    return "medium";
  }
  return "low";
}

function getResultClass(result) {
  if (result === "W") {
    return "win";
  }
  if (result === "D") {
    return "draw";
  }
  return "loss";
}

function renderTeamIdentity(name, logo, alignment = "left") {
  const safeName = name || "Unknown team";
  const logoMarkup = logo
    ? `<img class="team-logo" src="${logo}" alt="${safeName} crest" loading="lazy" onerror="this.closest('.team-identity').classList.add('no-logo'); this.remove();">`
    : "";
  const isFavorite = favoriteTeams.has(safeName);

  return `
    <div class="team-identity ${alignment} ${logo ? "" : "no-logo"}">
      ${logoMarkup}
      <span class="team-name">${safeName}</span>
      <button class="team-favorite ${isFavorite ? "is-active" : ""}" type="button" data-team-favorite="${safeName.replace(/"/g, "&quot;")}" aria-label="Save ${safeName} as favorite">
        ${isFavorite ? "★" : "☆"}
      </button>
    </div>
  `;
}

function renderLeagueMeta(match) {
  const leagueLogo = match.leagueLogo
    ? `<img class="league-logo" src="${match.leagueLogo}" alt="${match.league} logo" loading="lazy" onerror="this.closest('.league-meta').classList.add('no-league-logo'); this.remove();">`
    : "";
  const countryFlag = match.countryFlag
    ? `<img class="country-flag" src="${match.countryFlag}" alt="${match.country || match.countryCode || 'Country'} flag" loading="lazy" onerror="this.closest('.country-meta').classList.add('no-flag'); this.remove();">`
    : "";

  return `
    <div class="league-meta ${match.leagueLogo ? "" : "no-league-logo"}">
      ${leagueLogo}
      <span class="league-name">${match.league}</span>
      <span class="country-meta ${match.countryFlag ? "" : "no-flag"}">
        ${countryFlag}
        <span class="country-name">${match.country || match.countryCode || ""}</span>
      </span>
    </div>
  `;
}

function renderHeroTeamMark(name, logo) {
  const safeName = name || "Team";
  const logoMarkup = logo
    ? `<img class="hero-team-logo" src="${logo}" alt="${safeName} crest" loading="lazy" onerror="this.closest('.hero-team-mark').classList.add('no-logo'); this.remove();">`
    : "";

  return `
    <div class="hero-team-mark ${logo ? "" : "no-logo"}">
      ${logoMarkup}
      <span class="hero-team-name">${safeName}</span>
    </div>
  `;
}

function getMarqueeScore(teamName = "") {
  const normalizedName = teamName.toLowerCase();
  return marqueeTeams.reduce((score, candidate) => {
    return normalizedName.includes(candidate.toLowerCase()) ? score + 1 : score;
  }, 0);
}

function getHeroFeaturedMatch(matches) {
  if (!matches.length) {
    return null;
  }

  return [...matches].sort((a, b) => {
    const marqueeDelta = (getMarqueeScore(b.home) + getMarqueeScore(b.away)) - (getMarqueeScore(a.home) + getMarqueeScore(a.away));
    if (marqueeDelta !== 0) {
      return marqueeDelta;
    }

    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }

    return a.kickoffIso.localeCompare(b.kickoffIso);
  })[0];
}

function renderHeroPanel(matches) {
  const featuredMatch = getHeroFeaturedMatch(matches);

  if (!featuredMatch) {
    heroFeaturedLeague.textContent = "Live spotlight";
    heroFeaturedTeams.innerHTML = `
      <div class="hero-team-mark no-logo"><span class="hero-team-name">Home</span></div>
      <span class="hero-versus">vs</span>
      <div class="hero-team-mark no-logo"><span class="hero-team-name">Away</span></div>
    `;
    heroFeaturedTitle.textContent = "No marquee fixture yet";
    heroFeaturedTime.textContent = "Pick another date to load more matches";
    heroFeaturedScore.textContent = "--";
    heroPrimaryLabel.textContent = "Prediction edge";
    heroPrimaryValue.textContent = "--";
    heroPrimaryBar.style.width = "0%";
    heroSecondaryLabel.textContent = "Board confidence";
    heroSecondaryValue.textContent = "--";
    heroSecondaryBar.style.width = "0%";
    heroPanelNote.textContent = "The hero panel updates automatically when the board finds a strong live fixture.";
    return;
  }

  const primaryValue = `${featuredMatch.confidence}%`;
  const secondaryConfidence = Math.max(35, Math.min(92, featuredMatch.confidence - 6));

  heroFeaturedLeague.textContent = featuredMatch.league;
  heroFeaturedTeams.innerHTML = `
    ${renderHeroTeamMark(featuredMatch.home, featuredMatch.homeLogo)}
    <span class="hero-versus">vs</span>
    ${renderHeroTeamMark(featuredMatch.away, featuredMatch.awayLogo)}
  `;
  heroFeaturedTitle.textContent = `${featuredMatch.home} vs ${featuredMatch.away}`;
  heroFeaturedTime.textContent = formatLocalKickoff(featuredMatch.kickoffIso);
  heroFeaturedScore.textContent = getDisplayScore(featuredMatch);
  heroPrimaryLabel.textContent = "Prediction edge";
  heroPrimaryValue.textContent = primaryValue;
  heroPrimaryBar.style.width = `${featuredMatch.confidence}%`;
  heroSecondaryLabel.textContent = getStatusLabel(featuredMatch);
  heroSecondaryValue.textContent = isLiveStatus(featuredMatch.status) || isCompletedStatus(featuredMatch.status)
    ? featuredMatch.liveScore || "--"
    : `${secondaryConfidence}%`;
  heroSecondaryBar.style.width = `${secondaryConfidence}%`;
  heroPanelNote.textContent = `${featuredMatch.prediction}. ${featuredMatch.note}`;
}

function summarizeForm(results = []) {
  const summary = { W: 0, D: 0, L: 0 };
  results.forEach((item) => {
    if (summary[item.result] !== undefined) {
      summary[item.result] += 1;
    }
  });
  return summary;
}

function renderFeaturedStats(match) {
  const isLoaded = detailCache.has(getDetailCacheKey(match.fixtureId));
  if (!isLoaded) {
    return `
      <div class="featured-stats featured-loading">
        <div class="featured-stat-card shimmer"><span class="featured-stat-label">Head-to-head</span><strong>Loading...</strong></div>
        <div class="featured-stat-card shimmer"><span class="featured-stat-label">${match.home} form</span><strong>Loading...</strong></div>
        <div class="featured-stat-card shimmer"><span class="featured-stat-label">${match.away} form</span><strong>Loading...</strong></div>
      </div>
    `;
  }

  const homeSummary = summarizeForm(match.lastResults?.home || []);
  const awaySummary = summarizeForm(match.lastResults?.away || []);
  const h2hCount = Array.isArray(match.headToHead) ? match.headToHead.length : 0;

  return `
    <div class="featured-stats">
      <div class="featured-stat-card">
        <span class="featured-stat-label">Head-to-head</span>
        <strong>${h2hCount ? `${h2hCount} recent meetings` : "No recent meetings"}</strong>
      </div>
      <div class="featured-stat-card">
        <span class="featured-stat-label">${match.home} form</span>
        <strong>${homeSummary.W}W ${homeSummary.D}D ${homeSummary.L}L</strong>
      </div>
      <div class="featured-stat-card">
        <span class="featured-stat-label">${match.away} form</span>
        <strong>${awaySummary.W}W ${awaySummary.D}D ${awaySummary.L}L</strong>
      </div>
    </div>
  `;
}

function getFeaturedFixtureId(matches) {
  if (!matches.length) {
    return null;
  }

  return matches.reduce((bestMatch, currentMatch) => {
    if (!bestMatch) {
      return currentMatch;
    }

    if (currentMatch.confidence !== bestMatch.confidence) {
      return currentMatch.confidence > bestMatch.confidence ? currentMatch : bestMatch;
    }

    return currentMatch.kickoffIso < bestMatch.kickoffIso ? currentMatch : bestMatch;
  }, null)?.fixtureId ?? null;
}

function sortPredictions(matches) {
  const sortedMatches = [...matches];

  if (currentSort === "confidence") {
    sortedMatches.sort((a, b) => b.confidence - a.confidence || a.league.localeCompare(b.league));
    return sortedMatches;
  }

  if (currentSort === "league") {
    sortedMatches.sort((a, b) => {
      return a.league.localeCompare(b.league) || a.home.localeCompare(b.home) || a.kickoffIso.localeCompare(b.kickoffIso);
    });
    return sortedMatches;
  }

  sortedMatches.sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.league.localeCompare(b.league));
  return sortedMatches;
}

function renderPagination(totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  previousPageButton.disabled = currentPage === 1;
  nextPageButton.disabled = currentPage === totalPages;

  pageNumbers.innerHTML = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    const activeClass = page === currentPage ? "is-active" : "";
    return `<button class="page-number ${activeClass}" data-page="${page}" type="button">${page}</button>`;
  }).join("");

  pageNumbers.querySelectorAll(".page-number").forEach((button) => {
    button.addEventListener("click", () => {
      currentPage = Number(button.dataset.page);
      saveBoardState();
      renderPredictions(activeFilter, { scrollToTop: true });
    });
  });

  paginationWrap.hidden = totalItems <= PAGE_SIZE;
}

function attachDetailObserver() {
  if (!detailObserver) {
    detailObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const card = entry.target;
        detailObserver.unobserve(card);
        hydrateMatchDetails(card.dataset.fixtureId);
      });
    }, {
      rootMargin: "120px",
    });
  }

  document.querySelectorAll("[data-fixture-id]").forEach((card) => {
    detailObserver.observe(card);
  });
}

async function hydrateMatchDetails(fixtureId) {
  return hydrateMatchDetailsWithOptions(fixtureId);
}

async function hydrateMatchDetailsWithOptions(fixtureId, options = {}) {
  const { renderOnSuccess = true, forceRefresh = false, renderOnStart = false } = options;
  const fixtureKey = String(fixtureId);
  const match = predictions.find((item) => String(item.fixtureId) === String(fixtureId));
  if (!match) {
    return;
  }

  if (forceRefresh) {
    detailCache.delete(getDetailCacheKey(match.fixtureId));
    saveDetailCache();
  }

  if (!forceRefresh && applyCachedDetailsToMatch(match)) {
    return;
  }

  if (pendingDetailRequests.has(fixtureKey)) {
    return pendingDetailRequests.get(fixtureKey);
  }

  if (renderOnStart) {
    renderPredictions(activeFilter);
  }

  const request = (async () => {
    try {
    const params = new URLSearchParams({
      fixture: String(match.fixtureId),
      home_team_id: String(match.homeTeamId),
      away_team_id: String(match.awayTeamId),
    });
    const response = await fetch(`/api/match-details?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load match details.");
    }

    detailCache.set(getDetailCacheKey(match.fixtureId), createDetailCacheEntry(data, "network"));
    saveDetailCache();
    match.headToHead = data.headToHead || [];
    match.lastResults = data.lastResults || { home: [], away: [] };
    match.detailMeta = {
      source: "network",
      cachedAt: Date.now(),
    };
    updatedDetailTimestamps.set(fixtureKey, Date.now());
    setTimeout(() => {
      if (updatedDetailTimestamps.has(fixtureKey)) {
        renderPredictions(activeFilter);
      }
    }, 16000);
    if (renderOnSuccess) {
      renderPredictions(activeFilter);
    }
    } catch (error) {
      detailCache.set(getDetailCacheKey(match.fixtureId), createDetailCacheEntry({
        headToHead: [],
        lastResults: { home: [], away: [] },
      }, "network"));
      saveDetailCache();
    } finally {
      pendingDetailRequests.delete(fixtureKey);
    }
  })();

  pendingDetailRequests.set(fixtureKey, request);
  return request;
}

function buildAiAnalysisPayload(match) {
  return {
    fixtureId: match.fixtureId,
    league: match.league,
    home: match.home,
    away: match.away,
    kickoffIso: match.kickoffIso,
    prediction: match.prediction,
    score: match.score,
    confidence: match.confidence,
    status: match.status,
    note: match.note,
    market: match.market,
    modelSignals: match.modelSignals || {},
    headToHead: match.headToHead || [],
    lastResults: match.lastResults || { home: [], away: [] },
    adminContext: match.isAdminOverride ? match.note : ""
  };
}

function renderAiAnalysisBlock(match) {
  const fixtureKey = getAiAnalysisCacheKey(match.fixtureId);
  const cachedAnalysis = getCachedAiAnalysis(match.fixtureId);
  const isGenerating = pendingAiAnalysisRequests.has(fixtureKey);

  if (!cachedAnalysis) {
    return `
      <div class="ai-analysis-block">
        <div class="detail-heading">
          <p class="h2h-title">AI score read</p>
          <div class="detail-heading-actions">
            <button class="refresh-details-button" type="button" data-generate-ai="${match.fixtureId}" ${isGenerating ? "disabled" : ""}>
              ${isGenerating ? "Generating..." : "Generate AI analysis"}
            </button>
          </div>
        </div>
        <p class="prediction-note ai-analysis-empty">
          Use ${getAiProviderLabel()} to explain the likely scoreline from form, standings, scoring trends, venue strength, and head-to-head context.
        </p>
      </div>
    `;
  }

  const confidenceTone = cachedAnalysis.confidence_band || "medium";
  const keyFactors = Array.isArray(cachedAnalysis.key_factors) ? cachedAnalysis.key_factors : [];
  const watchouts = Array.isArray(cachedAnalysis.watchouts) ? cachedAnalysis.watchouts : [];
  const missingSignals = Array.isArray(cachedAnalysis.missing_signals) ? cachedAnalysis.missing_signals : [];

  return `
    <div class="ai-analysis-block ai-confidence-${confidenceTone}">
      <div class="detail-heading">
        <p class="h2h-title">AI score read</p>
        <div class="detail-heading-actions">
          <span class="cache-badge">${formatCachedAge(aiAnalysisCache.get(fixtureKey)?.cachedAt)}</span>
          <button class="refresh-details-button" type="button" data-refresh-ai="${match.fixtureId}" ${isGenerating ? "disabled" : ""}>
            ${isGenerating ? "Generating..." : "Refresh AI read"}
          </button>
        </div>
      </div>
      <div class="ai-analysis-header">
        <strong>${cachedAnalysis.headline || "AI match view"}</strong>
        <span class="ai-analysis-score">${cachedAnalysis.predicted_score || match.score}</span>
      </div>
      <p class="prediction-note">${cachedAnalysis.summary || ""}</p>
      ${keyFactors.length ? `
        <div class="ai-analysis-list">
          ${keyFactors.map((item) => `<span class="ai-chip">${item}</span>`).join("")}
        </div>
      ` : ""}
      ${watchouts.length ? `
        <div class="ai-watchouts">
          <span class="ai-list-label">Watchouts</span>
          <ul>
            ${watchouts.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${missingSignals.length ? `
        <p class="ai-missing-signals">Missing live inputs: ${missingSignals.join(", ")}.</p>
      ` : ""}
    </div>
  `;
}

function getCurrentPageMatches(filter = activeFilter) {
  const visibleMatches = getVisibleMatches(filter);
  const totalPages = Math.max(1, Math.ceil(visibleMatches.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  return visibleMatches.slice(startIndex, startIndex + PAGE_SIZE);
}

function getAiReadyBadge(match) {
  if (!aiStatus.enabled) {
    return '<span class="ai-ready-badge is-off">AI unavailable</span>';
  }

  const cachedAnalysis = getCachedAiAnalysis(match.fixtureId);
  const providerId = cachedAnalysis?.provider || aiStatus.preferredProvider || "ai";
  const providerLabel = providerId === "google" ? "Google AI" : providerId === "openai" ? "OpenAI" : "AI";
  return `<span class="ai-ready-badge">${cachedAnalysis ? `${providerLabel} cached` : `${providerLabel} ready`}</span>`;
}

function renderDetailBody(match) {
  const fixtureKey = getDetailCacheKey(match.fixtureId);
  const isLoaded = detailCache.has(fixtureKey);
  const showCachedBadge = isLoaded && match.detailMeta?.source === "session";
  const cacheBadgeText = showCachedBadge ? formatCachedAge(match.detailMeta?.cachedAt) : "";
  const isRefreshing = pendingDetailRequests.has(fixtureKey);
  const updatedLabel = getUpdatedLabel(fixtureKey);

  return `
    <div class="h2h-block">
      <div class="detail-heading">
        <p class="h2h-title">Head-to-head</p>
        <div class="detail-heading-actions">
          ${showCachedBadge ? `<span class="cache-badge">${cacheBadgeText}</span>` : ""}
          ${updatedLabel ? `<span class="update-badge">${updatedLabel}</span>` : ""}
          <button class="refresh-details-button" type="button" data-refresh-details="${match.fixtureId}" ${isRefreshing ? "disabled" : ""}>
            ${isRefreshing ? "Refreshing..." : "Refresh stats"}
          </button>
        </div>
      </div>
      <div class="h2h-list">
        ${isLoaded
          ? Array.isArray(match.headToHead) && match.headToHead.length
            ? match.headToHead.map((item) => `
              <div class="h2h-item">
                <span>${formatShortDate(item.date)} ${item.home} ${item.score} ${item.away}</span>
              </div>
            `).join("")
            : '<div class="h2h-item"><span>No recent H2H results available</span></div>'
          : `
            <div class="skeleton-line short shimmer"></div>
            <div class="skeleton-line shimmer"></div>
            <div class="skeleton-line medium shimmer"></div>
          `}
      </div>
    </div>
    <div class="form-block">
      <p class="h2h-title">Last five results</p>
      <div class="form-columns">
        <div class="form-team">
          <span class="form-team-name">${match.home}</span>
          <div class="form-chips">
            ${isLoaded
              ? Array.isArray(match.lastResults?.home) && match.lastResults.home.length
                ? match.lastResults.home.map((item) => `
                  <span class="form-chip ${getResultClass(item.result)}" title="${item.opponent} ${item.score}">
                    ${item.result}
                  </span>
                `).join("")
                : '<span class="form-empty">No form data</span>'
              : '<span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span>'}
          </div>
        </div>
        <div class="form-team">
          <span class="form-team-name">${match.away}</span>
          <div class="form-chips">
            ${isLoaded
              ? Array.isArray(match.lastResults?.away) && match.lastResults.away.length
                ? match.lastResults.away.map((item) => `
                  <span class="form-chip ${getResultClass(item.result)}" title="${item.opponent} ${item.score}">
                    ${item.result}
                  </span>
                `).join("")
                : '<span class="form-empty">No form data</span>'
              : '<span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span><span class="form-empty shimmer">...</span>'}
          </div>
        </div>
      </div>
    </div>
    ${renderAiAnalysisBlock(match)}
  `;
}

async function generateAiAnalysis(fixtureId, options = {}) {
  const { forceRefresh = false } = options;
  const fixtureKey = String(fixtureId);
  const match = predictions.find((item) => String(item.fixtureId) === fixtureKey);
  if (!match) {
    return;
  }

  if (!forceRefresh) {
    const cachedAnalysis = getCachedAiAnalysis(fixtureId);
    if (cachedAnalysis) {
      return cachedAnalysis;
    }
  } else {
    aiAnalysisCache.delete(getAiAnalysisCacheKey(fixtureId));
    saveAiAnalysisCache();
  }

  if (pendingAiAnalysisRequests.has(fixtureKey)) {
    return pendingAiAnalysisRequests.get(fixtureKey);
  }

  if (!detailCache.has(getDetailCacheKey(fixtureId))) {
    await hydrateMatchDetailsWithOptions(fixtureId, { renderOnSuccess: false });
  }

  const request = (async () => {
    try {
      const response = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildAiAnalysisPayload(match))
      });
      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.error || "Could not generate AI analysis.");
        error.payload = data;
        throw error;
      }

      aiAnalysisCache.set(
        getAiAnalysisCacheKey(fixtureId),
        createAiAnalysisCacheEntry(data.analysis || {})
      );
      saveAiAnalysisCache();
      return data.analysis;
    } catch (error) {
      let message = "AI analysis could not be generated right now.";
      if (error.payload?.code === "missing_ai_provider_key") {
        message = "AI analysis needs GOOGLE_AI_API_KEY or OPENAI_API_KEY in .env before it can run.";
      } else if (error.payload?.error) {
        message = `AI analysis failed: ${error.payload.error}`;
      }

      setBoardStatus(message, "warning");
      return null;
    } finally {
      pendingAiAnalysisRequests.delete(fixtureKey);
      renderPredictions(activeFilter);
    }
  })();

  pendingAiAnalysisRequests.set(fixtureKey, request);
  renderPredictions(activeFilter);
  return request;
}

async function generateAiForVisibleMatches() {
  const pageMatches = getCurrentPageMatches(activeFilter);
  if (!pageMatches.length || !aiStatus.enabled) {
    return;
  }

  const targetMatches = pageMatches.filter((match) => !pendingAiAnalysisRequests.has(String(match.fixtureId)));
  if (!targetMatches.length) {
    return;
  }

  generateVisibleAiButton.disabled = true;
  generateVisibleAiButton.textContent = `Generating ${targetMatches.length} AI read${targetMatches.length === 1 ? "" : "s"}...`;
  setBoardStatus(`Generating AI analysis for ${targetMatches.length} visible match${targetMatches.length === 1 ? "" : "es"} using ${getAiProviderLabel()}.`, "success");

  try {
    for (const match of targetMatches) {
      await generateAiAnalysis(match.fixtureId);
    }
    setBoardStatus(`AI analysis generated for ${targetMatches.length} visible match${targetMatches.length === 1 ? "" : "es"}.`, "success");
  } finally {
    updateGenerateVisibleAiButton();
    renderPredictions(activeFilter);
  }
}

function getVisibleMatches(filter = activeFilter) {
  const normalizedSearch = teamSearchQuery.trim().toLowerCase();
  const filteredMatches = predictions.filter((match) => {
    const matchesLeague = filter === "all" || match.league === filter;
    const matchesSearch = !normalizedSearch
      || match.home.toLowerCase().includes(normalizedSearch)
      || match.away.toLowerCase().includes(normalizedSearch);
    const matchesFavorites = !showFavoritesOnly
      || favoriteTeams.has(match.home)
      || favoriteTeams.has(match.away);
    return matchesLeague && matchesSearch && matchesFavorites;
  });
  return sortPredictions(filteredMatches);
}

function prefetchVisiblePageDetails(filter = activeFilter) {
  const visibleMatches = getVisibleMatches(filter);
  const totalPages = Math.max(1, Math.ceil(visibleMatches.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedMatches = visibleMatches.slice(startIndex, startIndex + PAGE_SIZE);
  const matchesToPrefetch = shouldLimitPrefetchToExpanded()
    ? paginatedMatches.filter((match) => expandedCards.has(String(match.fixtureId)))
    : paginatedMatches;

  matchesToPrefetch.forEach((match) => {
    if (!applyCachedDetailsToMatch(match)) {
      hydrateMatchDetailsWithOptions(match.fixtureId, { renderOnSuccess: false });
    }
  });
}

function renderPredictions(filter = "all", options = {}) {
  const { scrollToTop = false } = options;
  const visibleMatches = getVisibleMatches(filter);

  if (!visibleMatches.length) {
    renderFavoritesSection();
    updateGenerateVisibleAiButton();
    predictionGrid.innerHTML = `
      <article class="prediction-card confidence-low">
        <div class="prediction-top">
          <div>
            <p class="league">No fixtures</p>
            <h3>No matches available for this filter</h3>
          </div>
        </div>
        <p class="prediction-note">Try another league filter or confirm the API key is set on the server.</p>
      </article>
    `;
    paginationWrap.hidden = true;
    return;
  }

  renderFavoritesSection();
  updateGenerateVisibleAiButton();
  const totalPages = Math.max(1, Math.ceil(visibleMatches.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const paginatedMatches = getCurrentPageMatches(filter);
  const featuredFixtureId = getFeaturedFixtureId(paginatedMatches);

  predictionGrid.innerHTML = paginatedMatches
    .map((match, index) => {
      const isFeatured = String(match.fixtureId) === String(featuredFixtureId);
      const fixtureId = String(match.fixtureId);
      const isPanelOpen = expandedCards.has(fixtureId) || (isFeatured && !collapsedFeaturedCards.has(fixtureId));
      return `
      <article class="prediction-card confidence-${getConfidenceBand(match.confidence)} ${isFeatured ? "is-featured" : ""}" data-fixture-id="${match.fixtureId}" style="animation-delay: ${index * 90}ms">
        <div class="prediction-top">
          <div class="fixture-heading">
            ${renderLeagueMeta(match)}
            <div class="fixture-teams">
              ${renderTeamIdentity(match.home, match.homeLogo, "left")}
              <span class="fixture-versus">vs</span>
              ${renderTeamIdentity(match.away, match.awayLogo, "right")}
            </div>
          </div>
          <div class="confidence-stack">
            ${isFeatured ? '<span class="featured-badge">Top Pick</span>' : ""}
            <div class="confidence-pill">${match.confidence}%</div>
          </div>
        </div>
        <div class="prediction-meta">
          <span class="meta-chip">${formatLocalKickoff(match.kickoffIso)}</span>
          <span class="meta-chip">${getStatusLabel(match)} ${getDisplayScore(match)}</span>
        </div>
        <div class="prediction-banner">${match.prediction}</div>
        <p class="prediction-note">${match.note}</p>
        ${isFeatured ? renderFeaturedStats(match) : ""}
        <div class="bar"><span style="width: ${match.confidence}%"></span></div>
        <div class="card-actions">
          ${getAiReadyBadge(match)}
          ${match.isAdminOverride ? '<span class="admin-badge">Admin override</span>' : ""}
          ${isLiveStatus(match.status) ? '<span class="live-badge is-live">LIVE</span>' : ""}
          ${isTodaySelected() ? '<span class="live-badge">Live auto refresh</span>' : ""}
        </div>
        <button class="detail-toggle" type="button" data-detail-toggle="${match.fixtureId}">
          ${isPanelOpen ? "Hide details" : "Show details"}
        </button>
        <div class="detail-panel ${isPanelOpen ? "is-open" : ""}">
          ${renderDetailBody(match)}
        </div>
        <div class="prediction-bottom">
          <span class="pick">${match.prediction}</span>
          <span>${match.market}</span>
        </div>
      </article>
    `;
    })
    .join("");

  renderPagination(visibleMatches.length);
  if (scrollToTop) {
    scrollBoardToTop();
  }
  attachDetailObserver();
  document.querySelectorAll("[data-detail-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const fixtureId = String(button.dataset.detailToggle);
      const isFeatured = String(featuredFixtureId) === fixtureId;
      const isDefaultFeaturedOpen = isFeatured && !collapsedFeaturedCards.has(fixtureId) && !expandedCards.has(fixtureId);

      if (isDefaultFeaturedOpen) {
        collapsedFeaturedCards.add(fixtureId);
      } else if (expandedCards.has(fixtureId)) {
        expandedCards.delete(fixtureId);
      } else if (collapsedFeaturedCards.has(fixtureId)) {
        collapsedFeaturedCards.delete(fixtureId);
      } else {
        expandedCards.add(fixtureId);
        collapsedFeaturedCards.delete(fixtureId);
        hydrateMatchDetails(fixtureId);
      }
      saveBoardState();
      renderPredictions(activeFilter);
    });
  });
  document.querySelectorAll("[data-team-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const teamName = String(button.dataset.teamFavorite);
      if (favoriteTeams.has(teamName)) {
        favoriteTeams.delete(teamName);
      } else {
        favoriteTeams.add(teamName);
      }
      saveFavoriteTeams();
      renderPredictions(activeFilter);
    });
  });
  document.querySelectorAll("[data-refresh-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const fixtureId = String(button.dataset.refreshDetails);
      hydrateMatchDetailsWithOptions(fixtureId, {
        forceRefresh: true,
        renderOnSuccess: true,
        renderOnStart: true
      });
    });
  });
  document.querySelectorAll("[data-generate-ai]").forEach((button) => {
    button.addEventListener("click", () => {
      generateAiAnalysis(String(button.dataset.generateAi));
    });
  });
  document.querySelectorAll("[data-refresh-ai]").forEach((button) => {
    button.addEventListener("click", () => {
      generateAiAnalysis(String(button.dataset.refreshAi), { forceRefresh: true });
    });
  });
}

function renderLeagueFilters() {
  const leagues = [...new Set(predictions.map((match) => match.league))].sort();
  const buttons = [
    '<button class="filter-button" data-filter="all" type="button">All</button>',
    ...leagues.map((league) => `<button class="filter-button" data-filter="${league}" type="button">${league}</button>`)
  ];

  leagueFilters.innerHTML = buttons.join("");
  activeFilter = leagues.includes(activeFilter) || activeFilter === "all" ? activeFilter : "all";

  leagueFilters.querySelectorAll(".filter-button").forEach((button) => {
    if (button.dataset.filter === activeFilter) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      currentPage = 1;
      leagueFilters.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      saveBoardState();
      renderPredictions(activeFilter);
    });
  });
}

function renderLeagueOptions() {
  leagueOptions.innerHTML = availableLeagues
    .map((league) => {
      const checked = selectedLeagues.includes(league) ? "checked" : "";
      return `
        <label class="league-option">
          <input type="checkbox" value="${league}" ${checked}>
          <span>${league}</span>
        </label>
      `;
    })
    .join("");

  leagueOptions.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      selectedLeagues = Array.from(
        leagueOptions.querySelectorAll('input[type="checkbox"]:checked')
      ).map((input) => input.value);
      saveBoardState();
    });
  });
}

async function loadMatches(options = {}) {
  const { silent = false } = options;
  const selectedDate = matchDateInput.value || getTodayDateString();
  const leaguesToQuery = selectedLeagues.length ? selectedLeagues : availableLeagues;
  const params = new URLSearchParams({
    date: selectedDate,
    leagues: leaguesToQuery.join(",")
  });

  if (!silent) {
    setBoardStatus(`Loading live fixtures from football-data.org for ${selectedDate} with a ${formatCacheTtlLabel(detailCacheTtlMs)} detail cache...`);
  }

  try {
    const response = await fetch(`/api/matches?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || "Could not load match data.");
      error.payload = data;
      throw error;
    }

    predictions = (data.matches || []).map((match) => {
      applyCachedDetailsToMatch(match);
      return match;
    });
    aiStatus = data.aiStatus || { enabled: false, providers: [], preferredProvider: null };
    applyAdminOverridesToPredictions();
    renderHeroPanel(predictions);
    selectedLeagues = data.selectedLeagues?.length ? data.selectedLeagues : leaguesToQuery;
    renderLeagueOptions();
    renderLeagueFilters();
    if (!silent) {
      setBoardStatus(`Loaded ${predictions.length} fixtures from ${data.source} for ${selectedDate} across ${selectedLeagues.length} competition${selectedLeagues.length === 1 ? "" : "s"}. Kickoff times are shown in your local timezone. ${aiStatus.enabled ? `${getAiProviderLabel()} is ready.` : "AI analysis is offline."}`, "success");
    } else {
      setBoardStatus(`Live scores refreshed automatically for ${selectedDate}.`, "success");
    }
    saveBoardState();
    updateGenerateVisibleAiButton();
    updateAdminFixtureOptions();
    renderPredictions(activeFilter);
    scheduleLiveRefresh();
    if (selectedLeagues.length <= 2) {
      loadStandings();
    } else {
      standingsData = [];
      renderStandingsSection();
      standingsStatus.textContent = "Choose one or two competitions to load standings without hitting the free-tier rate limit.";
    }
  } catch (error) {
    let message = "Unable to load live fixtures. Check the local server and API key.";
    let tone = "warning";

    if (error.payload?.code === "missing_api_key") {
      message = "Live fixtures are unavailable because API_FOOTBALL_KEY is missing. Add your token to .env, restart python server.py, and refresh the page.";
      tone = "danger";
    } else if (error.payload?.code === "rate_limited") {
      message = "football-data.org rate limit reached. Give it about a minute, then refresh the board.";
      tone = "warning";
    } else if (error.payload?.error) {
      message = `Live fixtures could not load: ${error.payload.error}`;
    } else {
      message = "Unable to load live fixtures. Check that python server.py is running, then confirm your API key is set in .env.";
      tone = "danger";
    }

    setBoardStatus(message, tone);
    aiStatus = { enabled: false, providers: [], preferredProvider: null };
    predictions = [];
    renderHeroPanel([]);
    currentPage = 1;
    renderLeagueOptions();
    renderLeagueFilters();
    updateAdminFixtureOptions();
    updateGenerateVisibleAiButton();
    standingsData = [];
    renderStandingsSection();
    renderPredictions("all");
  }
}

refreshMatchesButton.addEventListener("click", () => {
  currentPage = 1;
  saveBoardState();
  scrollBoardToTop();
  loadMatches();
});

generateVisibleAiButton.addEventListener("click", () => {
  generateAiForVisibleMatches();
});

selectAllLeaguesButton.addEventListener("click", () => {
  selectedLeagues = [...availableLeagues];
  renderLeagueOptions();
  saveBoardState();
});

clearAllLeaguesButton.addEventListener("click", () => {
  selectedLeagues = [];
  renderLeagueOptions();
  saveBoardState();
});

previousPageButton.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    saveBoardState();
    renderPredictions(activeFilter, { scrollToTop: true });
  }
});

nextPageButton.addEventListener("click", () => {
  currentPage += 1;
  saveBoardState();
  renderPredictions(activeFilter, { scrollToTop: true });
});

sortMatchesSelect.addEventListener("change", () => {
  currentSort = sortMatchesSelect.value;
  currentPage = 1;
  saveBoardState();
  renderPredictions(activeFilter, { scrollToTop: true });
});

teamSearchInput.addEventListener("input", () => {
  teamSearchQuery = teamSearchInput.value.trim();
  currentPage = 1;
  saveBoardState();
  renderPredictions(activeFilter, { scrollToTop: true });
});

toggleFavoritesOnlyButton.addEventListener("click", () => {
  showFavoritesOnly = !showFavoritesOnly;
  currentPage = 1;
  updateFavoritesButton();
  saveBoardState();
  renderPredictions(activeFilter, { scrollToTop: true });
});

toggleAdminPanelButton.addEventListener("click", () => {
  adminPanelOpen = !adminPanelOpen;
  updateAdminPanelVisibility();
  saveBoardState();
});

adminFixtureSelect.addEventListener("change", () => {
  populateAdminForm(adminFixtureSelect.value);
});

adminAuthForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const enteredPassword = adminPassword.value.trim();
  if (!enteredPassword) {
    return;
  }

  const savedPassword = getStoredAdminPassword();
  if (!savedPassword) {
    setStoredAdminPassword(enteredPassword);
    adminUnlocked = true;
    adminStatus.textContent = "Admin password saved. Dashboard unlocked.";
  } else if (enteredPassword === savedPassword) {
    adminUnlocked = true;
    adminStatus.textContent = "Admin dashboard unlocked.";
  } else {
    adminUnlocked = false;
    adminStatus.textContent = "Incorrect admin password.";
  }

  adminPassword.value = "";
  updateAdminPanelVisibility();
});

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const fixtureId = String(adminFixtureSelect.value || "");
  if (!fixtureId) {
    return;
  }

  adminOverrides.set(fixtureId, {
    prediction: adminPrediction.value.trim(),
    score: adminScore.value.trim(),
    confidence: Number(adminConfidence.value),
    market: adminMarket.value.trim() || "Admin override",
    note: adminNote.value.trim() || "Custom admin prediction override.",
  });
  aiAnalysisCache.delete(getAiAnalysisCacheKey(fixtureId));
  saveAiAnalysisCache();
  saveAdminOverrides();
  applyAdminOverridesToPredictions();
  renderHeroPanel(predictions);
  setBoardStatus("Admin prediction override saved.", "success");
  renderPredictions(activeFilter);
});

clearAdminFixtureButton.addEventListener("click", () => {
  const fixtureId = String(adminFixtureSelect.value || "");
  if (!fixtureId) {
    return;
  }

  adminOverrides.delete(fixtureId);
  aiAnalysisCache.delete(getAiAnalysisCacheKey(fixtureId));
  saveAiAnalysisCache();
  saveAdminOverrides();
  setBoardStatus("Selected admin override cleared.", "success");
  loadMatches({ silent: true });
});

clearAdminOverridesButton.addEventListener("click", () => {
  adminOverrides.clear();
  aiAnalysisCache.clear();
  saveAiAnalysisCache();
  saveAdminOverrides();
  setBoardStatus("All admin overrides cleared.", "success");
  loadMatches({ silent: true });
});

lockAdminPanelButton.addEventListener("click", () => {
  adminUnlocked = false;
  adminStatus.textContent = "Admin dashboard locked.";
  updateAdminPanelVisibility();
});

matchDateInput.addEventListener("change", () => {
  currentPage = 1;
  saveBoardState();
});

toggleBoardControlsButton.addEventListener("click", () => {
  boardControlsOpen = !boardControlsOpen;
  syncControlVisibility();
});

window.addEventListener("resize", syncControlVisibility);

predictorForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const homeTeam = document.getElementById("homeTeam").value.trim();
  const awayTeam = document.getElementById("awayTeam").value.trim();
  const homeForm = Number(document.getElementById("homeForm").value);
  const awayForm = Number(document.getElementById("awayForm").value);
  const homeAttack = Number(document.getElementById("homeAttack").value);
  const awayDefense = Number(document.getElementById("awayDefense").value);

  const homeScoreIndex = homeForm * 0.45 + homeAttack * 0.4 + (10 - awayDefense) * 0.25;
  const awayScoreIndex = awayForm * 0.5 + awayDefense * 0.15;
  const edge = homeScoreIndex - awayScoreIndex;

  let resultText = "Draw lean";
  let scoreText = "1 - 1";
  let confidence = 52;

  if (edge > 2.2) {
    resultText = `${homeTeam} to win`;
    scoreText = "2 - 0";
    confidence = 73;
  } else if (edge > 1) {
    resultText = `${homeTeam} to win`;
    scoreText = "2 - 1";
    confidence = 64;
  } else if (edge < -1.4) {
    resultText = `${awayTeam} to win`;
    scoreText = "1 - 2";
    confidence = 61;
  }

  customResult.innerHTML = `
    <strong>${homeTeam} vs ${awayTeam}</strong><br>
    Lean: ${resultText}<br>
    Projected score: ${scoreText}<br>
    Confidence: ${confidence}% based on the weighted form and strength inputs.
  `;
});

matchDateInput.value = getTodayDateString();
loadBoardState();
loadDetailCache();
loadAiAnalysisCache();
loadFavoriteTeams();
loadAdminOverrides();
sortMatchesSelect.value = currentSort;
teamSearchInput.value = teamSearchQuery;
renderLeagueOptions();
syncControlVisibility();
updateFavoritesButton();
updateAdminPanelVisibility();
updateGenerateVisibleAiButton();
renderHeroPanel([]);
updateAdminFixtureOptions();
renderStandingsSection();
loadMatches();
