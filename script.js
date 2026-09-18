// ========== CONFIG ==========
const API_KEY = "c2d381892ef6d498e5103b51dbd34547";
const HISTORY_KEY = "weatherDashboard.recentCities";
const UNIT_KEY = "weatherDashboard.unit";
const MAX_HISTORY = 5;

let unit = localStorage.getItem(UNIT_KEY) || "metric";
let currentReading = null;

// ========== HELPERS ==========
function getWeatherVisuals(iconCode) {
  const isNight = iconCode.endsWith("n");
  const group = iconCode.slice(0, 2);

  const visuals = {
    "01": { emoji: isNight ? "🌙" : "☀️", start: isNight ? "#1B2A3A" : "#BFE0F0", end: isNight ? "#3D5470" : "#EAF2F6" },
    "02": { emoji: isNight ? "☁️" : "⛅", start: "#B8C9D6", end: "#EAF2F6" },
    "03": { emoji: "☁️", start: "#AEB8C2", end: "#E4E9ED" },
    "04": { emoji: "☁️", start: "#9CA8B4", end: "#DCE2E7" },
    "09": { emoji: "🌧️", start: "#6E8194", end: "#C7D2DB" },
    "10": { emoji: "🌦️", start: "#7C93A6", end: "#D3DEE6" },
    "11": { emoji: "⛈️", start: "#4A5568", end: "#8C99AB" },
    "13": { emoji: "❄️", start: "#DCE8F0", end: "#F5F9FC" },
    "50": { emoji: "🌫️", start: "#B8BFC5", end: "#E6E9EB" },
  };
  return visuals[group] || visuals["01"];
}

function applyBackground(iconCode) {
  const v = getWeatherVisuals(iconCode);
  document.body.style.setProperty("--bg-start", v.start);
  document.body.style.setProperty("--bg-end", v.end);
}

function convertTemp(celsius, toUnit) {
  return toUnit === "imperial" ? (celsius * 9) / 5 + 32 : celsius;
}

// ========== HISTORY ==========
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveToHistory(cityLabel) {
  let history = loadHistory().filter(c => c.toLowerCase() !== cityLabel.toLowerCase());
  history.unshift(cityLabel);
  history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
  const chips = document.getElementById("recentChips");
  if (!chips) return;

  const history = loadHistory();
  chips.innerHTML = "";

  if (history.length === 0) {
    chips.classList.add("hidden");
    return;
  }

  chips.classList.remove("hidden");
  history.forEach(city => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = city;
    btn.onclick = () => {
      window.location.href = `weather.html?city=${encodeURIComponent(city)}`;
    };
    chips.appendChild(btn);
  });
}

