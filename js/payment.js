/* =========================================================
 * payment.js — Payment Explorer "อัตราจ่าย" (Phase 3)
 * คอลัมน์: Program · Service · Payment Method · Rate · Unit · Ceiling · Formula · Condition
 * ตัวกรอง: หมวด · กลุ่ม · Program · Payment Method
 * Unit / Ceiling แสดงเฉพาะที่พบในข้อความประกาศ (PDF) พร้อมเลขหน้า
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[payment.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml, fmt } = App.utils;
  const FIELDS = ["q", "cat", "group", "prog", "pay"];
  const MISSING = "ไม่ระบุใน Revenue Master";
  const RATE_CHECK = "ตรวจสอบอัตราจ่ายตามประกาศฉบับเต็ม";
  const notFound = () => `<span class="missing" title="${MISSING}">ไม่ระบุ</span>`;
  const quote = (m) => `<span class="fact-quote">${escapeHtml(App.ui.clip(m.text, 110))} <small>หน้า ${escapeHtml(m.page)}</small></span>`;

  function rowHtml(r, terms) {
    const { hl, textCell } = App.ui;
    const f = App.claim.paymentFacts(r);
    const lc = r.category.toLowerCase();
    const formula = [
      f.formula && `สูตร: ${f.formula}`,
      f.drgVersion && `DRG ${f.drgVersion}`,
      f.point && "Point System",
      f.globalBudget && "Global Budget / การจัดสรร",
      f.feeSchedule && "Fee Schedule ตามรายการบริการ"
    ].filter(Boolean);

    return `
      <tr class="cat-${lc}">
        <td class="col-program sticky-col">
          <span class="group-code-sm cat-${lc}">${escapeHtml(r.group_code)}</span>
          <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${hl(r.program_name, terms)}</button>
          <div class="cell-meta">${App.statusBadge(r.data_status)}</div>
        </td>
        <td>${textCell(r.claim_item, terms)}</td>
        <td>${f.tags.length ? `<span class="cell-tags">${f.tags.map((t) => `<span class="pill pill-money">${escapeHtml(t)}</span>`).join("")}</span>` : notFound()}</td>
        <td class="col-rate">
          ${App.ui.has(r.payment_rate) ? `<strong>${hl(r.payment_rate, terms)}</strong>` : notFound()}
          ${r.rate_mentions.slice(0, 2).map(quote).join("")}
          ${r.rate_mentions.length > 2 ? `<button type="button" class="link-btn mini" data-open-detail="${escapeHtml(r.id)}">+${fmt(r.rate_mentions.length - 2)} ข้อความ</button>` : ""}
          ${r.rate_mentions.length ? "" : `<span class="fact-absent"><i class="bi bi-search" aria-hidden="true"></i> ${RATE_CHECK}</span>`}
        </td>
        <td>${f.units.length ? `<span class="cell-tags">${f.units.slice(0, 4).map((u) => `<span class="pill">${escapeHtml(u.unit)} <small>หน้า ${escapeHtml(u.page)}</small></span>`).join("")}</span>` : notFound()}</td>
        <td>${f.ceilings.length ? f.ceilings.slice(0, 2).map(quote).join("") : notFound()}</td>
        <td>${formula.length ? formula.map((x) => `<span class="fact-quote">${escapeHtml(x)}</span>`).join("") : notFound()}</td>
        <td>${textCell(r.conditions, terms)}</td>
      </tr>`;
  }

  function render(section, route) {
    if (!App.data) return App.renderWhenData(section, route, render);

    const records = App.data.records;
    const filters = App.filters.parse(route.query);
    const methods = App.countTags(records, (r) => r.payment_method_tags);
    const untagged = records.filter((r) => !r.payment_method_tags.length).length;

    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Payment Explorer</p>
            <h1 class="h2">อัตราจ่าย</h1>
            <p class="section-desc">วิธีจ่าย อัตรา หน่วย เพดาน และสูตรของทุก Program · Unit / Ceiling แสดงเฉพาะที่พบในข้อความประกาศ (PDF) พร้อมเลขหน้า · ถ้าไม่มีตัวเลข: ${RATE_CHECK}</p>
          </div>
        </div>
        <div class="method-summary">
          <span class="mini-label">Payment Method</span>
          ${methods.map((m) => `<a class="chip chip-link${filters.pay === m.value ? " is-active" : ""}" href="#/payment?pay=${encodeURIComponent(m.value)}">${escapeHtml(m.value)} (${fmt(m.count)})</a>`).join("")}
          ${untagged ? `<span class="chip" title="${MISSING}">ไม่ระบุวิธีจ่าย (${fmt(untagged)})</span>` : ""}
        </div>
        <div class="filter-host is-static" data-filter-host></div>
        <div data-payment></div>
      </div>`;

    const out = section.querySelector("[data-payment]");
    const draw = (f) => {
      const rows = App.filters.apply(records, f);
      const terms = App.ui.termsOf(f.q);
      out.innerHTML = `
        <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(records.length)} Program</p>
        ${rows.length ? `
          <div class="table-wrap catalog-wrap">
            <table class="data-table catalog-table payment-table">
              <caption class="sr-only">อัตราจ่าย</caption>
              <thead><tr>
                <th class="col-program sticky-col">Program</th><th>Service</th><th>Payment Method</th><th>Rate</th>
                <th>Unit</th><th>Ceiling</th><th>Formula</th><th>Condition</th>
              </tr></thead>
              <tbody>${rows.map((r) => rowHtml(r, terms)).join("")}</tbody>
            </table>
          </div>`
          : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบ Program ที่ตรงกับตัวกรอง</p></div>`}`;
    };

    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope: records, filters, fields: FIELDS, onChange: draw
    });
    draw(filters);
    App.detail.syncFromRoute(route);
  }

  App.registerView("payment", render);
})();
