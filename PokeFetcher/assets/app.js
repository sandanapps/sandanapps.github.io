(function () {
  "use strict";

  const CATEGORIES = [
    { key: "all", label: "Pregled" },
    { key: "pokemon", label: "Pokemoni" },
    { key: "shiny", label: "Shiny Pokemoni" },
    { key: "events", label: "Events" },
    { key: "shadow", label: "Shadow Pokemoni" },
  ];

  const CATEGORY_LABELS = CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c.label;
    return acc;
  }, {});

  const RECENT_DAYS = 30;

  const MONTH_NAMES = [
    "Siječanj", "Veljača", "Ožujak", "Travanj", "Svibanj", "Lipanj",
    "Srpanj", "Kolovoz", "Rujan", "Listopad", "Studeni", "Prosinac",
  ];

  const state = {
    data: [],
    category: "all",
    search: "",
    year: "all",
    sort: "desc",
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  function daysAgoStr(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function dateStatus(dateStr) {
    if (dateStr === todayStr) return "today";
    return dateStr > todayStr ? "future" : "past";
  }

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d}. ${MONTH_NAMES[m - 1].toLowerCase()} ${y}.`;
  }

  function typeClassVar(type) {
    return `var(--type-${type.toLowerCase()}, var(--type-normal))`;
  }

  function formBadge(entry) {
    if (entry.form === "mega") return "MEGA";
    if (entry.form === "primal") return "PRIMAL";
    if (entry.form === "gigantamax") return "GMAX";
    if (entry.shadow) return "SHADOW";
    return "";
  }

  function buildChip(entry) {
    const bg = entry.types && entry.types.length
      ? typeClassVar(entry.types[0])
      : "var(--type-normal)";
    const classes = ["chip"];
    if (entry.isShiny) classes.push("is-shiny");
    if (entry.shadow) classes.push("is-shadow");
    const badge = formBadge(entry);
    const label = entry.costume ? `${entry.name} (${entry.costume})` : entry.name;
    const sprite = entry.sprite
      ? el("img", { class: "chip-sprite", src: `./${entry.sprite}`, alt: "", loading: "lazy" })
      : null;
    return el("span", { class: classes.join(" "), style: `background:${bg}` }, [
      sprite,
      document.createTextNode((entry.isShiny ? "✨ " : "") + label),
      badge ? el("span", { class: "badge", text: ` · ${badge}` }) : null,
    ]);
  }

  function buildEventRow(event, opts) {
    const showCategory = opts && opts.showCategory;
    const status = dateStatus(event.date);
    const row = el("div", { class: `event-row is-${status}` });
    row.appendChild(el("div", { class: "event-date", text: formatDate(event.date) }));

    const body = el("div", { class: "event-body" });
    if (showCategory) {
      body.appendChild(
        el("div", { class: `category-tag category-${event.category}`, text: CATEGORY_LABELS[event.category] })
      );
    }
    if (event.note) {
      const noteEl = el("div", { class: "event-note" });
      noteEl.appendChild(document.createTextNode(event.note + " "));
      if (event.sourceUrl) {
        const link = el("a", { href: event.sourceUrl, target: "_blank", rel: "noopener noreferrer", text: "(izvor)" });
        noteEl.appendChild(link);
      }
      body.appendChild(noteEl);
    }
    const chips = el("div", { class: "chip-list" }, event.entries.map(buildChip));
    body.appendChild(chips);
    row.appendChild(body);
    return row;
  }

  function getFilteredEvents() {
    const search = state.search.trim().toLowerCase();
    const isAll = state.category === "all";
    const recentCutoff = daysAgoStr(RECENT_DAYS);
    return state.data
      .filter((e) => isAll || e.category === state.category)
      .filter((e) => !isAll || e.date >= recentCutoff)
      .filter((e) => isAll || state.year === "all" || e.date.startsWith(state.year))
      .filter((e) => {
        if (!search) return true;
        if (e.note && e.note.toLowerCase().includes(search)) return true;
        return e.entries.some((en) => en.name.toLowerCase().includes(search));
      });
  }

  function groupByYearMonth(events) {
    const years = new Map();
    for (const e of events) {
      const [y, m] = e.date.split("-");
      if (!years.has(y)) years.set(y, new Map());
      const months = years.get(y);
      if (!months.has(m)) months.set(m, []);
      months.get(m).push(e);
    }
    return years;
  }

  function renderUpcoming() {
    const container = document.getElementById("upcoming");
    const isAll = state.category === "all";
    const upcoming = state.data
      .filter((e) => (isAll || e.category === state.category) && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, isAll ? 15 : 5);

    container.innerHTML = "";
    if (!upcoming.length) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";
    container.appendChild(el("h2", { text: "Nadolazeći release-i" }));
    const list = el(
      "div",
      { class: "upcoming-list" },
      upcoming.map((e) => buildEventRow(e, { showCategory: isAll }))
    );
    container.appendChild(list);
  }

  function renderYearOptions() {
    const select = document.getElementById("year-filter");
    const isAll = state.category === "all";
    const yearFilterWrap = document.getElementById("year-filter-wrap");
    if (yearFilterWrap) yearFilterWrap.style.display = isAll ? "none" : "";
    if (isAll) return;
    const years = Array.from(
      new Set(state.data.filter((e) => e.category === state.category).map((e) => e.date.slice(0, 4)))
    ).sort();
    const current = state.year;
    select.innerHTML = "";
    select.appendChild(el("option", { value: "all", text: "Sve godine" }));
    years.forEach((y) => select.appendChild(el("option", { value: y, text: y })));
    select.value = years.includes(current) ? current : "all";
    state.year = select.value;
  }

  function renderTimeline() {
    const main = document.getElementById("timeline");
    main.innerHTML = "";
    const isAll = state.category === "all";

    if (isAll) {
      main.appendChild(
        el("p", {
          class: "timeline-hint",
          text: `Pregled zadnjih ${RECENT_DAYS} dana i svih budućih release-a iz svih kategorija. Odaberi kategoriju gore za punu povijest.`,
        })
      );
    }

    const events = getFilteredEvents().sort((a, b) =>
      state.sort === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    );

    if (!events.length) {
      main.appendChild(el("div", { class: "empty-state", text: "Nema rezultata za odabrane filtere." }));
      return;
    }

    const years = groupByYearMonth(events);
    const sortedYears = Array.from(years.keys()).sort((a, b) =>
      state.sort === "asc" ? a.localeCompare(b) : b.localeCompare(a)
    );

    for (const year of sortedYears) {
      const yearGroup = el("div", { class: "year-group" });
      yearGroup.appendChild(el("div", { class: "year-heading", text: year }));

      const months = years.get(year);
      const sortedMonths = Array.from(months.keys()).sort((a, b) =>
        state.sort === "asc" ? a.localeCompare(b) : b.localeCompare(a)
      );

      for (const month of sortedMonths) {
        const monthGroup = el("div", { class: "month-group" });
        monthGroup.appendChild(
          el("div", { class: "month-heading", text: MONTH_NAMES[parseInt(month, 10) - 1] })
        );
        const monthEvents = months.get(month).sort((a, b) =>
          state.sort === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
        );
        monthEvents.forEach((e) => monthGroup.appendChild(buildEventRow(e, { showCategory: isAll })));
        yearGroup.appendChild(monthGroup);
      }
      main.appendChild(yearGroup);
    }
  }

  function render() {
    renderUpcoming();
    renderYearOptions();
    renderTimeline();
  }

  function initTabs() {
    const container = document.getElementById("tabs");
    CATEGORIES.forEach((cat) => {
      const btn = el("button", {
        class: "tab-btn" + (cat.key === state.category ? " active" : ""),
        text: cat.label,
        "data-category": cat.key,
      });
      btn.addEventListener("click", () => {
        state.category = cat.key;
        state.year = "all";
        container.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        render();
      });
      container.appendChild(btn);
    });
  }

  function initControls() {
    document.getElementById("search").addEventListener("input", (ev) => {
      state.search = ev.target.value;
      renderTimeline();
    });
    document.getElementById("year-filter").addEventListener("change", (ev) => {
      state.year = ev.target.value;
      renderTimeline();
    });
    document.getElementById("sort-order").addEventListener("change", (ev) => {
      state.sort = ev.target.value;
      renderTimeline();
    });
  }

  function init() {
    initTabs();
    initControls();
    fetch("./data/releases.json")
      .then((res) => res.json())
      .then((data) => {
        state.data = data;
        render();
      })
      .catch((err) => {
        document.getElementById("timeline").innerHTML =
          '<div class="empty-state">Greška pri učitavanju podataka: ' + err.message + "</div>";
      });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