// ========== FETCH ==========
async function fetchWeather(city = null, lat = null, lon = null) {
  try {
    let currentUrl;

    if (city) {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
    } else {
      currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    }

    const currentRes = await fetch(currentUrl);
    if (!currentRes.ok) {
      if (currentRes.status === 401) {
        throw new Error("API key is invalid or not activated yet. Wait 10-30 minutes and try again.");
      }
      if (currentRes.status === 404) {
        throw new Error("City not found. Check the spelling.");
      }
      throw new Error("Something went wrong. Please try again.");
    }

    const currentData = await currentRes.json();

    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${currentData.coord.lat}&lon=${currentData.coord.lon}&appid=${API_KEY}&units=metric`;
    const forecastRes = await fetch(forecastUrl);
    const forecastData = forecastRes.ok ? await forecastRes.json() : null;

    renderWeather(currentData, forecastData);
    saveToHistory(`${currentData.name}, ${currentData.sys.country}`);
  } catch (err) {
    showError(err.message || "Couldn't load weather.");
  }
}

// ========== RENDER ==========
function showError(msg) {
  const loading = document.getElementById("loadingState");
  const error = document.getElementById("errorState");
  const result = document.getElementById("weatherResult");

  if (loading) loading.classList.add("hidden");
  if (result) result.classList.add("hidden");
  if (error) {
    error.textContent = msg;
    error.classList.remove("hidden");
  }
}

function renderWeather(current, forecast) {
  currentReading = { current, forecast };

  const loading = document.getElementById("loadingState");
  const error = document.getElementById("errorState");
  const result = document.getElementById("weatherResult");

  if (loading) loading.classList.add("hidden");
  if (error) error.classList.add("hidden");
  if (result) result.classList.remove("hidden");

  const iconCode = current.weather[0].icon;
  applyBackground(iconCode);

  document.getElementById("cityName").textContent = `${current.name}, ${current.sys.country}`;
  document.getElementById("weatherEmoji").textContent = getWeatherVisuals(iconCode).emoji;
  document.getElementById("condition").textContent = current.weather[0].description;

  const sunsetDate = new Date(current.sys.sunset * 1000);
  document.getElementById("sunset").textContent = sunsetDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  document.getElementById("humidity").textContent = `${current.main.humidity}%`;

  renderTemps();
  renderForecast(forecast);
}

function renderTemps() {
  if (!currentReading) return;
  const { current } = currentReading;
  const unitLabel = unit === "imperial" ? "°F" : "°C";
  const windUnit = unit === "imperial" ? "mph" : "m/s";
  const windSpeed = unit === "imperial" ? current.wind.speed * 2.237 : current.wind.speed;

  document.getElementById("temperature").textContent = `${Math.round(convertTemp(current.main.temp, unit))}${unitLabel}`;
  document.getElementById("feelsLike").textContent = `${Math.round(convertTemp(current.main.feels_like, unit))}${unitLabel}`;
  document.getElementById("wind").textContent = `${Math.round(windSpeed)} ${windUnit}`;

  const toggle = document.getElementById("unitToggle");
  if (toggle) toggle.textContent = unitLabel;
}

function renderForecast(forecastData) {
  const el = document.getElementById("forecast");
  if (!el || !forecastData?.list) return;

  el.innerHTML = "";
  const daily = forecastData.list.filter(r => r.dt_txt.includes("12:00:00")).slice(0, 5);

  daily.forEach(reading => {
    const date = new Date(reading.dt * 1000);
    const dayName = date.toLocaleDateString([], { weekday: "short" });
    const iconCode = reading.weather[0].icon;
    const unitLabel = unit === "imperial" ? "°F" : "°C";

    const div = document.createElement("div");
    div.className = "forecast-day";
    div.innerHTML = `
      <span class="forecast-day-name">${dayName}</span>
      <span class="forecast-emoji">${getWeatherVisuals(iconCode).emoji}</span>
      <span class="forecast-temp">${Math.round(convertTemp(reading.main.temp_max, unit))}${unitLabel}</span>
      <span class="forecast-temp-low">${Math.round(convertTemp(reading.main.temp_min, unit))}${unitLabel}</span>
    `;
    el.appendChild(div);
  });
}

// ========== PAGE LOGIC ==========
document.addEventListener("DOMContentLoaded", () => {
  const isHome = document.body.classList.contains("home-page");
  const isResult = document.getElementById("weatherResult");

  // Unit toggle (results page)
  const unitToggle = document.getElementById("unitToggle");
  if (unitToggle) {
    unitToggle.textContent = unit === "imperial" ? "°F" : "°C";
    unitToggle.onclick = () => {
      unit = unit === "metric" ? "imperial" : "metric";
      localStorage.setItem(UNIT_KEY, unit);
      renderTemps();
      if (currentReading) renderForecast(currentReading.forecast);
    };
  }

  // HOME PAGE
  if (isHome) {
    renderHistory();

    document.getElementById("searchForm").onsubmit = (e) => {
      e.preventDefault();
      const city = document.getElementById("cityInput").value.trim();
      if (city) {
        window.location.href = `weather.html?city=${encodeURIComponent(city)}`;
      }
    };

    document.getElementById("locationBtn").onclick = () => {
      if (!navigator.geolocation) {
        alert("Geolocation not supported");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.location.href = `weather.html?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`;
        },
        () => alert("Could not get your location")
      );
    };
  }

  // RESULTS PAGE
  if (isResult) {
    const params = new URLSearchParams(window.location.search);
    const city = params.get("city");
    const lat = params.get("lat");
    const lon = params.get("lon");

    if (city) {
      fetchWeather(city);
    } else if (lat && lon) {
      fetchWeather(null, lat, lon);
    } else {
      showError("No city or location provided.");
    }
  }
});