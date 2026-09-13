/* =========================================================
 * codes.js — ICD / Procedure Explorer (Phase 3)
 *   #/codes?q=&code=         → ICD-10 (Diagnosis)
 *   #/codes/icd9?q=&code=    → ICD-9-CM (Procedure)
 * - ค้นหารหัส (prefix / ช่วงรหัส) หรือคำอธิบาย
 * - คลิกรหัส → Program ที่เกี่ยวข้อง + Diagnosis–Procedure Pair
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[codes.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml, fmt } = App.utils;
  const TYPES = Object.freeze({
    icd10: { key: "icd10", other: "icd9", label: "ICD-10", title: "ICD-10 · Diagnosis", route: "#/codes", placeholder: "เช่น Z51.5, N18.5, C15, neoplasm" },
    icd9: { key: "icd9", other: "icd10", label: "ICD-9-CM", title: "ICD-9-CM · Procedure", route: "#/codes/icd9", placeholder: "เช่น 83.63, 45.23, laparoscopic" }
  });
  const EXAMPLES = [["Z51.5", "icd10"], ["N18.5", "icd10"], ["C15", "icd10"], ["83.63", "icd9"]];
  const LOOKS_LIKE_CODE = /^(?:[a-z]\d|[a-z]$|\d)/i;
  const MAX_ROWS = 400;
  const lower = (s) => String(s).toLowerCase();

  /* ---------------- Index ---------------- */
  let cache = { data: null, index: null };

  function buildIndex(data) {
    const maps = { icd10: new Map(), icd9: new Map() };
    data.records.forEach((r) => ["icd10", "icd9"].forEach((type) => r[type].forEach((c) => {
      const map = maps[type];
      if (!map.has(c.code)) {
        const parts = c.code.split(/\s*-\s*/);
        map.set(c.code, {
          code: c.code, desc: "", refs: [],
          keyLo: App.search.codeKey(parts[0]),
          keyHi: App.search.codeKey(parts[1] || parts[0])
        });
      }
      const entry = map.get(c.code);
      if (!entry.desc && c.desc) entry.desc = c.desc;
      entry.refs.push({ record: r, page: c.page, pairs: c.pairs || [] });
    })));
    const list = (map) => Array.from(map.values())
      .map((e) => Object.assign(e, { descNorm: App.utils.normalizeText(e.desc) }))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
    return { icd10: list(maps.icd10), icd9: list(maps.icd9), maps };
  }

  function getIndex() {
    if (cache.data !== App.data) cache = { data: App.data, index: buildIndex(App.data) };
    return cache.index;
  }

  function matches(entry, q) {
    const query = (q || "").trim();
    if (!query) return true;
    if (LOOKS_LIKE_CODE.test(query) && App.search.codeMatches(entry, App.search.codeKey(query))) return true;
    return entry.descNorm.includes(App.utils.normalizeText(query));
  }

  const uniqueRecords = (entry) => Array.from(new Map(entry.refs.map((x) => [x.record.id, x.record])).values());
  const pagesOf = (refs) => Array.from(new Set(refs.map((x) => x.page).filter(Boolean))).join(", ");

  /* ---------------- List ---------------- */
  function listHtml(rows, state, T, otherCount) {
    const terms = state.q ? [App.utils.normalizeText(state.q.trim())] : [];
    const hl = (text) => App.ui.hl(text, terms);
    if (!rows.length) {
      const other = TYPES[T.other];
      return `
        <div class="empty-state">
          <i class="bi bi-search" aria-hidden="true"></i>
          <p>ไม่พบ ${escapeHtml(T.label)} ที่ตรงกับ “${escapeHtml(state.q)}”</p>
          ${otherCount ? `<a class="btn btn-outline btn-sm" href="${other.route}?q=${encodeURIComponent(state.q)}">พบใน ${escapeHtml(other.label)} ${fmt(otherCount)} รหัส <i class="bi bi-arrow-right" aria-hidden="true"></i></a>` : ""}
        </div>`;
    }
    const shown = rows.slice(0, MAX_ROWS);
    return `
      <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(shown.length)}</strong>${rows.length > shown.length ? ` จาก ${fmt(rows.length)}` : ""} รหัส</p>
      <div class="table-wrap code-list-wrap">
        <table class="data-table code-list">
          <thead><tr><th>รหัส</th><th>คำอธิบาย (จาก PDF)</th><th>Program</th><th class="num">หน้า</th></tr></thead>
          <tbody>${shown.map((e) => `
            <tr class="${e.code === state.code ? "is-selected" : ""}" data-code-row="${escapeHtml(e.code)}">
              <td><button type="button" class="code-btn" data-code="${escapeHtml(e.code)}" aria-pressed="${e.code === state.code}">${hl(e.code)}</button></td>
              <td>${e.desc ? hl(e.desc) : `<span class="missing">ไม่มีคำอธิบายใน PDF</span>`}</td>
              <td>${uniqueRecords(e).map((r) => `<span class="nowrap"><span class="group-code-sm cat-${lower(r.category)}">${escapeHtml(r.group_code)}</span>${escapeHtml(r.program_name)}</span>`).join("<br>")}</td>
              <td class="num">${escapeHtml(pagesOf(e.refs))}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  /* ---------------- Panel ---------------- */
  function programCard(record, refs) {
    const facts = App.claim.paymentFacts(record);
    const lc = lower(record.category);
    return `
      <div class="panel-program cat-${lc}">
        <div class="panel-program-head">
          <span class="group-code-sm cat-${lc}">${escapeHtml(record.group_code)}</span>
          <strong>${escapeHtml(record.program_name)}</strong>
          ${App.statusBadge(record.data_status)}
        </div>
        <p><i class="bi bi-people" aria-hidden="true"></i> ${escapeHtml(App.ui.clip(record.target_population, 110))}</p>
        <p><i class="bi bi-cash-coin" aria-hidden="true"></i> ${escapeHtml(facts.tags.join(" · "))}${facts.tags.length ? " — " : ""}${escapeHtml(App.ui.clip(record.payment_rate, 80))}</p>
        <div class="panel-actions">
          <button type="button" class="link-btn" data-open-detail="${escapeHtml(record.id)}"><i class="bi bi-layout-sidebar-reverse" aria-hidden="true"></i> รายละเอียด</button>
          <a href="${App.recordHref(record)}">หน้า Program <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
          <span class="mini-label">หน้า ${escapeHtml(pagesOf(refs))}</span>
        </div>
      </div>`;
  }

  function pairsFor(entry, type) {
    const other = type === "icd10" ? "icd9" : "icd10";
    const out = [];
    entry.refs.forEach((ref) => {
      if (!ref.pairs.length) return;
      App.claim.pairGroups(ref.record).forEach((group) => {
        if (ref.pairs.includes(group.key)) out.push({ record: ref.record, group, codes: group[other] });
      });
    });
    return out;
  }

  function panelHtml(idx, type, code) {
    const T = TYPES[type];
    const entry = code ? idx.maps[type].get(code) : null;
    if (!entry) {
      return `
        <div class="code-panel-empty">
          <i class="bi bi-hand-index" aria-hidden="true"></i>
          <p>เลือกรหัสจากตาราง เพื่อดู Program ที่เกี่ยวข้อง${type === "icd10" ? " และ Procedure ที่จับคู่" : " และ Diagnosis ที่จับคู่"}</p>
          ${code ? `<p class="mini-label">ไม่พบรหัส “${escapeHtml(code)}” ใน ${escapeHtml(T.label)}</p>` : ""}
        </div>`;
    }
    const byRecord = new Map();
    entry.refs.forEach((ref) => {
      if (!byRecord.has(ref.record.id)) byRecord.set(ref.record.id, { record: ref.record, refs: [] });
      byRecord.get(ref.record.id).refs.push(ref);
    });
    const pairs = pairsFor(entry, type);
    const otherType = T.other;
    return `
      <div class="code-panel-head">
        <span class="mini-label">${escapeHtml(T.title)}</span>
        <h2><code>${escapeHtml(entry.code)}</code></h2>
        <p>${entry.desc ? escapeHtml(entry.desc) : `<span class="missing">ไม่มีคำอธิบายใน PDF</span>`}</p>
      </div>
      <h3 class="panel-title">Program ที่เกี่ยวข้อง (${fmt(byRecord.size)})</h3>
      <div class="panel-programs">${Array.from(byRecord.values()).map((x) => programCard(x.record, x.refs)).join("")}</div>
      <h3 class="panel-title">${type === "icd10" ? "Procedure (ICD-9-CM)" : "Diagnosis (ICD-10)"} ที่จับคู่ในตารางประกาศ</h3>
      ${pairs.length
        ? `<div class="pair-list">${pairs.map((p) => `
            <div class="pair">
              <span class="pair-label">${escapeHtml(p.record.group_code)} · ${escapeHtml(p.record.program_name)} · ${escapeHtml(App.claim.pairLabel(p.group))}</span>
              <div>${p.codes.map((c) => App.claim.codeChip(c, otherType)).join("")}</div>
            </div>`).join("")}</div>`
        : `<p class="fact-absent"><i class="bi bi-info-circle" aria-hidden="true"></i> ไม่มีข้อมูล Diagnosis–Procedure Pair สำหรับรหัสนี้</p>`}`;
  }

  /* ---------------- View ---------------- */
  function render(section, route) {
    const type = route.segments[0] === "icd9" ? "icd9" : "icd10";
    const T = TYPES[type];
    if (!App.data) return App.renderWhenData(section, route, render);

    const idx = getIndex();
    const state = { q: (route.query.q || "").trim(), code: route.query.code || "" };

    App.setBreadcrumb([
      { label: "ภาพรวม", href: "#/overview", icon: "bi-house-door" },
      { label: "ICD / Procedure", href: "#/codes" },
      { label: T.label }
    ]);

    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">ICD / Procedure</p>
            <h1 class="h2">ICD / Procedure</h1>
            <p class="section-desc">ค้นหารหัสแล้วดู Program ที่เกี่ยวข้อง · รหัสดึงจาก PDF ประกาศพร้อมเลขหน้า · ${escapeHtml((App.data.meta && App.data.meta.pair_note) || "")}</p>
          </div>
        </div>
        <div class="subtabs" role="tablist" aria-label="ประเภทรหัส">
          ${["icd10", "icd9"].map((t) => `
            <a role="tab" class="subtab${t === type ? " is-active" : ""}" aria-selected="${t === type}" href="${TYPES[t].route}${state.q ? `?q=${encodeURIComponent(state.q)}` : ""}">
              ${escapeHtml(TYPES[t].title)}<span class="subtab-count">${fmt(idx[t].length)}</span>
            </a>`).join("")}
        </div>
        <div class="code-search">
          <div class="filter-search">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input type="search" data-code-q value="${escapeHtml(state.q)}" placeholder="${escapeHtml(T.placeholder)}" aria-label="ค้นหา ${escapeHtml(T.label)}" autocomplete="off">
          </div>
          <span class="chips">${EXAMPLES.map(([ex, t]) => `<a class="chip chip-link" href="${TYPES[t].route}?q=${encodeURIComponent(ex)}">${escapeHtml(ex)}</a>`).join("")}</span>
        </div>
        <div class="codes-layout">
          <div data-code-list></div>
          <aside class="code-panel" data-code-panel aria-live="polite" aria-label="รายละเอียดรหัส"></aside>
        </div>
      </div>`;

    const listEl = section.querySelector("[data-code-list]");
    const panelEl = section.querySelector("[data-code-panel]");

    const drawList = () => {
      const rows = idx[type].filter((e) => matches(e, state.q));
      const otherCount = state.q && !rows.length ? idx[T.other].filter((e) => matches(e, state.q)).length : 0;
      listEl.innerHTML = listHtml(rows, state, T, otherCount);
    };
    const drawPanel = () => { panelEl.innerHTML = panelHtml(idx, type, state.code); };

    drawList();
    drawPanel();

    const input = section.querySelector("[data-code-q]");
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = input.value.trim();
        App.filters.setHashParams({ q: state.q });
        drawList();
      }, 200);
    });
    input.addEventListener("keydown", (evt) => { if (evt.key === "Enter") evt.preventDefault(); });

    listEl.addEventListener("click", (evt) => {
      const row = evt.target instanceof Element ? evt.target.closest("[data-code-row]") : null;
      if (!row) return;
      state.code = row.dataset.codeRow;
      App.filters.setHashParams({ code: state.code });
      listEl.querySelectorAll("tr.is-selected").forEach((tr) => tr.classList.remove("is-selected"));
      row.classList.add("is-selected");
      drawPanel();
      if (window.matchMedia("(max-width: 1024px)").matches) panelEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (state.code) {
      const selected = listEl.querySelector(".is-selected");
      if (selected) requestAnimationFrame(() => selected.scrollIntoView({ block: "center" }));
    }
    App.detail.syncFromRoute(route);
  }

  App.registerView("codes", render);
})();
