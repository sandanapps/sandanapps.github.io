(function () {
  "use strict";

  const state = {
    quests: [],
    selectedTasks: new Set(),
    selectedRewards: new Set(),
  };

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

  function buildQuestRow(q) {
    const row = el("div", { class: "quest-row" });
    if (q.pokestop_image_url) {
      row.appendChild(el("img", { class: "quest-stop-image", src: q.pokestop_image_url, alt: "", loading: "lazy" }));
    }
    row.appendChild(el("div", { class: "quest-stop", text: q.pokestop_name }));
    row.appendChild(el("div", { class: "quest-task", text: q.task }));

    const rewardEl = el("div", { class: "quest-reward" });
    if (q.reward_icon_url) {
      const iconClass = q.reward_kind === "Pokemon" ? "quest-reward-icon-pokemon" : "quest-reward-icon";
      rewardEl.appendChild(el("img", { class: iconClass, src: q.reward_icon_url, alt: "", loading: "lazy" }));
    }
    rewardEl.appendChild(document.createTextNode(q.reward_label));
    row.appendChild(rewardEl);

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

  function renderList() {
    const filtered = getFilteredQuests();
    const meta = document.getElementById("quest-meta");
    const metaBase = meta.dataset.base || "";
    meta.textContent = `${metaBase} · Prikazano ${filtered.length} od ${state.quests.length}`;

    const list = document.getElementById("quest-list");
    list.innerHTML = "";
    if (!filtered.length) {
      list.appendChild(el("div", { class: "empty-state", text: "Nema rezultata za odabrane filtere." }));
      return;
    }
    filtered.forEach((q) => list.appendChild(buildQuestRow(q)));
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
        onChange: renderList,
      })
    );
    container.appendChild(
      buildMultiSelect({
        label: "Reward",
        values: rewardValues,
        selectedSet: state.selectedRewards,
        withSearch: true,
        onChange: renderList,
      })
    );
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

    initFilters();
    renderList();
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
