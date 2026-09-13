/* =========================================================
 * drilldown.js — Tab หมวด A/B/C + Drill Down (Phase 2 · Phase 3 ใช้ detail.js)
 *   #/cat-a                → หมวด: Group Cards + Program ทั้งหมด (กรองได้)
 *   #/cat-a/A2             → กลุ่ม: Program Cards (กรองได้)
 *   #/cat-a/A2/RM-011      → Program: รายละเอียด (App.detail.renderPage)
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[drilldown.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt, pct } = App.utils;
  const MISSING = "ไม่ระบุใน Revenue Master";
  const RATE_CHECK = "ตรวจสอบอัตราจ่ายตามประกาศฉบับเต็ม";
  const lower = (s) => String(s).toLowerCase();
  const lastKeys = new WeakMap();

  /* ---------------- Small helpers ---------------- */
  const has = (v) => v != null && String(v).trim() !== "";
  const termsOf = (q) => (q ? App.utils.normalizeText(q).split(/\s+/).filter(Boolean) : []);
  const hl = (text, terms) => (App.search && terms.length ? App.search.highlight(text, terms) : escapeHtml(text));
  const pageRange = (r) => (App.ui ? App.ui.pageRange(r) : String(r.source_page || "—"));

  function noticeHtml(message) {
    return `<div class="notice" role="note"><i class="bi bi-info-circle" aria-hidden="true"></i><div>${escapeHtml(message)}</div></div>`;
  }

  function loadingHtml() {
    return `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> กำลังโหลด Revenue Master…</div>`;
  }

  function statusMini(counts) {
    return `
      <span class="status-mini" aria-label="Complete ${counts.Complete}, Partial ${counts.Partial}, Needs Review ${counts["Needs Review"]}">
        <span class="sm status-complete" title="Complete"><i class="bi bi-check-circle-fill" aria-hidden="true"></i>${counts.Complete}</span>
        <span class="sm status-partial" title="Partial"><i class="bi bi-circle-half" aria-hidden="true"></i>${counts.Partial}</span>
        <span class="sm status-review" title="Needs Review"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>${counts["Needs Review"]}</span>
      </span>`;
  }

  /* ---------------- Router entry ---------------- */
  function render(section, route, cat) {
    const key = [route.view].concat(route.segments).join("/");
    const previousKey = lastKeys.get(section);
    if (previousKey !== undefined && previousKey !== key) window.scrollTo(0, 0);
    lastKeys.set(section, key);

    if (!App.data) {
      section.innerHTML = `${categoryHero(cat, null)}<div class="container section section-tight">${loadingHtml()}</div>`;
      App.whenData()
        .then(() => { if (App.getRoute() === route) render(section, route, cat); })
        .catch((err) => {
          if (App.getRoute() === route) {
            section.innerHTML = `${categoryHero(cat, null)}<div class="container section section-tight">${App.loadErrorHtml(err)}</div>`;
          }
        });
      return;
    }

    const groupCode = route.segments[0] ? route.segments[0].toUpperCase() : "";
    const programId = route.segments[1] || "";
    const group = groupCode ? cat.groups.find((g) => g.code === groupCode) : null;
    const filters = App.filters.parse(route.query);

    if (groupCode && !group) {
      return renderCategory(section, cat, filters, `ไม่พบกลุ่ม “${groupCode}” ในหมวด ${cat.code}`);
    }
    if (group && programId) {
      const record = App.data.byId.get(programId);
      if (record && record.group_code === group.code) return App.detail.renderPage(section, record, { cat, group });
      return renderGroup(section, cat, group, filters, `ไม่พบ Program “${programId}” ในกลุ่ม ${group.code}`);
    }
    if (group) return renderGroup(section, cat, group, filters);
    return renderCategory(section, cat, filters);
  }

  /* ---------------- Level 1: Category ---------------- */
  function categoryHero(cat, records) {
    const share = pct(cat.announcements, CFG.FUND_SUMMARY.announcements);
    return `
      <div class="page-hero cat-${lower(cat.code)}">
        <div class="container page-hero-inner">
          <span class="cat-letter cat-letter-lg" aria-hidden="true">${escapeHtml(cat.code)}</span>
          <div class="page-hero-main">
            <p class="eyebrow">หมวด ${escapeHtml(cat.code)}</p>
            <h1>${escapeHtml(cat.name)}</h1>
            <p class="page-hero-desc">${cat.groups.map((g) => escapeHtml(g.code)).join(" · ")}</p>
          </div>
          <dl class="page-hero-stats">
            <div><dt>ประกาศ</dt><dd>${fmt(cat.announcements)}</dd></div>
            <div><dt>สัดส่วน</dt><dd>${share}%</dd></div>
            <div><dt>Program</dt><dd>${records ? fmt(records.length) : "…"}</dd></div>
          </dl>
        </div>
      </div>`;
  }

  function groupCard(cat, g) {
    const records = App.data.byGroup.get(g.code) || [];
    const empty = g.announcements === 0;
    const shown = records.slice(0, 6);
    return `
      <a class="group-card${empty ? " is-empty" : ""}" href="#/${cat.route}/${escapeHtml(g.code)}" data-group="${escapeHtml(g.code)}">
        <div class="group-card-head">
          <span class="group-code">${escapeHtml(g.code)}</span>
          <h3>${escapeHtml(g.name)}</h3>
          <span class="group-count" title="จำนวน Program">${fmt(records.length)}</span>
        </div>
        ${empty
          ? `<p class="group-note"><i class="bi bi-info-circle" aria-hidden="true"></i> ${escapeHtml(g.note || "ไม่มีประกาศในชุด")}</p>`
          : `<div><p class="mini-label">Program</p><span class="chips">${shown.map((r) => `<span class="chip">${escapeHtml(r.program_name)}</span>`).join("")}${records.length > shown.length ? `<span class="chip chip-more">+${records.length - shown.length}</span>` : ""}</span></div>`}
        <div class="group-card-foot">
          <span>${empty ? "ไม่มีประกาศในชุด 76 ฉบับ" : `${fmt(g.announcements)} ประกาศ · หน้า ${fmt(g.firstPage)}`}</span>
          ${empty ? "" : statusMini(App.statusCounts(records))}
        </div>
      </a>`;
  }

  function renderCategory(section, cat, filters, warning) {
    const scope = App.data.byCategory.get(cat.code) || [];
    section.innerHTML = `
      ${categoryHero(cat, scope)}
      <div class="container section section-tight cat-${lower(cat.code)}">
        ${warning ? noticeHtml(warning) : ""}
        <div class="block-head">
          <h2 class="h3">กลุ่มในหมวด ${escapeHtml(cat.code)}</h2>
          <p>เลือกกลุ่มเพื่อดู Program และรายการบริการ</p>
        </div>
        <div class="group-grid">${cat.groups.map((g) => groupCard(cat, g)).join("")}</div>
        <div class="block-head">
          <h2 class="h3">Program ทั้งหมดในหมวด ${escapeHtml(cat.code)}</h2>
          <p>กรองตามกลุ่ม ระบบ Claim วิธีจ่าย หน่วยงาน สถานะข้อมูล หรือรหัส</p>
        </div>
        <div class="filter-host" data-filter-host></div>
        <div data-program-list></div>
      </div>`;
    mountList(section, scope, filters, false);
  }

  /* ---------------- Level 2: Group ---------------- */
  function renderGroup(section, cat, group, filters, warning) {
    const scope = App.data.byGroup.get(group.code) || [];
    section.innerHTML = `
      <div class="group-hero cat-${lower(cat.code)}">
        <div class="container group-hero-inner">
          <a class="back-link" href="#/${cat.route}"><i class="bi bi-arrow-left" aria-hidden="true"></i> หมวด ${escapeHtml(cat.code)} · ${escapeHtml(cat.name)}</a>
          <div class="group-hero-main">
            <span class="group-code group-code-lg">${escapeHtml(group.code)}</span>
            <div>
              <p class="eyebrow">หมวด ${escapeHtml(cat.code)} › กลุ่ม</p>
              <h1>${escapeHtml(group.name)}</h1>
            </div>
          </div>
          <dl class="group-hero-stats">
            <div><dt>ประกาศ</dt><dd>${fmt(group.announcements)}</dd></div>
            <div><dt>Program</dt><dd>${fmt(scope.length)}</dd></div>
            <div><dt>หน้าเริ่มต้น</dt><dd>${group.firstPage ? fmt(group.firstPage) : "—"}</dd></div>
          </dl>
        </div>
      </div>
      <div class="container section section-tight cat-${lower(cat.code)}">
        ${warning ? noticeHtml(warning) : ""}
        ${group.announcements === 0 ? noticeHtml(group.note || "ไม่มีประกาศในชุด 76 ฉบับ") : ""}
        <div class="filter-host" data-filter-host></div>
        <div data-program-list></div>
      </div>`;

    if (scope.length) {
      mountList(section, scope, filters, true);
    } else {
      section.querySelector("[data-filter-host]").remove();
      section.querySelector("[data-program-list]").innerHTML =
        `<div class="empty-state"><i class="bi bi-inbox" aria-hidden="true"></i><p>กลุ่มนี้ไม่มี Program ใน Revenue Master</p></div>`;
    }
  }

  /* ---------------- Program list (shared by level 1 & 2) ---------------- */
  function mountList(section, scope, filters, hideGroup) {
    const host = section.querySelector("[data-filter-host]");
    const list = section.querySelector("[data-program-list]");
    const draw = (f) => {
      const rows = App.filters.apply(scope, f);
      const terms = termsOf(f.q);
      list.innerHTML = `
        <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(scope.length)} Program</p>
        ${rows.length
          ? `<div class="program-list">${rows.map((r) => programCard(r, terms)).join("")}</div>`
          : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบ Program ที่ตรงกับตัวกรอง</p></div>`}`;
    };
    App.filters.renderBar(host, { scope, filters, hideGroup, onChange: draw });
    draw(filters);
  }

  function keyFact(icon, label, value, terms, isMoney) {
    return `
      <div class="key-fact${isMoney ? " is-money" : ""}">
        <dt><i class="bi ${icon}" aria-hidden="true"></i>${escapeHtml(label)}</dt>
        <dd>${has(value) ? hl(value, terms) : `<span class="missing">${isMoney ? RATE_CHECK : MISSING}</span>`}</dd>
      </div>`;
  }

  function programCard(r, terms) {
    return `
      <a class="program-card cat-${lower(r.category)}" href="${App.recordHref(r)}">
        <div class="program-card-head">
          <span class="group-code">${escapeHtml(r.group_code)}</span>
          <h3>${hl(r.program_name, terms)}</h3>
          ${App.statusBadge(r.data_status)}
        </div>
        <p class="program-title">${hl(r.announcement_title, terms)}</p>
        <dl class="key-facts">
          ${keyFact("bi-people", "กลุ่มเป้าหมาย", r.target_population, terms)}
          ${keyFact("bi-ui-checks", "เงื่อนไข", r.conditions, terms)}
          ${keyFact("bi-cash-coin", "เงินที่จะได้รับ", r.payment_rate, terms, true)}
        </dl>
        <div class="program-card-foot">
          ${r.claim_system_tags.map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
          <span class="code-count"><i class="bi bi-heart-pulse" aria-hidden="true"></i> ICD-10 ${fmt(r.icd10.length)}</span>
          <span class="code-count"><i class="bi bi-bandaid" aria-hidden="true"></i> ICD-9 ${fmt(r.icd9.length)}</span>
          <span class="code-count"><i class="bi bi-file-earmark-text" aria-hidden="true"></i> หน้า ${pageRange(r)}</span>
        </div>
      </a>`;
  }

  /* ---------------- Register A/B/C views ---------------- */
  CFG.CATEGORIES.forEach((cat) => {
    App.registerView(cat.route, (section, route) => render(section, route, cat));
  });
})();
