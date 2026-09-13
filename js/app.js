/* =========================================================
 * app.js — แกนหลักของระบบ (Core)
 * ประกาศบริหารกองทุน ปีงบประมาณ พ.ศ.2569
 *
 * Phase 1:
 *   - Hash Router  #/view/segment?q=  (ทำงานบน GitHub Pages ได้โดยไม่ต้องตั้งค่า server)
 *   - Tab Navigation · Drawer (มือถือ) · Breadcrumb
 *   - Hero · Executive KPI · A/B/C Overview
 *
 * Public API: window.App — ให้โมดูล Phase ถัดไปลงทะเบียน view
 *   App.registerView("catalog", (section, route, App) => { ... })
 *   (dashboard.js, drilldown.js, search.js, filters.js ต้องโหลดหลัง app.js)
 * ========================================================= */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG;

  /* ---------------- Utilities ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const numberFormatter = new Intl.NumberFormat("th-TH");
  const fmt = (n) => (Number.isFinite(n) ? numberFormatter.format(n) : "—");
  const pct = (part, whole) => (whole > 0 ? ((part / whole) * 100).toFixed(1) : "0.0");
  const onReady = (fn) =>
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn();

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function safeDecode(text) {
    try { return decodeURIComponent(text); } catch (err) { return text; }
  }

  function showFatal(message) {
    const target = document.getElementById("main") || document.body;
    target.innerHTML =
      `<div class="container"><div class="fatal" role="alert">
        <strong><i class="bi bi-exclamation-octagon" aria-hidden="true"></i> ไม่สามารถแสดงผลได้</strong>
        <p>${escapeHtml(message)}</p>
      </div></div>`;
  }

  if (!CFG) {
    onReady(() => showFatal("ไม่พบการตั้งค่าระบบ (./js/config.js) กรุณาตรวจสอบว่าอัปโหลดไฟล์ครบถ้วน"));
    return;
  }

  /* ---------------- Lookups & state ---------------- */
  const FUND = CFG.FUND_SUMMARY;
  const NAV_BY_ID = new Map(CFG.NAV.map((item) => [item.id, item]));
  const CATEGORY_BY_ROUTE = new Map(CFG.CATEGORIES.map((cat) => [cat.route, cat]));
  const ALL_GROUPS = CFG.CATEGORIES.flatMap((cat) =>
    cat.groups.map((g) => Object.assign({ category: cat.code, categoryRoute: cat.route }, g))
  );
  const GROUP_BY_CODE = new Map(ALL_GROUPS.map((g) => [g.code, g]));
  const GROUPS_WITH_ANNOUNCEMENTS = ALL_GROUPS.filter((g) => g.announcements > 0);

  const state = {
    ready: false,
    route: null,
    charts: {},
    chartsRendered: false,
    dataKpis: {}
  };
  const viewRenderers = new Map();

  const catColor = (code) => CFG.THEME.CATEGORY_COLORS[code] || CFG.THEME.NAVY;
  const lower = (code) => String(code).toLowerCase();

  /* ---------------- Data quality: structure check ---------------- */
  function checkStructure() {
    const issues = [];
    let total = 0;
    CFG.CATEGORIES.forEach((cat) => {
      const sum = cat.groups.reduce((acc, g) => acc + (g.announcements || 0), 0);
      total += sum;
      if (sum !== cat.announcements) {
        issues.push(`หมวด ${cat.code}: ผลรวมกลุ่ม ${sum} ≠ ${cat.announcements}`);
      }
    });
    if (total !== FUND.announcements) issues.push(`ผลรวมประกาศ ${total} ≠ ${FUND.announcements}`);
    if (GROUPS_WITH_ANNOUNCEMENTS.length !== FUND.groupsWithAnnouncements) {
      issues.push(`กลุ่มที่มีประกาศ ${GROUPS_WITH_ANNOUNCEMENTS.length} ≠ ${FUND.groupsWithAnnouncements}`);
    }
    if (CFG.CATEGORIES.length !== FUND.categories) {
      issues.push(`จำนวนหมวด ${CFG.CATEGORIES.length} ≠ ${FUND.categories}`);
    }
    const seen = new Set();
    ALL_GROUPS.forEach((g) => {
      if (seen.has(g.code)) issues.push(`รหัสกลุ่มซ้ำ: ${g.code}`);
      seen.add(g.code);
    });
    return { ok: issues.length === 0, issues, total };
  }

  /* ================= Navigation ================= */
  function navMark(item) {
    return item.letter
      ? `<span class="nav-letter cat-${lower(item.letter)}" aria-hidden="true">${escapeHtml(item.letter)}</span>`
      : `<i class="bi ${item.icon}" aria-hidden="true"></i>`;
  }

  function renderNav() {
    const phase = CFG.CURRENT_PHASE;
    $("#tabList").innerHTML = CFG.NAV.map((item) => `
      <li><a class="tab" href="#/${item.id}" data-nav="${item.id}"${item.phase > phase ? ` title="เปิดใช้เต็มรูปแบบใน Phase ${item.phase}"` : ""}>
        ${navMark(item)}<span>${escapeHtml(item.label)}</span>
      </a></li>`).join("");

    $("#drawerList").innerHTML = CFG.NAV.map((item) => `
      <li><a class="drawer-link" href="#/${item.id}" data-nav="${item.id}">
        ${navMark(item)}<span>${escapeHtml(item.label)}</span>
        ${item.phase > phase ? `<span class="pill pill-soon">Phase ${item.phase}</span>` : ""}
      </a></li>`).join("");
  }

  function updateActiveNav(viewId) {
    $$("[data-nav]").forEach((link) => {
      const active = link.dataset.nav === viewId;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    const list = $("#tabList");
    const tab = list && list.querySelector(`[data-nav="${viewId}"]`);
    if (tab && list.scrollWidth > list.clientWidth) {
      const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
      list.scrollTo({ left: Math.max(0, left), behavior: state.ready ? "smooth" : "auto" });
    }
  }

  /* ================= Breadcrumb ================= */
  function buildCrumbs(route) {
    const crumbs = [{ label: "ภาพรวม", href: "#/overview", icon: "bi-house-door" }];
    if (route.view === "overview") return crumbs;

    const nav = NAV_BY_ID.get(route.view);
    crumbs.push({ label: nav.label, href: `#/${nav.id}` });

    const cat = CATEGORY_BY_ROUTE.get(route.view);
    if (cat && route.segments[0]) {
      const group = GROUP_BY_CODE.get(route.segments[0].toUpperCase());
      if (group && group.category === cat.code) {
        crumbs.push({ label: group.code, href: `#/${cat.route}/${group.code}` });
      }
    }
    if (route.view === "search" && route.query.q) {
      crumbs.push({ label: `“${route.query.q}”` });
    }
    return crumbs;
  }

  function renderBreadcrumb(crumbs) {
    const el = $("#breadcrumb");
    if (!el) return;
    el.innerHTML = crumbs.map((c, i) => {
      const icon = c.icon ? `<i class="bi ${c.icon}" aria-hidden="true"></i>` : "";
      return i === crumbs.length - 1 || !c.href
        ? `<li><span aria-current="page">${icon}${escapeHtml(c.label)}</span></li>`
        : `<li><a href="${c.href}">${icon}${escapeHtml(c.label)}</a></li>`;
    }).join("");
  }

  /* ================= Router ================= */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const qIndex = raw.indexOf("?");
    const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const queryString = qIndex >= 0 ? raw.slice(qIndex + 1) : "";
    const parts = path.split("/").filter(Boolean).map(safeDecode);
    const known = parts.length > 0 && NAV_BY_ID.has(parts[0]);
    return {
      view: known ? parts[0] : "overview",
      segments: known ? parts.slice(1) : [],
      query: Object.fromEntries(new URLSearchParams(queryString)),
      known
    };
  }

  function replaceHash(hash) {
    try { history.replaceState(null, "", hash); } catch (err) { location.replace(hash); }
  }

  function handleRoute() {
    const route = parseHash();
    if (!route.known) replaceHash("#/overview");

    const previous = state.route;
    state.route = route;
    const nav = NAV_BY_ID.get(route.view);

    $$("#main > .view").forEach((section) => {
      section.hidden = section.dataset.view !== route.view;
    });
    updateActiveNav(route.view);
    syncSearchInputs(route);
    renderBreadcrumb(buildCrumbs(route));
    if (!previous || previous.view !== route.view) window.scrollTo(0, 0);
    /* ตั้ง title ก่อน render เพื่อให้ view ย่อย (เช่นหน้า Program) ตั้งชื่อเฉพาะทับได้ */
    document.title = route.view === "overview" ? CFG.SYSTEM_NAME : `${nav.label} · ${CFG.SYSTEM_NAME}`;

    renderView(route);
    closeDrawer(false);
  }

  function renderView(route) {
    const section = document.getElementById(`view-${route.view}`);
    if (!section) return;
    try {
      const custom = viewRenderers.get(route.view);
      if (custom) return custom(section, route, App);
      if (route.view === "overview") return renderOverviewCharts();
      if (CATEGORY_BY_ROUTE.has(route.view)) return renderCategoryView(section, CATEGORY_BY_ROUTE.get(route.view), route);
      if (route.view === "search") return renderSearchView(section, route);
      return renderPlaceholder(section, NAV_BY_ID.get(route.view));
    } catch (err) {
      console.error(`[View:${route.view}]`, err);
      section.innerHTML =
        `<div class="container section"><div class="fatal" role="alert">
          <strong><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> แสดงผลหน้านี้ไม่สำเร็จ</strong>
          <p>กรุณารีเฟรชหน้า หรือกลับไปที่ <a href="#/overview">ภาพรวม</a></p>
        </div></div>`;
    }
  }

  /* ================= Overview: Hero ladder ================= */
  function renderLadder() {
    const steps = [
      { value: FUND.funds, label: "กองทุน", sub: FUND.fundName },
      { value: FUND.categories, label: "หมวดใหญ่", sub: CFG.CATEGORIES.map((c) => c.code).join(" · ") },
      { value: FUND.groupsWithAnnouncements, label: "กลุ่มที่มีประกาศ", sub: `จากรหัสกลุ่มทั้งหมด ${ALL_GROUPS.length} กลุ่ม` },
      { value: FUND.announcements, label: "ประกาศ", sub: `เอกสารรวม ${fmt(CFG.SOURCE.PAGES)} หน้า` },
      { icon: "bi-collection", label: "Program", sub: "โครงการ / บริการย่อยตามประกาศ" },
      { icon: "bi-list-ul", label: "Service Item", sub: "รายการบริการที่ Claim ได้" },
      { icon: "bi-check2-square", label: "Claim Rule", sub: "กลุ่มเป้าหมาย · เงื่อนไข · อัตราจ่าย" }
    ];
    $("#fundLadder").innerHTML = steps.map((s) => `
      <li>
        <span class="ladder-node${s.icon ? "" : " is-num"}" aria-hidden="true">${s.icon ? `<i class="bi ${s.icon}"></i>` : fmt(s.value)}</span>
        <span>
          <span class="ladder-label">${s.icon ? "" : `${fmt(s.value)} `}${escapeHtml(s.label)}</span>
          <span class="ladder-sub">${escapeHtml(s.sub)}</span>
        </span>
      </li>`).join("");
  }

  /* ================= Overview: Executive KPI ================= */
  function renderKpiPrimary() {
    const tiles = [
      { value: FUND.funds, unit: "กองทุน", label: "กองทุนหลัก", sub: FUND.fundName, icon: "bi-bank", accent: "var(--navy)" },
      { value: FUND.categories, unit: "หมวด", label: "หมวดใหญ่", sub: CFG.CATEGORIES.map((c) => c.code).join(" / "), icon: "bi-layers", accent: "var(--blue)" },
      { value: FUND.groupsWithAnnouncements, unit: "กลุ่ม", label: "กลุ่มที่มีประกาศ", sub: `จากรหัสกลุ่มทั้งหมด ${ALL_GROUPS.length} กลุ่ม`, icon: "bi-grid-3x3-gap", accent: "var(--green)" },
      { value: FUND.announcements, unit: "ฉบับ", label: "ประกาศ", sub: `Updated ${CFG.SOURCE.UPDATED}`, icon: "bi-file-earmark-text", accent: "var(--cyan)" }
    ];
    $("#kpiPrimary").innerHTML = tiles.map((t) => `
      <div class="kpi" style="--accent:${t.accent}">
        <div class="kpi-top">
          <span class="kpi-label">${escapeHtml(t.label)}</span>
          <span class="kpi-icon" aria-hidden="true"><i class="bi ${t.icon}"></i></span>
        </div>
        <div class="kpi-value">${fmt(t.value)}<span class="kpi-unit">${escapeHtml(t.unit)}</span></div>
        <div class="kpi-sub">${escapeHtml(t.sub)}</div>
      </div>`).join("");
  }

  function renderKpiCategories() {
    $("#kpiCategories").innerHTML = CFG.CATEGORIES.map((cat) => {
      const share = pct(cat.announcements, FUND.announcements);
      const groupsWith = cat.groups.filter((g) => g.announcements > 0).length;
      return `
        <a class="cat-tile cat-${lower(cat.code)}" href="#/${cat.route}">
          <span class="cat-letter" aria-hidden="true">${cat.code}</span>
          <span class="cat-tile-body">
            <span class="cat-tile-name">หมวด ${cat.code} · ${escapeHtml(cat.name)}</span>
            <span class="cat-tile-value"><strong>${fmt(cat.announcements)}</strong>ประกาศ<span class="cat-share">${share}%</span></span>
            <span class="meter" aria-hidden="true"><span style="width:${share}%"></span></span>
            <span class="cat-tile-sub">${groupsWith} กลุ่มที่มีประกาศ</span>
          </span>
          <i class="bi bi-chevron-right cat-tile-arrow" aria-hidden="true"></i>
        </a>`;
    }).join("");
  }

  function renderKpiData() {
    const el = $("#kpiData");
    if (!el) return;
    let ready = 0;
    el.innerHTML = CFG.DATA_KPIS.map((k) => {
      const value = state.dataKpis[k.key];
      const has = Number.isFinite(value);
      if (has) ready += 1;
      return `
        <div class="kpi-mini${has ? " is-ready" : ""}">
          <div class="kpi-mini-top">
            <span class="kpi-icon" aria-hidden="true"><i class="bi ${k.icon}"></i></span>
            <span class="kpi-mini-label">${escapeHtml(k.label)}</span>
          </div>
          <div class="kpi-mini-value">${has ? fmt(value) : "—"}</div>
          <div class="kpi-mini-sub">${has ? escapeHtml(k.unit) : "รอเชื่อม revenue-master.json"}</div>
        </div>`;
    }).join("");

    $("#kpiDataStatus").innerHTML = ready === CFG.DATA_KPIS.length
      ? `<span class="pill pill-ok"><i class="bi bi-check2" aria-hidden="true"></i> คำนวณจาก Dataset จริง</span>`
      : `<span class="pill pill-soon"><i class="bi bi-hourglass-split" aria-hidden="true"></i> คำนวณจาก Dataset จริงใน Phase 2</span>`;
  }

  function renderStructureCheck() {
    const result = checkStructure();
    $("#structureCheck").innerHTML = result.ok
      ? `<span class="check ok"><i class="bi bi-patch-check-fill" aria-hidden="true"></i> ตรวจสอบโครงสร้างผ่าน · ผลรวม ${GROUPS_WITH_ANNOUNCEMENTS.length} กลุ่ม = ${fmt(result.total)} ประกาศ</span>`
      : `<span class="check warn" title="${escapeHtml(result.issues.join("\n"))}"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Needs Review · พบ ${result.issues.length} ประเด็น</span>`;
    if (!result.ok) console.warn("[Structure check]", result.issues);
  }

  function renderSourceLine() {
    const s = CFG.SOURCE;
    $("#kpiSource").innerHTML =
      `<i class="bi bi-info-circle" aria-hidden="true"></i>
       <span>ที่มา: ${escapeHtml(s.WORKBOOK)} (ชีต ${escapeHtml(s.SUMMARY_SHEET)}) · ${escapeHtml(s.DOCUMENT)} · Updated ${escapeHtml(s.UPDATED)} · ${fmt(s.PAGES)} หน้า</span>`;
  }

  /* ================= Overview: A/B/C panels ================= */
  function chipList(items, limit) {
    const list = items || [];
    if (!list.length) return "";
    const shown = Number.isFinite(limit) ? list.slice(0, limit) : list;
    const more = list.length - shown.length;
    return `<span class="chips">${shown.map((x) => `<span class="chip">${escapeHtml(x)}</span>`).join("")}${more > 0 ? `<span class="chip chip-more">+${more}</span>` : ""}</span>`;
  }

  function groupRow(group, cat) {
    const empty = group.announcements === 0;
    return `
      <li class="${empty ? "is-empty" : ""}">
        <a class="group-link" href="#/${cat.route}/${group.code}">
          <span class="group-code">${group.code}</span>
          <span>
            <span class="group-name">${escapeHtml(group.name)}</span>
            ${empty ? `<span class="group-note">${escapeHtml(group.note || "ไม่มีประกาศในชุด")}</span>` : chipList(group.examples, 4)}
          </span>
          <span class="group-count" title="จำนวนประกาศ">${group.announcements}</span>
        </a>
      </li>`;
  }

  function renderCategoryPanels() {
    $("#categoryPanels").innerHTML = CFG.CATEGORIES.map((cat) => {
      const share = pct(cat.announcements, FUND.announcements);
      const groupsWith = cat.groups.filter((g) => g.announcements > 0).length;
      return `
        <article class="cat-panel cat-${lower(cat.code)}">
          <header class="cat-panel-head">
            <span class="cat-letter" aria-hidden="true">${cat.code}</span>
            <div class="cat-panel-title">
              <h3>หมวด ${cat.code}</h3>
              <p>${escapeHtml(cat.name)}</p>
            </div>
            <div class="cat-panel-count"><strong>${fmt(cat.announcements)}</strong><span>ประกาศ · ${share}%</span></div>
          </header>
          <ul class="group-list">${cat.groups.map((g) => groupRow(g, cat)).join("")}</ul>
          <footer class="cat-panel-foot">
            <span>${groupsWith} จาก ${cat.groups.length} กลุ่มมีประกาศ</span>
            <a class="link-arrow" href="#/${cat.route}">ดูหมวด ${cat.code} <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
          </footer>
        </article>`;
    }).join("");
  }

  /* ================= Overview: charts ================= */
  function renderChartLegends() {
    $("#legendCategory").innerHTML = CFG.CATEGORIES.map((cat) => `
      <li class="cat-${lower(cat.code)}">
        <a href="#/${cat.route}">
          <span class="swatch" aria-hidden="true"></span>
          <span class="lv-name">หมวด ${cat.code} · ${escapeHtml(cat.name)}</span>
          <span class="lv-value">${fmt(cat.announcements)}<span class="lv-share">${pct(cat.announcements, FUND.announcements)}%</span></span>
        </a>
      </li>`).join("");

    $("#legendGroup").innerHTML = CFG.CATEGORIES.map((cat) => `
      <li class="cat-${lower(cat.code)}"><span class="swatch" aria-hidden="true"></span>หมวด ${cat.code}</li>`).join("");
  }

  function renderChartFallback() {
    $("#donutBox").innerHTML =
      `<div class="chart-fallback"><i class="bi bi-wifi-off" aria-hidden="true"></i> โหลด Chart.js ไม่สำเร็จ — แสดงตัวเลขแทนกราฟ</div>`;
    const bar = $("#barBox");
    bar.classList.add("is-fallback");
    bar.innerHTML = `
      <table class="fallback-table">
        <thead><tr><th>กลุ่ม</th><th>ชื่อกลุ่ม</th><th>ประกาศ</th></tr></thead>
        <tbody>${GROUPS_WITH_ANNOUNCEMENTS.map((g) =>
          `<tr><td>${g.code}</td><td>${escapeHtml(g.name)}</td><td>${g.announcements}</td></tr>`).join("")}</tbody>
      </table>`;
  }

  function renderOverviewCharts() {
    if (state.chartsRendered) return;
    state.chartsRendered = true;
    renderChartLegends();

    if (typeof window.Chart === "undefined") {
      console.warn("[Charts] Chart.js not available — using fallback table");
      renderChartFallback();
      return;
    }

    try {
      const T = CFG.THEME;
      const Chart = window.Chart;
      Chart.defaults.font.family = T.FONT_FAMILY;
      Chart.defaults.font.size = 13;
      Chart.defaults.color = T.MUTED;

      const tooltip = {
        backgroundColor: T.NAVY,
        titleColor: "#fff",
        bodyColor: "rgba(255,255,255,.88)",
        titleFont: { family: T.FONT_FAMILY, weight: "600", size: 13 },
        bodyFont: { family: T.FONT_FAMILY, size: 13 },
        padding: 10,
        cornerRadius: 8,
        boxPadding: 4,
        usePointStyle: true
      };

      /* Donut: A/B/C */
      const cats = CFG.CATEGORIES;
      const donutCanvas = $("#chartCategory");
      donutCanvas.setAttribute("aria-label",
        "แผนภูมิโดนัท สัดส่วนประกาศตามหมวด: " + cats.map((c) => `หมวด ${c.code} ${c.announcements} ฉบับ`).join(", "));
      state.charts.category = new Chart(donutCanvas, {
        type: "doughnut",
        data: {
          labels: cats.map((c) => `หมวด ${c.code}`),
          datasets: [{
            data: cats.map((c) => c.announcements),
            backgroundColor: cats.map((c) => catColor(c.code)),
            borderColor: "#fff",
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          layout: { padding: 6 },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltip, {
              callbacks: {
                title: (items) => {
                  const c = cats[items[0].dataIndex];
                  return `หมวด ${c.code} · ${c.name}`;
                },
                label: (item) => ` ${fmt(item.raw)} ประกาศ (${pct(item.raw, FUND.announcements)}%)`
              }
            })
          }
        }
      });
      bindChartClick(state.charts.category, { mode: "nearest", intersect: true },
        (index) => `#/${cats[index].route}`);

      /* Horizontal bar: announcements per group (18 groups) */
      const groups = GROUPS_WITH_ANNOUNCEMENTS;
      const barCanvas = $("#chartGroup");
      barCanvas.setAttribute("aria-label",
        "แผนภูมิแท่ง จำนวนประกาศต่อกลุ่ม: " + groups.map((g) => `${g.code} ${g.announcements}`).join(", "));
      state.charts.group = new Chart(barCanvas, {
        type: "bar",
        data: {
          labels: groups.map((g) => g.code),
          datasets: [{
            label: "จำนวนประกาศ",
            data: groups.map((g) => g.announcements),
            backgroundColor: groups.map((g) => catColor(g.category)),
            borderRadius: 4,
            borderSkipped: "start",
            barPercentage: 0.78,
            categoryPercentage: 0.9,
            maxBarThickness: 16
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", axis: "y", intersect: false },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { precision: 0, color: T.MUTED },
              grid: { color: T.GRID },
              border: { display: false }
            },
            y: {
              grid: { display: false },
              border: { color: "#E2E8F0" },
              ticks: { color: T.INK_2, font: { weight: "500" } }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, tooltip, {
              displayColors: false,
              callbacks: {
                title: (items) => {
                  const g = groups[items[0].dataIndex];
                  return `${g.code} · ${g.name}`;
                },
                label: (item) => `${fmt(item.raw)} ประกาศ · หมวด ${groups[item.dataIndex].category}`,
                afterLabel: () => "คลิกเพื่อดูกลุ่ม"
              }
            })
          }
        }
      });
      bindChartClick(state.charts.group, { mode: "index", axis: "y", intersect: false },
        (index) => `#/${groups[index].categoryRoute}/${groups[index].code}`);

      /* redraw once web font is ready so canvas text uses Prompt */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => Object.values(state.charts).forEach((c) => c.update("none")));
      }
    } catch (err) {
      console.error("[Charts]", err);
      renderChartFallback();
    }
  }

  function bindChartClick(chart, options, hrefForIndex) {
    const canvas = chart.canvas;
    const hit = (evt) => chart.getElementsAtEventForMode(evt, options.mode, options, true);
    canvas.addEventListener("click", (evt) => {
      const points = hit(evt);
      if (points.length) location.hash = hrefForIndex(points[0].index);
    });
    canvas.addEventListener("mousemove", (evt) => {
      canvas.style.cursor = hit(evt).length ? "pointer" : "default";
    });
  }

  /* ================= View: Category (A/B/C) ================= */
  function groupCard(group, cat, isSelected) {
    const empty = group.announcements === 0;
    return `
      <a class="group-card${empty ? " is-empty" : ""}${isSelected ? " is-selected" : ""}"
         href="#/${cat.route}/${group.code}" data-group="${group.code}"${isSelected ? ' aria-current="true"' : ""}>
        <div class="group-card-head">
          <span class="group-code">${group.code}</span>
          <h3>${escapeHtml(group.name)}</h3>
          <span class="group-count" title="จำนวนประกาศ">${group.announcements}</span>
        </div>
        ${empty
          ? `<p class="group-note"><i class="bi bi-info-circle" aria-hidden="true"></i> ${escapeHtml(group.note || "ไม่มีประกาศในชุด")}</p>`
          : `<div><p class="mini-label">ตัวอย่าง Program / บริการ</p>${chipList(group.examples)}</div>`}
        <div class="group-card-foot">
          <span>${empty ? "ไม่มีประกาศในชุด 76 ฉบับ" : `${group.announcements} ประกาศ · หน้าเริ่มต้น ${fmt(group.firstPage)}`}</span>
          <span class="soon"><i class="bi bi-diagram-2" aria-hidden="true"></i> Drill Down · Phase 2</span>
        </div>
      </a>`;
  }

  function renderCategoryView(section, cat, route) {
    const selectedCode = route.segments[0] ? route.segments[0].toUpperCase() : "";
    const selected = cat.groups.find((g) => g.code === selectedCode) || null;
    const share = pct(cat.announcements, FUND.announcements);
    const groupsWith = cat.groups.filter((g) => g.announcements > 0).length;

    section.innerHTML = `
      <div class="page-hero cat-${lower(cat.code)}">
        <div class="container page-hero-inner">
          <span class="cat-letter cat-letter-lg" aria-hidden="true">${cat.code}</span>
          <div class="page-hero-main">
            <p class="eyebrow">หมวด ${cat.code}</p>
            <h1>${escapeHtml(cat.name)}</h1>
            <p class="page-hero-desc">${cat.groups.map((g) => g.code).join(" · ")}</p>
          </div>
          <dl class="page-hero-stats">
            <div><dt>ประกาศ</dt><dd>${fmt(cat.announcements)}</dd></div>
            <div><dt>สัดส่วน</dt><dd>${share}%</dd></div>
            <div><dt>กลุ่มมีประกาศ</dt><dd>${groupsWith}/${cat.groups.length}</dd></div>
          </dl>
        </div>
      </div>
      <div class="container section section-tight cat-${lower(cat.code)}">
        <div class="notice" role="note">
          <i class="bi bi-hourglass-split" aria-hidden="true"></i>
          <div><strong>Program Drill Down เปิดใช้ใน Phase 2</strong><br>
          ขั้นนี้แสดงโครงสร้างกลุ่มและจำนวนประกาศ — Phase 2 จะเชื่อม revenue-master.json เพื่อเจาะลึก กลุ่ม › Program › รายการบริการ</div>
        </div>
        <div class="group-grid">${cat.groups.map((g) => groupCard(g, cat, g.code === selectedCode)).join("")}</div>
      </div>`;

    if (selected) {
      requestAnimationFrame(() => {
        const card = section.querySelector(`[data-group="${selected.code}"]`);
        if (card) {
          card.scrollIntoView({ block: "center" });
          card.focus({ preventScroll: true });
        }
      });
    }
  }

  /* ================= View: Search (Phase 1 shell) ================= */
  function renderSearchView(section, route) {
    const q = (route.query.q || "").trim();
    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Global Search</p>
            <h1 class="h2">ค้นหา</h1>
            <p class="section-desc">ค้นได้ทั้ง ${CFG.SEARCH_SCOPE.map(escapeHtml).join(" · ")}</p>
          </div>
        </div>
        <form class="search-hero" role="search" data-search-form>
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" name="q" value="${escapeHtml(q)}" placeholder="พิมพ์คำค้น เช่น Stroke, N18.5, ODS, CPAP" aria-label="คำค้น" autocomplete="off" enterkeyhint="search">
          <button class="btn btn-primary" type="submit">ค้นหา</button>
        </form>
        <div class="notice" role="note">
          <i class="bi bi-hourglass-split" aria-hidden="true"></i>
          <div>${q
            ? `<strong>คำค้น “${escapeHtml(q)}”</strong><br>ระบบค้นหาจาก Revenue Master จะเปิดใช้ใน Phase 2`
            : `<strong>ระบบค้นหาจะเปิดใช้ใน Phase 2</strong><br>เมื่อเชื่อมข้อมูล revenue-master.json แล้ว`}</div>
        </div>
        <div class="card card-pad">
          <h3>คำค้นตัวอย่าง</h3>
          <div class="chips chips-lg">${CFG.SEARCH_SUGGESTIONS.map((s) =>
            `<a class="chip chip-link" href="#/search?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join("")}</div>
        </div>
      </div>`;
  }

  function syncSearchInputs(route) {
    const q = route.view === "search" ? (route.query.q || "") : "";
    $$(".header-search input, .drawer-search input").forEach((input) => {
      if (document.activeElement !== input) input.value = q;
    });
  }

  /* ================= View: Placeholder (future phases) ================= */
  function renderPlaceholder(section, nav) {
    const planned = nav.planned || [];
    section.innerHTML = `
      <div class="container section">
        <div class="card placeholder">
          <div class="placeholder-icon" aria-hidden="true"><i class="bi ${nav.icon || "bi-grid"}"></i></div>
          <span class="pill pill-soon"><i class="bi bi-clock-history" aria-hidden="true"></i> เปิดใช้ใน Phase ${nav.phase}</span>
          <h1 class="h2">${escapeHtml(nav.label)}</h1>
          <p class="placeholder-desc">${escapeHtml(nav.description || "")}</p>
          ${planned.length ? `<ul class="plan-list">${planned.map((p) =>
            `<li><i class="bi bi-check2" aria-hidden="true"></i><span>${escapeHtml(p)}</span></li>`).join("")}</ul>` : ""}
          <a class="btn btn-outline" href="#/overview"><i class="bi bi-arrow-left" aria-hidden="true"></i> กลับหน้าภาพรวม</a>
        </div>
      </div>`;
  }

  /* ================= Drawer & search focus ================= */
  let lastFocus = null;

  function isDrawerOpen() {
    const drawer = $("#drawer");
    return !!drawer && drawer.classList.contains("is-open");
  }

  function openDrawer() {
    const drawer = $("#drawer");
    if (!drawer || isDrawerOpen()) return;
    lastFocus = document.activeElement;
    drawer.classList.add("is-open");
    drawer.removeAttribute("inert");
    drawer.setAttribute("aria-hidden", "false");
    $("#overlay").hidden = false;
    $$("[data-drawer-open]").forEach((b) => b.setAttribute("aria-expanded", "true"));
    document.body.classList.add("no-scroll");
    const target = drawer.querySelector(".drawer-link.is-active") || drawer.querySelector("[data-drawer-close]");
    if (target) target.focus({ preventScroll: true });
  }

  function closeDrawer(restoreFocus) {
    const drawer = $("#drawer");
    if (!drawer || !isDrawerOpen()) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("inert", "");
    drawer.setAttribute("aria-hidden", "true");
    $("#overlay").hidden = true;
    $$("[data-drawer-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    document.body.classList.remove("no-scroll");
    if (restoreFocus && lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function focusSearch() {
    const headerInput = $(".header-search input");
    if (headerInput && headerInput.getClientRects().length) {
      headerInput.focus();
      headerInput.select();
      return;
    }
    openDrawer();
    const drawerInput = $(".drawer-search input");
    if (drawerInput) setTimeout(() => drawerInput.focus(), 60);
  }

  /* ================= Events ================= */
  /* แสดง fade ขอบแถบเมนูเมื่อมีแท็บซ่อนอยู่ (13 เมนูล้นจอ) */
  function updateTabOverflow() {
    const list = $("#tabList");
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    list.classList.toggle("can-scroll-left", max > 2 && list.scrollLeft > 2);
    list.classList.toggle("can-scroll-right", max > 2 && list.scrollLeft < max - 2);
  }

  function bindTabOverflow() {
    const list = $("#tabList");
    if (!list) return;
    list.addEventListener("scroll", updateTabOverflow, { passive: true });
    window.addEventListener("resize", updateTabOverflow, { passive: true });
    /* mouse wheel แนวตั้ง → เลื่อนแถบเมนูแนวนอน (ผู้ใช้ desktop ที่ไม่มี trackpad) */
    list.addEventListener("wheel", (evt) => {
      if (list.scrollWidth <= list.clientWidth || Math.abs(evt.deltaX) > Math.abs(evt.deltaY)) return;
      evt.preventDefault();
      list.scrollLeft += evt.deltaY;
    }, { passive: false });
    updateTabOverflow();
  }

  function bindEvents() {
    window.addEventListener("hashchange", handleRoute);
    bindTabOverflow();

    document.addEventListener("submit", (evt) => {
      const form = evt.target.closest("[data-search-form]");
      if (!form) return;
      evt.preventDefault();
      const q = String(new FormData(form).get("q") || "").trim();
      const input = form.querySelector("input[name=q]");
      if (input) input.blur();
      location.hash = q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
    });

    document.addEventListener("click", (evt) => {
      const target = evt.target;
      if (!(target instanceof Element)) return;

      const skip = target.closest("[data-skip]");
      if (skip) {
        evt.preventDefault();
        const main = $("#main");
        main.focus({ preventScroll: true });
        main.scrollIntoView();
        return;
      }
      const scrollBtn = target.closest("[data-scroll-to]");
      if (scrollBtn) {
        const dest = document.getElementById(scrollBtn.dataset.scrollTo);
        if (dest) dest.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (target.closest("[data-focus-search]")) { focusSearch(); return; }
      if (target.closest("[data-drawer-open]")) { openDrawer(); return; }
      if (target.closest("[data-drawer-close]")) { closeDrawer(true); return; }
      if (target.closest(".drawer-link")) closeDrawer(false);
    });

    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape" && isDrawerOpen()) {
        closeDrawer(true);
        return;
      }
      const el = evt.target;
      const typing = el instanceof Element &&
        (el.matches("input, textarea, select") || el.isContentEditable);
      if (evt.key === "/" && !typing && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
        evt.preventDefault();
        focusSearch();
      }
    });

    const top = $("#appTop");
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        top.classList.toggle("is-scrolled", window.scrollY > 4);
        ticking = false;
      });
    }, { passive: true });

    const desktop = window.matchMedia("(min-width: 768px)");
    const onDesktop = (mq) => { if (mq.matches) closeDrawer(false); };
    if (desktop.addEventListener) desktop.addEventListener("change", onDesktop);
    else if (desktop.addListener) desktop.addListener(onDesktop);
  }

  /* ================= Chrome (version / logo) ================= */
  function renderChrome() {
    $$("[data-bind='version']").forEach((el) => { el.textContent = CFG.VERSION; });
    $$("[data-bind='announcements']").forEach((el) => { el.textContent = fmt(FUND.announcements); });

    if (CFG.PATHS.LOGO) {
      const img = new Image();
      img.alt = "";
      img.onload = () => {
        const mark = $("#brandMark");
        mark.innerHTML = "";
        mark.appendChild(img);
        mark.classList.add("has-logo");
      };
      img.src = CFG.PATHS.LOGO;
    }
  }

  function renderOverviewStatic() {
    renderLadder();
    renderStructureCheck();
    renderKpiPrimary();
    renderKpiCategories();
    renderKpiData();
    renderSourceLine();
    renderCategoryPanels();
  }

  /* ================= Public API ================= */
  const App = {
    config: CFG,
    version: CFG.VERSION,
    state,
    utils: { $, $$, escapeHtml, fmt, pct, catColor },

    /** ลงทะเบียน renderer ของ view (ใช้โดยโมดูล Phase 2+) */
    registerView(id, renderer) {
      if (!NAV_BY_ID.has(id)) console.warn(`[App] Unknown view id: ${id}`);
      if (typeof renderer !== "function") throw new TypeError("renderer must be a function");
      viewRenderers.set(id, renderer);
      if (state.ready && state.route && state.route.view === id) handleRoute();
    },
    navigate(path) {
      location.hash = path.charAt(0) === "#" ? path : `#/${path.replace(/^\/+/, "")}`;
    },
    setBreadcrumb(crumbs) { renderBreadcrumb(crumbs); },
    /** อัปเดต KPI ที่คำนวณจาก Dataset จริง เช่น { programs: 76, icd10: 120 } */
    setDataKpis(values) {
      Object.assign(state.dataKpis, values || {});
      renderKpiData();
    },
    getCategory: (code) => CFG.CATEGORIES.find((c) => c.code === code) || null,
    getGroup: (code) => GROUP_BY_CODE.get(code) || null,
    getGroups: () => ALL_GROUPS.slice(),
    getRoute: () => state.route
  };
  window.App = App;

  /* ================= Init ================= */
  onReady(() => {
    try {
      renderChrome();
      renderNav();
      renderOverviewStatic();
      bindEvents();
      if (!location.hash || !parseHash().known) replaceHash("#/overview");
      handleRoute();
      state.ready = true;
    } catch (err) {
      console.error("[App init]", err);
      showFatal("เกิดข้อผิดพลาดระหว่างเริ่มระบบ กรุณารีเฟรชหน้า");
    }
  });
})();
