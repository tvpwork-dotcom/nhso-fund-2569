/* =========================================================
 * catalog.js — Claim Catalog (Phase 3)
 * ตาราง 14 คอลัมน์: หมวด · กลุ่ม · Program · กลุ่มเป้าหมาย · ผู้ Claim · รายการ Claim
 *   · ICD-10 · ICD-9 · รหัสบริการ · อัตราจ่าย · ระบบ Claim · เงื่อนไข · รายงานติดตาม · หน่วยงานเจ้าภาพ
 * ตัวกรอง: หมวด · กลุ่ม · Program · กลุ่มเป้าหมาย · ระบบ Claim · Payment Method · หน่วยงาน · มี ICD-10 · มี ICD-9
 * คลิกชื่อ Program → Detail Drawer (?open=RM-xxx)
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[catalog.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml, fmt } = App.utils;
  const FIELDS = ["q", "cat", "group", "sys", "pay", "prog", "target", "dept", "icd10", "icd9", "status"];
  const SORTS = {
    seq: (a, b) => a.seq - b.seq,
    program: (a, b) => a.program_name.localeCompare(b.program_name, "th"),
    icd10: (a, b) => a.icd10.length - b.icd10.length || a.seq - b.seq,
    icd9: (a, b) => a.icd9.length - b.icd9.length || a.seq - b.seq
  };

  const cellTags = (tags, cls) => (tags.length
    ? `<span class="cell-tags">${tags.map((t) => `<span class="pill${cls ? ` ${cls}` : ""}">${escapeHtml(t)}</span>`).join("")}</span>`
    : "");

  function codesCell(list, describedText, terms) {
    const { hl } = App.ui;
    if (list.length) {
      return `<span class="count-badge">${fmt(list.length)}</span> ${list.slice(0, 3).map((c) => `<code>${hl(c.code, terms)}</code>`).join(" ")}${list.length > 3 ? ` <span class="mini-label">+${fmt(list.length - 3)}</span>` : ""}`;
    }
    return App.ui.has(describedText)
      ? `<span class="muted-text">${hl(describedText, terms)}</span>`
      : `<span class="missing" title="ไม่ระบุใน Revenue Master">ไม่ระบุ</span>`;
  }

  function sortHeader(key, label, sort, dir, cls) {
    const active = sort === key;
    const icon = active ? (dir === "asc" ? "bi-sort-up" : "bi-sort-down") : "bi-arrow-down-up";
    return `
      <th class="${cls || ""}" aria-sort="${active ? (dir === "asc" ? "ascending" : "descending") : "none"}">
        <button type="button" class="th-sort${active ? " is-active" : ""}" data-sort="${key}">${escapeHtml(label)}<i class="bi ${icon}" aria-hidden="true"></i></button>
      </th>`;
  }

  function rowHtml(r, terms) {
    const { hl, textCell, pageRange } = App.ui;
    const lc = r.category.toLowerCase();
    const depts = r.departments;
    return `
      <tr class="cat-${lc}">
        <td class="col-cat sticky-col"><span class="nav-letter">${escapeHtml(r.category)}</span></td>
        <td class="col-group sticky-col"><span class="group-code">${escapeHtml(r.group_code)}</span></td>
        <td class="col-program sticky-col">
          <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${hl(r.program_name, terms)}</button>
          <div class="cell-meta">${App.statusBadge(r.data_status)}<span class="mini-label">หน้า ${pageRange(r)}</span></div>
        </td>
        <td>${textCell(r.target_population, terms)}</td>
        <td>${textCell(r.claim_owner, terms)}</td>
        <td>${textCell(r.claim_item, terms)}</td>
        <td>${codesCell(r.icd10, r.icd10_text, terms)}</td>
        <td>${codesCell(r.icd9, r.icd9_text, terms)}</td>
        <td>${textCell(r.service_code_text, terms)}${r.drug_codes.length ? `<div class="mini-label">GPUID ${fmt(r.drug_codes.length)} รายการ</div>` : ""}</td>
        <td>${cellTags(r.payment_method_tags, "pill-money")}${textCell(r.payment_rate, terms)}${r.rate_mentions.length ? `<div class="mini-label">อัตราจาก PDF ${fmt(r.rate_mentions.length)} ข้อความ</div>` : ""}</td>
        <td>${r.claim_system_tags.length ? cellTags(r.claim_system_tags) : textCell(r.claim_system, terms)}</td>
        <td>${textCell(r.conditions, terms)}</td>
        <td>${textCell(r.tracking_report, terms)}</td>
        <td>${depts.length ? `<span class="cell-tags">${depts.slice(0, 3).map((d) => `<span class="chip">${hl(d, terms)}</span>`).join("")}${depts.length > 3 ? `<span class="chip chip-more" title="${escapeHtml(depts.slice(3).join(", "))}">+${depts.length - 3}</span>` : ""}</span>` : `<span class="missing">ไม่ระบุ</span>`}</td>
      </tr>`;
  }

  function tableHtml(scope, rows, filters, sort, dir) {
    const terms = App.ui.termsOf(filters.q);
    const summary = `<p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(scope.length)} Program</p>`;
    if (!rows.length) {
      return `${summary}<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบ Program ที่ตรงกับตัวกรอง</p></div>`;
    }
    return `
      ${summary}
      <div class="table-wrap catalog-wrap">
        <table class="data-table catalog-table">
          <caption class="sr-only">Claim Catalog</caption>
          <thead>
            <tr>
              ${sortHeader("seq", "หมวด", sort, dir, "col-cat sticky-col")}
              <th class="col-group sticky-col">กลุ่ม</th>
              ${sortHeader("program", "Program", sort, dir, "col-program sticky-col")}
              <th>กลุ่มเป้าหมาย</th>
              <th>ผู้ Claim</th>
              <th>รายการ Claim</th>
              ${sortHeader("icd10", "ICD-10", sort, dir)}
              ${sortHeader("icd9", "ICD-9", sort, dir)}
              <th>รหัสบริการ</th>
              <th>อัตราจ่าย</th>
              <th>ระบบ Claim</th>
              <th>เงื่อนไข</th>
              <th>รายงานติดตาม</th>
              <th>หน่วยงานเจ้าภาพ</th>
            </tr>
          </thead>
          <tbody>${rows.map((r) => rowHtml(r, terms)).join("")}</tbody>
        </table>
      </div>`;
  }

  function render(section, route) {
    if (!App.data) return App.renderWhenData(section, route, render);

    const records = App.data.records;
    const filters = App.filters.parse(route.query);
    let sort = SORTS[route.query.sort] ? route.query.sort : "seq";
    let dir = route.query.dir === "desc" ? "desc" : "asc";
    let current = filters;

    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Claim Catalog</p>
            <h1 class="h2">Claim Catalog</h1>
            <p class="section-desc">รายการ Claim ทั้ง ${fmt(records.length)} Program จาก Revenue Master — คลิกชื่อ Program เพื่อดูกลุ่มเป้าหมาย เงื่อนไข และเงินที่จะได้รับ</p>
          </div>
          <div class="legend-inline">${["Complete", "Partial", "Needs Review"].map((s) => App.statusBadge(s)).join("")}</div>
        </div>
        <div class="filter-host is-static" data-filter-host></div>
        <div data-catalog></div>
      </div>`;

    const out = section.querySelector("[data-catalog]");
    const draw = (f) => {
      current = f;
      const rows = App.filters.apply(records, f).slice().sort(SORTS[sort]);
      if (dir === "desc") rows.reverse();
      out.innerHTML = tableHtml(records, rows, f, sort, dir);
    };

    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope: records, filters, fields: FIELDS, primary: 5, onChange: draw
    });

    out.addEventListener("click", (evt) => {
      const btn = evt.target instanceof Element ? evt.target.closest("[data-sort]") : null;
      if (!btn) return;
      const key = btn.dataset.sort;
      if (sort === key) dir = dir === "asc" ? "desc" : "asc";
      else {
        sort = key;
        dir = key === "icd10" || key === "icd9" ? "desc" : "asc";
      }
      const isDefault = sort === "seq" && dir === "asc";
      App.filters.setHashParams({ sort: isDefault ? "" : sort, dir: isDefault ? "" : dir });
      draw(current);
    });

    draw(filters);
    App.detail.syncFromRoute(route);
  }

  App.registerView("catalog", render);
})();
