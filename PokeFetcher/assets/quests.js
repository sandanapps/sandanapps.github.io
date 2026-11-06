(function () {
  "use strict";

  const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

  const state = {
    quests: [],
    selectedTasks: new Set(),
    selectedRewards: new Set(),
    view: "list",
  };

  let map = null;
  let activePopup = null;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function buildRewardRow(q) {
    const rewardEl = el("div", { class: "quest-reward" });
    if (q.reward_icon_url) {
      const iconClass = q.reward_kind === "Pokemon" ? "quest-reward-icon-pokemon" : "quest-reward-icon";
      rewardEl.appendChild(el("img", { class: iconClass, src: q.reward_icon_url, alt: "", loading: "lazy" }));
    }
    rewardEl.appendChild(document.createTextNode(q.reward_label));
    return rewardEl;
  }

  function buildQuestRow(q) {
    const row = el("div", { class: "quest-row" });
    if (q.pokestop_image_url) {
      row.appendChild(el("img", { class: "quest-stop-image", src: q.pokestop_image_url, alt: "", loading: "lazy" }));
    }
    row.appendChild(el("div", { class: "quest-stop", text: q.pokestop_name }));
    row.appendChild(el("div", { class: "quest-task", text: q.task }));
    row.appendChild(buildRewardRow(q));
    row.appendChild(el("div", { class: "quest-coords", text: `${q.lat}, ${q.lon}` }));
    return row;
  }

  function buildMultiSelect(opts) {
    // opts: { label, values (sorted array of strings), selectedSet, onChange, withSearch }
    const wrap = el("div", { class: "multiselect" });
    const toggle = el("button", { type: "button", class: "multiselect-toggle" });
    const panel = el("div", { class: "multiselect-panel" });
    panel.style.display = "none";

    function updateToggleLabel() {
      const n = opts.selectedSet.size;
      toggle.textContent = n ? `${opts.label} (${n}) ▾` : `${opts.label} ▾`;
    }

    let searchInput = null;
    let listEl = null;

    function renderOptions(filterText) {
      listEl.innerHTML = "";
      const needle = (filterText || "").trim().toLowerCase();
      opts.values
        .filter((v) => !needle || v.toLowerCase().includes(needle))
        .forEach((v) => {
          const id = `ms-${opts.label}-${v}`.replace(/\s+/g, "_");
          const checkbox = el("input", { type: "checkbox", id });
          checkbox.checked = opts.selectedSet.has(v);
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) opts.selectedSet.add(v);
            else opts.selectedSet.delete(v);
            updateToggleLabel();
            opts.onChange();
          });
          const label = el("label", { for: id, class: "multiselect-option" }, [
            checkbox,
            document.createTextNode(v),
          ]);
          listEl.appendChild(label);
        });
    }

    const actions = el("div", { class: "multiselect-actions" });
    const clearBtn = el("button", { type: "button", class: "multiselect-clear", text: "Očisti" });
    clearBtn.addEventListener("click", () => {
      opts.selectedSet.clear();
      renderOptions(searchInput ? searchInput.value : "");
      updateToggleLabel();
      opts.onChange();
    });
    actions.appendChild(clearBtn);

    if (opts.withSearch) {
      searchInput = el("input", { type: "search", class: "multiselect-search", placeholder: "Pretraži..." });
      searchInput.addEventListener("input", () => renderOptions(searchInput.value));
      panel.appendChild(searchInput);
    }

    listEl = el("div", { class: "multiselect-list" });
    panel.appendChild(listEl);
    panel.appendChild(actions);
    renderOptions("");
    updateToggleLabel();

    toggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const isOpen = panel.style.display !== "none";
      document.querySelectorAll(".multiselect-panel").forEach((p) => (p.style.display = "none"));
      panel.style.display = isOpen ? "none" : "";
    });

    panel.addEventListener("click", (ev) => ev.stopPropagation());

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    return wrap;
  }

  function getFilteredQuests() {
    return state.quests.filter((q) => {
      if (state.selectedTasks.size && !state.selectedTasks.has(q.task)) return false;
      if (state.selectedRewards.size && !state.selectedRewards.has(q.reward_label)) return false;
      return true;
    });
  }

  function renderList(filtered) {
    const list = document.getElementById("quest-list");
    list.innerHTML = "";
    if (!filtered.length) {
      list.appendChild(el("div", { class: "empty-state", text: "Nema rezultata za odabrane filtere." }));
      return;
    }
    filtered.forEach((q) => list.appendChild(buildQuestRow(q)));
  }

  const FALLBACK_ICON_ID = "quest-fallback-icon";

  function iconIdForUrl(url) {
    // MapLibre image IDs can't contain arbitrary URL characters reliably across
    // style layers, so hash the URL into a short stable id instead of using it
    // directly; the actual URL is looked up via urlForIconId when needed.
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = (hash * 31 + url.charCodeAt(i)) | 0;
    }
    return `quest-icon-${hash}`;
  }

  const iconUrlById = new Map();

  function buildGeoJSON(quests) {
    return {
      type: "FeatureCollection",
      features: quests.map((q) => {
        const iconId = q.reward_icon_url ? iconIdForUrl(q.reward_icon_url) : FALLBACK_ICON_ID;
        if (q.reward_icon_url) iconUrlById.set(iconId, q.reward_icon_url);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [q.lon, q.lat] },
          properties: {
            quest_id: q.quest_id,
            pokestop_name: q.pokestop_name,
            task: q.task,
            reward_label: q.reward_label,
            reward_icon_url: q.reward_icon_url || "",
            reward_kind: q.reward_kind || "",
            lat: q.lat,
            lon: q.lon,
            icon_id: iconId,
          },
        };
      }),
    };
  }

  function updateMapData(filtered) {
    if (!map) return;
    const source = map.getSource("quests-source");
    if (source) source.setData(buildGeoJSON(filtered));
  }

  function buildPopupContent(props) {
    const container = el("div", { class: "quest-popup" });
    container.appendChild(el("div", { class: "popup-title", text: props.pokestop_name }));
    container.appendChild(el("div", { class: "popup-task", text: props.task }));

    container.appendChild(el("div", { class: "popup-reward-label", text: "Reward:" }));
    const rewardRow = el("div", { class: "popup-reward-row" });
    if (props.reward_icon_url) {
      const iconClass = props.reward_kind === "Pokemon" ? "quest-reward-icon-pokemon" : "quest-reward-icon";
      rewardRow.appendChild(el("img", { class: iconClass, src: props.reward_icon_url, alt: "", loading: "lazy" }));
    }
    rewardRow.appendChild(document.createTextNode(props.reward_label));
    container.appendChild(rewardRow);

    const actions = el("div", { class: "popup-actions" });

    const mapsLink = el("a", {
      class: "popup-btn-primary",
      href: `https://www.google.com/maps?q=${props.lat},${props.lon}`,
      target: "_blank",
      rel: "noopener noreferrer",
      text: "Open in Maps",
    });
    actions.appendChild(mapsLink);

    const copyBtn = el("button", { type: "button", class: "popup-btn-secondary", text: "Copy coords" });
    copyBtn.addEventListener("click", () => {
      const text = `${props.lat}, ${props.lon}`;
      navigator.clipboard.writeText(text).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = "Kopirano!";
        setTimeout(() => (copyBtn.textContent = original), 1500);
      });
    });
    actions.appendChild(copyBtn);

    container.appendChild(actions);
    return container;
  }

  function computeBounds(quests) {
    const lats = quests.map((q) => q.lat);
    const lons = quests.map((q) => q.lon);
    return [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
  }

  const MAP_ICON_SIZE = 40;

  function makeFallbackIconImage() {
    const size = MAP_ICON_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = "#3d7dca";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    return ctx.getImageData(0, 0, size, size);
  }

  function normalizeIconImage(image) {
    // Source reward icons vary wildly in native size (28px items vs. ~130-300px
    // cropped Pokémon sprites), so draw each onto a fixed-size circular backdrop
    // (same visual recipe as .chip-sprite on the release page) for a consistent
    // look on the map regardless of source resolution.
    const size = MAP_ICON_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    const iw = image.width || image.data?.width;
    const ih = image.height || image.data?.height;
    const pad = size * 0.14;
    const inner = size - pad * 2;
    const scale = Math.min(inner / iw, inner / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);

    return ctx.getImageData(0, 0, size, size);
  }

  function initMap(filtered) {
    map = new maplibregl.Map({
      container: "quest-map",
      style: MAP_STYLE_URL,
      bounds: computeBounds(state.quests),
      fitBoundsOptions: { padding: 30 },
    });

    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (id === FALLBACK_ICON_ID) {
        map.addImage(FALLBACK_ICON_ID, makeFallbackIconImage());
        return;
      }
      const url = iconUrlById.get(id);
      if (!url) return;
      map
        .loadImage(url)
        .then(({ data }) => {
          if (!map.hasImage(id)) map.addImage(id, normalizeIconImage(data));
        })
        .catch(() => {});
    });

    map.on("load", () => {
      map.addImage(FALLBACK_ICON_ID, makeFallbackIconImage());
      map.addSource("quests-source", {
        type: "geojson",
        data: buildGeoJSON(filtered),
      });
      map.addLayer({
        id: "quests-layer",
        type: "symbol",
        source: "quests-source",
        layout: {
          "icon-image": ["get", "icon_id"],
          "icon-size": 1,
          "icon-allow-overlap": true,
        },
      });

      map.on("mouseenter", "quests-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "quests-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "quests-layer", (e) => {
        const feature = e.features[0];
        const props = feature.properties;
        if (activePopup) activePopup.remove();
        activePopup = new maplibregl.Popup({ closeButton: true })
          .setLngLat(feature.geometry.coordinates)
          .setDOMContent(buildPopupContent(props))
          .addTo(map);
      });
    });
  }

  function initViewToggle() {
    const container = document.getElementById("view-toggle");
    container.innerHTML = "";

    const listBtn = el("button", { type: "button", class: "tab-btn active", text: "Lista" });
    const mapBtn = el("button", { type: "button", class: "tab-btn", text: "Karta" });

    function setView(view) {
      state.view = view;
      listBtn.classList.toggle("active", view === "list");
      mapBtn.classList.toggle("active", view === "map");
      document.getElementById("quest-list").style.display = view === "list" ? "" : "none";
      document.getElementById("quest-map").style.display = view === "map" ? "" : "none";

      if (view === "map") {
        if (!map) {
          initMap(getFilteredQuests());
        }
        setTimeout(() => map.resize(), 0);
      }
    }

    listBtn.addEventListener("click", () => setView("list"));
    mapBtn.addEventListener("click", () => setView("map"));

    container.appendChild(listBtn);
    container.appendChild(mapBtn);
  }

  function applyFilters() {
    const filtered = getFilteredQuests();
    const meta = document.getElementById("quest-meta");
    const metaBase = meta.dataset.base || "";
    meta.textContent = `${metaBase} · Prikazano ${filtered.length} od ${state.quests.length}`;

    renderList(filtered);
    updateMapData(filtered);
  }

  function initFilters() {
    const container = document.getElementById("quest-filters");
    container.innerHTML = "";

    const taskValues = Array.from(new Set(state.quests.map((q) => q.task))).sort((a, b) =>
      a.localeCompare(b)
    );
    const rewardValues = Array.from(new Set(state.quests.map((q) => q.reward_label))).sort((a, b) =>
      a.localeCompare(b)
    );

    container.appendChild(
      buildMultiSelect({
        label: "Quest type",
        values: taskValues,
        selectedSet: state.selectedTasks,
        withSearch: true,
        onChange: applyFilters,
      })
    );
    container.appendChild(
      buildMultiSelect({
        label: "Reward",
        values: rewardValues,
        selectedSet: state.selectedRewards,
        withSearch: true,
        onChange: applyFilters,
      })
    );
    container.appendChild(buildExportControls());
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function buildCsv(quests) {
    const header = ["Ime stopa", "Quest type", "Reward", "Lat", "Lon"];
    const rows = quests.map((q) => [q.pokestop_name, q.task, q.reward_label, q.lat, q.lon]);
    return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildGpx(quests) {
    const waypoints = quests
      .map(
        (q) => `  <wpt lat="${q.lat}" lon="${q.lon}">
    <name>${xmlEscape(q.pokestop_name)}</name>
    <desc>${xmlEscape(q.task)} — ${xmlEscape(q.reward_label)}</desc>
  </wpt>`
      )
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PokeFetcher" xmlns="http://www.topografix.com/GPX/1/1">
${waypoints}
</gpx>`;
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function buildExportControls() {
    const wrap = el("div", { class: "export-controls" });

    const csvBtn = el("button", { type: "button", class: "export-btn", text: "Export CSV" });
    csvBtn.addEventListener("click", () => {
      downloadFile("pokefetcher-questovi.csv", buildCsv(getFilteredQuests()), "text/csv;charset=utf-8");
    });

    const gpxBtn = el("button", { type: "button", class: "export-btn", text: "Export GPX" });
    gpxBtn.addEventListener("click", () => {
      downloadFile("pokefetcher-questovi.gpx", buildGpx(getFilteredQuests()), "application/gpx+xml");
    });

    wrap.appendChild(csvBtn);
    wrap.appendChild(gpxBtn);
    return wrap;
  }

  function render(data) {
    state.quests = data.quests || [];

    const meta = document.getElementById("quest-meta");
    if (data.generated_at) {
      const d = new Date(data.generated_at);
      meta.dataset.base = `Zadnje osvježeno: ${d.toLocaleString("hr-HR")} · ${state.quests.length} questova`;
    } else {
      meta.dataset.base = `${state.quests.length} questova`;
    }

    document.getElementById("quest-map").style.display = "none";

    initFilters();
    initViewToggle();
    applyFilters();
  }

  function init() {
    document.addEventListener("click", () => {
      document.querySelectorAll(".multiselect-panel").forEach((p) => (p.style.display = "none"));
    });

    fetch("./data/quests.json")
      .then((res) => res.json())
      .then(render)
      .catch((err) => {
        document.getElementById("quest-list").innerHTML =
          '<div class="empty-state">Greška pri učitavanju podataka: ' + err.message + "</div>";
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
