(() => {
  const { $, el, api, visual, temp, deg, fmtTime, go, chips, bindSearch, locate, initUnit, setFx, toast } = SC;
  const hour = new Date().getHours(), night = hour < 6 || hour >= 19;
  document.body.dataset.sky = night ? "clear-n" : "clear-d";
  setFx(night ? "stars" : "none");

  bindSearch({ form: $("searchForm"), input: $("cityInput"), list: $("sugList"), onPick: go, onText: (q) => go({ q }) });
  $("locBtn").addEventListener("click", () => locate(go));
  chips($("chips"));

  const CITIES = [
    { name: "Lagos", lat: 6.5244, lon: 3.3792 }, { name: "London", lat: 51.5072, lon: -0.1276 },
    { name: "New York", lat: 40.7128, lon: -74.006 }, { name: "Dubai", lat: 25.2048, lon: 55.2708 },
    { name: "Tokyo", lat: 35.6762, lon: 139.6503 }, { name: "Sydney", lat: -33.8688, lon: 151.2093 }
  ];
  let data = [];
  const grid = $("popular");

  function skeletons() {
    grid.innerHTML = "";
    CITIES.forEach(() => grid.appendChild(el("div", "pop sk")));
  }

  function paint() {
    grid.innerHTML = "";
    CITIES.forEach((c, i) => {
      const w = data[i];
      if (!w) return;
      const v = visual(w.weather[0].icon);
      const a = el("a", "pop"); a.href = `weather.html?lat=${c.lat}&lon=${c.lon}`; a.dataset.sky = v.sky;
      a.setAttribute("aria-label", `${c.name}, ${temp(w.main.temp)}${deg()}, ${w.weather[0].description}`);
      const top = el("div", "pop-top");
      top.append(el("b", "", c.name), el("span", "pop-time", fmtTime(Math.floor(Date.now() / 1000), w.timezone)));
      const mid = el("div", "pop-mid");
      mid.append(el("span", "pop-emoji", v.emoji), el("span", "pop-temp", `${temp(w.main.temp)}${deg()}`));
      a.append(top, mid, el("small", "", w.weather[0].description));
      grid.appendChild(a);
    });
    if (!grid.children.length) grid.appendChild(el("p", "muted", "Live city weather is unavailable right now."));
  }

  skeletons();
  Promise.allSettled(CITIES.map((c) => api("/data/2.5/weather", { lat: c.lat, lon: c.lon, units: "metric" }))).then((r) => {
    data = r.map((x) => (x.status === "fulfilled" ? x.value : null));
    if (data.every((x) => !x)) {
      const why = r.find((x) => x.status === "rejected");
      grid.innerHTML = ""; grid.appendChild(el("p", "muted", why ? why.reason.message : "Live city weather is unavailable right now."));
      if (why) toast(why.reason.message);
    } else paint();
  });
  initUnit(() => data.length && paint());
})();