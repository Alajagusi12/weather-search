(() => {
  const { $, el, api, visual, imp, temp, deg, tzDate, fmtTime, compass, store, K, toast, near, favs, remember, chips, bindSearch, locate, initUnit, setFx } = SC;
  const NS = "http://www.w3.org/2000/svg";
  let state = null, lastQuery = null, clock = null;

  const svg = (tag, attrs = {}, text) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function show(which) {
    ["loading", "error", "result"].forEach((id) => ($(id).hidden = id !== which));
    $("loading").setAttribute("aria-busy", String(which === "loading"));
  }
  function showError(msg) { $("errText").textContent = msg; show("error"); setFx("none"); }

  async function load(q) {
    lastQuery = q; show("loading");
    try {
      const cur = await api("/data/2.5/weather", { ...q, units: "metric" });
      const { lat, lon } = cur.coord;
      const [fc, air] = await Promise.all([
        api("/data/2.5/forecast", { lat, lon, units: "metric" }),
        api("/data/2.5/air_pollution", { lat, lon }).catch(() => null)
      ]);
      state = { cur, fc, air };
      store.set(K.cache, state);
      remember({ name: `${cur.name}, ${cur.sys.country}`, lat, lon });
      try { history.replaceState(null, "", `?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`); } catch {}
      document.title = `${cur.name} · Skycast`;
      render();
    } catch (e) {
      const cached = store.get(K.cache, null);
      if (cached && /offline/i.test(e.message)) { state = cached; render(); toast("Offline: showing saved data"); }
      else showError(e.message);
    }
  }

  function days() {
    const { fc, cur } = state, tz = cur.timezone, map = {};
    fc.list.forEach((r) => { const k = tzDate(r.dt, tz).toISOString().slice(0, 10); (map[k] = map[k] || []).push(r); });
    const out = Object.values(map).slice(0, 5).map((rows) => {
      const mid = rows.reduce((a, b) => Math.abs(tzDate(b.dt, tz).getUTCHours() - 12) < Math.abs(tzDate(a.dt, tz).getUTCHours() - 12) ? b : a);
      return { dt: mid.dt, icon: mid.weather[0].icon.replace("n", "d"), min: Math.min(...rows.map((r) => r.main.temp_min)),
        max: Math.max(...rows.map((r) => r.main.temp_max)), pop: Math.max(...rows.map((r) => r.pop || 0)) };
    });
    out[0].min = Math.min(out[0].min, cur.main.temp); out[0].max = Math.max(out[0].max, cur.main.temp);
    return out;
  }

  const dew = (t, rh) => { const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t); return (243.12 * g) / (17.62 - g); };

  function updateClock() {
    if (!state) return;
    const tz = state.cur.timezone, now = Math.floor(Date.now() / 1000);
    $("localTime").textContent = fmtTime(now, tz);
    $("localDate").textContent = tzDate(now, tz).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  }

  function currentLoc() { return { name: `${state.cur.name}, ${state.cur.sys.country}`, lat: state.cur.coord.lat, lon: state.cur.coord.lon }; }
  function renderFav() {
    const on = favs().some((x) => near(x, currentLoc()));
    $("favBtn").textContent = on ? "★" : "☆"; $("favBtn").setAttribute("aria-pressed", String(on));
  }

  function drawChart(hours, tz) {
    const box = $("chart"); box.innerHTML = "";
    const W = 640, H = 222, pad = 36, top = 34, base = 138, bars = 184;
    const vals = hours.map((h) => temp(h.main.temp));
    const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
    const x = (i) => pad + i * ((W - pad * 2) / (hours.length - 1));
    const y = (v) => base - ((v - lo) / (hi - lo)) * (base - top);
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Temperature and rain chance over the next 24 hours" });
    const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    root.append(svg("path", { d: `${d} L${x(hours.length - 1)} ${base} L${x(0)} ${base}Z`, class: "ar" }), svg("path", { d, class: "ln" }));
    hours.forEach((h, i) => {
      const p = h.pop || 0;
      if (p > 0) root.append(svg("rect", { x: x(i) - 8, y: bars - p * 30, width: 16, height: Math.max(p * 30, 2), rx: 3, class: "pb" }));
      root.append(
        svg("circle", { cx: x(i), cy: y(vals[i]), r: 4.5, class: "pt" }),
        svg("text", { x: x(i), y: y(vals[i]) - 12, class: "lb", "text-anchor": "middle" }, `${vals[i]}°`),
        svg("text", { x: x(i), y: H - 6, class: "lb dim", "text-anchor": "middle" }, i ? fmtTime(h.dt, tz, { hour: "numeric" }) : "Now")
      );
    });
    box.appendChild(root);
  }

  function drawSun() {
    const { cur } = state, tz = cur.timezone, { sunrise, sunset } = cur.sys, now = Date.now() / 1000;
    const f = (now - sunrise) / (sunset - sunrise), c = Math.min(Math.max(f, 0), 1), up = f >= 0 && f <= 1;
    const th = Math.PI * (1 - c), cx = 150 + 130 * Math.cos(th), cy = 130 - 130 * Math.sin(th);
    const arc = "M20 130 A130 130 0 0 1 280 130";
    const box = $("sun"); box.innerHTML = "";
    const root = svg("svg", { viewBox: "0 0 300 168", role: "img", "aria-label": "Sun position between sunrise and sunset" });
    root.append(
      svg("path", { d: arc, class: "track" }),
      svg("path", { d: arc, class: "prog", pathLength: 1, "stroke-dasharray": `${c} 1` }),
      svg("line", { x1: 8, y1: 130, x2: 292, y2: 130, class: "hz" }),
      svg("circle", { cx, cy, r: up ? 11 : 8, class: up ? "sun" : "moon" }),
      svg("text", { x: 20, y: 152, class: "lb dim", "text-anchor": "middle" }, fmtTime(sunrise, tz)),
      svg("text", { x: 280, y: 152, class: "lb dim", "text-anchor": "middle" }, fmtTime(sunset, tz)),
      svg("text", { x: 150, y: 100, class: "lb", "text-anchor": "middle" }, up ? "Sun is up" : "Sun is down")
    );
    const len = sunset - sunrise;
    root.append(svg("text", { x: 150, y: 120, class: "lb dim", "text-anchor": "middle" }, `${Math.floor(len / 3600)}h ${Math.round((len % 3600) / 60)}m of daylight`));
    box.appendChild(root);
  }

  const AQ = ["Good", "Fair", "Moderate", "Poor", "Very poor"], AC = ["#4ade80", "#a3e635", "#facc15", "#fb923c", "#f87171"];
  const POL = [["pm2_5", "PM2.5", 75], ["pm10", "PM10", 200], ["o3", "Ozone", 240], ["no2", "NO₂", 200], ["so2", "SO₂", 750], ["co", "CO", 15400]];
  function drawAir() {
    const box = $("air"); box.innerHTML = "";
    const a = state.air && state.air.list[0];
    if (!a) { box.appendChild(el("p", "muted", "Air quality data is not available for this location.")); return; }
    const i = a.main.aqi - 1;
    const head = el("div", "aq-head"), name = el("b", "", AQ[i]), dot = el("i", "dot"); dot.style.background = AC[i];
    name.prepend(dot); head.append(name, el("span", "muted", `Index ${a.main.aqi} of 5`));
    const scale = el("div", "scale"); AC.forEach((c) => { const s = el("span"); s.style.background = c; scale.appendChild(s); });
    const mk = el("em", "mark"); mk.style.left = `${(i + 0.5) * 20}%`; scale.appendChild(mk);
    box.append(head, scale);
    const list = el("div", "pols");
    POL.forEach(([k, label, max]) => {
      const v = a.components[k], fr = Math.min(v / max, 1);
      const row = el("div", "pol"), bar = el("i"), fill = el("u");
      fill.style.width = `${Math.max(fr * 100, 3)}%`; fill.style.background = AC[Math.min(Math.floor(fr * 5), 4)]; bar.appendChild(fill);
      row.append(el("span", "", label), bar, el("small", "", `${v.toFixed(1)} µg/m³`)); list.appendChild(row);
    });
    box.appendChild(list);
  }

  function render() {
    const { cur, fc } = state, tz = cur.timezone, w = cur.weather[0], v = visual(w.icon), ds = days();
    document.body.dataset.sky = v.sky; setFx(v.fx);
    $("cityName").textContent = `${cur.name}, ${cur.sys.country}`;
    $("emoji").textContent = v.emoji; $("temp").textContent = `${temp(cur.main.temp)}${deg()}`;
    $("condition").textContent = w.description;
    $("hiLo").textContent = `High ${temp(ds[0].max)}${deg()} · Low ${temp(ds[0].min)}${deg()} · Feels like ${temp(cur.main.feels_like)}${deg()}`;
    const rain = Math.max(...fc.list.slice(0, 8).map((r) => r.pop || 0));
    $("summary").textContent = `${w.description[0].toUpperCase() + w.description.slice(1)} right now. ${rain >= 0.4 ? `Rain is likely in the next 24 hours (${Math.round(rain * 100)}%), so take an umbrella.` : "No significant rain expected in the next 24 hours."}`;
    updateClock(); clearInterval(clock); clock = setInterval(updateClock, 30000);
    renderFav(); chips($("chips"));

    const hours = [{ dt: cur.dt, main: cur.main, weather: cur.weather, pop: 0 }, ...fc.list.slice(0, 8)];
    drawChart(hours, tz);
    const hr = $("hourly"); hr.innerHTML = "";
    hours.forEach((r, i) => {
      const d = el("div", "hour" + (i ? "" : " now-h"));
      d.append(el("span", "", i ? fmtTime(r.dt, tz, { hour: "numeric" }) : "Now"), el("span", "e", visual(r.weather[0].icon).emoji), el("b", "", `${temp(r.main.temp)}°`));
      if (r.pop >= 0.2) d.appendChild(el("small", "", `${Math.round(r.pop * 100)}%`));
      hr.appendChild(d);
    });

    const wind = imp() ? `${Math.round(cur.wind.speed * 2.237)} mph` : `${Math.round(cur.wind.speed * 3.6)} km/h`;
    const gust = cur.wind.gust ? (imp() ? `${Math.round(cur.wind.gust * 2.237)} mph` : `${Math.round(cur.wind.gust * 3.6)} km/h`) : "None";
    const vis = cur.visibility ?? 10000, visText = imp() ? `${(vis / 1609).toFixed(1)} mi` : `${(vis / 1000).toFixed(1)} km`;
    const pr = (cur.rain && cur.rain["1h"]) || (cur.snow && cur.snow["1h"]) || 0, prText = imp() ? `${(pr / 25.4).toFixed(2)} in` : `${pr.toFixed(1)} mm`;
    const dt = $("details"); dt.innerHTML = "";
    [["Feels like", `${temp(cur.main.feels_like)}${deg()}`, cur.main.feels_like > cur.main.temp + 1 ? "Warmer than the air" : cur.main.feels_like < cur.main.temp - 1 ? "Cooler than the air" : "Close to the air temperature"],
     ["Humidity", `${cur.main.humidity}%`, `Dew point ${temp(dew(cur.main.temp, cur.main.humidity))}${deg()}`],
     ["Wind", wind, `From the ${compass(cur.wind.deg || 0)}`, cur.wind.deg || 0],
     ["Wind gusts", gust, "Peak speed"],
     ["Pressure", `${cur.main.pressure} hPa`, cur.main.pressure < 1009 ? "Low" : cur.main.pressure > 1022 ? "High" : "Normal"],
     ["Visibility", visText, vis >= 10000 ? "Clear view" : "Reduced"],
     ["Cloud cover", `${cur.clouds.all}%`, "Of the sky"],
     ["Precipitation", prText, "Last hour"]].forEach(([l, val, sub, wd]) => {
      const t = el("div", "tile"), b = el("b", "", val);
      if (wd !== undefined) { const a = el("span", "arrow", "↑ "); a.style.transform = `rotate(${wd + 180}deg)`; b.prepend(a); }
      t.append(el("small", "", l), b, el("span", "", sub)); dt.appendChild(t);
    });

    const dl = $("daily"); dl.innerHTML = "";
    const lo = Math.min(...ds.map((d) => d.min)), hi = Math.max(...ds.map((d) => d.max));
    ds.forEach((d, i) => {
      const r = el("div", "day"), range = el("div", "range"), bar = el("i");
      bar.style.setProperty("--l", `${((d.min - lo) / (hi - lo || 1)) * 100}%`);
      bar.style.setProperty("--w", `${Math.max(((d.max - d.min) / (hi - lo || 1)) * 100, 8)}%`);
      range.append(el("span", "", `${temp(d.min)}°`), bar, el("span", "", `${temp(d.max)}°`), el("em", "", d.pop >= 0.2 ? `${Math.round(d.pop * 100)}%` : ""));
      r.append(el("span", "n", i === 0 ? "Today" : tzDate(d.dt, tz).toLocaleDateString([], { weekday: "short", timeZone: "UTC" })), el("span", "e", visual(d.icon).emoji), range);
      dl.appendChild(r);
    });

    drawSun(); drawAir();
    show("result");
  }

  $("favBtn").addEventListener("click", () => {
    const loc = currentLoc(), list = favs(), on = list.some((x) => near(x, loc));
    store.set(K.fav, on ? list.filter((x) => !near(x, loc)) : [loc, ...list].slice(0, 8));
    toast(on ? "Removed from saved places" : "Saved to your places"); renderFav(); chips($("chips"));
  });
  $("retryBtn").addEventListener("click", () => (lastQuery ? load(lastQuery) : (location.href = "index.html")));
  bindSearch({ form: $("searchForm"), input: $("cityInput"), list: $("sugList"), onPick: load, onText: (q) => load({ q }) });
  $("locBtn").addEventListener("click", () => locate(load));
  initUnit(() => state && !$("result").hidden && render());
  chips($("chips"));

  const p = new URLSearchParams(location.search);
  if (p.get("lat") && p.get("lon")) load({ lat: p.get("lat"), lon: p.get("lon") });
  else if (p.get("q")) load({ q: p.get("q") });
  else showError("No city or location was provided. Go back and search for a place.");
})();