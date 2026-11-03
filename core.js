window.SC = (() => {
  const CFG = window.WEATHER_CONFIG || {};
  const OWM = "https://api.openweathermap.org";
  const K = { recent: "skycast.recent", fav: "skycast.fav", unit: "skycast.unit", cache: "skycast.cache", last: "skycast.last" };
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  let unit = store.get(K.unit, "metric");
  const imp = () => unit === "imperial";
  const temp = (c) => Math.round(imp() ? (c * 9) / 5 + 32 : c);
  const deg = () => (imp() ? "°F" : "°C");
  const tzDate = (u, tz) => new Date((u + tz) * 1000);
  const fmtTime = (u, tz, o = { hour: "2-digit", minute: "2-digit" }) => tzDate(u, tz).toLocaleTimeString([], { ...o, timeZone: "UTC" });
  const compass = (d) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];

  function visual(icon) {
    const night = icon.endsWith("n"), g = icon.slice(0, 2);
    const map = { "01": ["clear", "☀️", "🌙"], "02": ["clouds", "⛅", "☁️"], "03": ["clouds", "☁️", "☁️"], "04": ["clouds", "☁️", "☁️"],
      "09": ["rain", "🌧️", "🌧️"], "10": ["rain", "🌦️", "🌧️"], "11": ["storm", "⛈️", "⛈️"], "13": ["snow", "❄️", "❄️"], "50": ["mist", "🌫️", "🌫️"] };
    const [sky, day, nt] = map[g] || map["01"];
    return {
      sky: sky === "storm" ? "storm" : `${sky}-${night ? "n" : "d"}`,
      emoji: night ? nt : day,
      fx: sky === "rain" || sky === "storm" ? "rain" : sky === "snow" ? "snow" : sky === "clear" && night ? "stars" : "none"
    };
  }

  async function api(path, params) {
    const qs = new URLSearchParams(params);
    let base = OWM;
    if (CFG.PROXY_URL) base = CFG.PROXY_URL.replace(/\/$/, "");
    else {
      if (!CFG.API_KEY || CFG.API_KEY.startsWith("PASTE")) throw new Error("Add your OpenWeather API key in config.js first.");
      qs.set("appid", CFG.API_KEY);
    }
    let res;
    try { res = await fetch(`${base}${path}?${qs}`); } catch { throw new Error("You appear to be offline. Check your connection."); }
    if (res.status === 401) throw new Error("API key is invalid or not activated yet. New keys can take up to 2 hours.");
    if (res.status === 404) throw new Error("Location not found. Check the spelling.");
    if (res.status === 429) throw new Error("Too many requests. Please wait a minute and try again.");
    if (!res.ok) throw new Error("Something went wrong. Please try again.");
    return res.json();
  }

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  const near = (a, b) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05;
  const favs = () => store.get(K.fav, []);
  function remember(loc) {
    const list = store.get(K.recent, []).filter((x) => !near(x, loc));
    store.set(K.recent, [loc, ...list].slice(0, 6));
  }
  function go(q) {
    location.href = q.q ? `weather.html?q=${encodeURIComponent(q.q)}` : `weather.html?lat=${q.lat}&lon=${q.lon}`;
  }
  function chips(box) {
    box.innerHTML = "";
    const f = favs(), recent = store.get(K.recent, []).filter((r) => !f.some((x) => near(x, r)));
    const add = (loc, star) => {
      const b = el("button", "chip", (star ? "★ " : "") + loc.name); b.type = "button";
      b.addEventListener("click", () => go({ lat: loc.lat, lon: loc.lon })); box.appendChild(b);
    };
    f.forEach((x) => add(x, true)); recent.forEach((x) => add(x, false));
    if (recent.length) {
      const c = el("button", "chip clear", "Clear recent"); c.type = "button";
      c.addEventListener("click", () => { store.set(K.recent, []); chips(box); }); box.appendChild(c);
    }
  }

  function bindSearch({ form, input, list, onPick, onText }) {
    let sug = [], idx = -1, timer;
    const hide = () => { list.hidden = true; idx = -1; };
    const paint = () => {
      list.innerHTML = "";
      sug.forEach((s, i) => {
        const li = el("li", "", s.name); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === idx));
        li.appendChild(el("small", "", [s.state, s.country].filter(Boolean).join(", ")));
        li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(s); });
        list.appendChild(li);
      });
      list.hidden = !sug.length;
    };
    const pick = (s) => { input.value = ""; hide(); input.blur(); onPick({ lat: s.lat, lon: s.lon }); };
    input.addEventListener("input", () => {
      clearTimeout(timer); const v = input.value.trim();
      if (v.length < 2) { sug = []; return hide(); }
      timer = setTimeout(async () => { try { sug = await api("/geo/1.0/direct", { q: v, limit: 5 }); idx = -1; paint(); } catch { hide(); } }, 300);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && sug.length) { e.preventDefault(); idx = (idx + 1) % sug.length; paint(); }
      if (e.key === "ArrowUp" && sug.length) { e.preventDefault(); idx = (idx - 1 + sug.length) % sug.length; paint(); }
      if (e.key === "Escape") hide();
    });
    input.addEventListener("blur", () => setTimeout(hide, 120));
    form.addEventListener("submit", (e) => {
      e.preventDefault(); const v = input.value.trim(); if (!v) return;
      if (sug.length) return pick(sug[Math.max(idx, 0)]);
      input.value = ""; onText(v);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); } });
  }

  function locate(cb) {
    if (!navigator.geolocation) return toast("Geolocation is not supported on this device");
    toast("Finding your location…");
    navigator.geolocation.getCurrentPosition((p) => cb({ lat: p.coords.latitude, lon: p.coords.longitude }), () => toast("Could not get your location"), { timeout: 9000 });
  }

  function initUnit(cb) {
    const set = (u) => {
      unit = u; store.set(K.unit, u);
      $("unitC").setAttribute("aria-pressed", String(u === "metric")); $("unitF").setAttribute("aria-pressed", String(u === "imperial"));
    };
    set(unit);
    $("unitC").addEventListener("click", () => { set("metric"); cb(); });
    $("unitF").addEventListener("click", () => { set("imperial"); cb(); });
  }

  const cv = $("fx"), ctx = cv.getContext("2d"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let parts = [], mode = "none", raf = 0;
  const size = () => { cv.width = innerWidth; cv.height = innerHeight; };
  addEventListener("resize", size); size();
  function drawStars(t) {
    ctx.fillStyle = "#fff";
    parts.forEach((p) => { ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(p.t + t)); ctx.beginPath(); ctx.arc(p.x, p.y * 0.7, p.s * 1.2, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  function frame(t = 0) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (mode === "stars") drawStars(t / 900);
    else parts.forEach((p) => {
      if (mode === "rain") {
        ctx.strokeStyle = "rgba(190,220,255,.5)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 3, p.y + 14 * p.s); ctx.stroke();
        p.y += 16 * p.s; p.x -= 1.5;
      } else {
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(p.x + Math.sin(p.t) * 12, p.y, 1.5 + p.s * 1.6, 0, 7); ctx.fill();
        p.y += 1 + p.s * 1.4; p.t += 0.02;
      }
      if (p.y > cv.height) { p.y = -10; p.x = Math.random() * cv.width; }
    });
    raf = requestAnimationFrame(frame);
  }
  function setFx(m) {
    if (m === mode) return; mode = m; cancelAnimationFrame(raf); parts = [];
    const n = { rain: 130, snow: 90, stars: 80, none: 0 }[m];
    for (let i = 0; i < n; i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: 0.5 + Math.random(), t: Math.random() * 6 });
    if (n && !reduce) frame(); else { ctx.clearRect(0, 0, cv.width, cv.height); if (m === "stars") drawStars(0); }
  }

  return { CFG, K, $, el, store, api, visual, imp, temp, deg, tzDate, fmtTime, compass, toast, near, favs, remember, go, chips, bindSearch, locate, initUnit, setFx };
})();