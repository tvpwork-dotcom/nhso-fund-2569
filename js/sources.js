/* =========================================================
 * sources.js — แหล่งอ้างอิง (Phase 4)
 * ตาราง: ชื่อประกาศ · ปี · หมวด · กลุ่ม · หน้า · คุณภาพข้อความ PDF · สถานะข้อมูล · หมายเหตุ
 * + แหล่งข้อมูล (Excel / PDF) · หมายเหตุการดึงข้อมูล · Disclaimer
 * ปี (พ.ศ.) อ่านจากชื่อประกาศใน Revenue Master
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[sources.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;
  const YEAR = /พ\.?\s*ศ\.?\s*(\d{4})/;
  const READ_META = Object.freeze({
    "อ่านได้": "pill-ok",
    "ภาษาไทยอ่านไม่ได้": "pill-soon",
    "เป็นภาพ": "pill-error",
    "ไม่ระบุ": ""
  });

  const yearOf = (r) => {
    const m = String(r.announcement_title || "").match(YEAR);
    return m ? m[1] : "";
  };

  function readabilityOf(r) {
    const ex = r.extraction || {};
    if (!ex.pages_total) return "ไม่ระบุ";
    if (ex.image > ex.pages_total / 2) return "เป็นภาพ";
    if (ex.garbled_thai > (ex.clean_thai || 0) + (ex.english_table || 0)) return "ภาษาไทยอ่านไม่ได้";
    return "อ่านได้";
  }

  function docsHtml(meta) {
    const classes = meta.pdf_page_classes || {};
    return `
      <div class="source-docs">
        ${(meta.sources || []).map((s) => {
          const isPdf = /\.pdf$/i.test(s.file);
          return `
            <article class="card source-doc">
              <h3><i class="bi ${isPdf ? "bi-file-earmark-pdf" : "bi-file-earmark-spreadsheet"}" aria-hidden="true"></i> ${escapeHtml(s.file)}</h3>
              ${s.sheet ? `<p>ชีต ${escapeHtml(s.sheet)} · ${fmt(meta.record_count || 0)} Record</p>` : ""}
              ${isPdf ? `<p>${fmt(s.pages || 0)} หน้า · อ่านได้ ${fmt(classes.clean_thai || 0)} · ตาราง/อังกฤษ ${fmt(classes.english_table || 0)} · ภาษาไทยอ่านไม่ได้ ${fmt(classes.garbled_thai || 0)} · เป็นภาพ ${fmt(classes.image || 0)}</p>` : ""}
              ${s.note ? `<p class="mini-label">${escapeHtml(s.note)}</p>` : ""}
            </article>`;
        }).join("")}
      </div>`;
  }

  function notesHtml(meta) {
    const rules = meta.status_rules || {};
    return `
      <div class="card source-notes">
        <h2 class="h3">หมายเหตุการดึงข้อมูล</h2>
        <ul>
          ${meta.extraction_note ? `<li><i class="bi bi-file-text" aria-hidden="true"></i><span>${escapeHtml(meta.extraction_note)}</span></li>` : ""}
          ${meta.pair_note ? `<li><i class="bi bi-arrow-left-right" aria-hidden="true"></i><span>${escapeHtml(meta.pair_note)}</span></li>` : ""}
          ${Object.keys(rules).map((k) => `<li>${App.statusBadge(k)}<span>${escapeHtml(rules[k])}</span></li>`).join("")}
          <li><i class="bi bi-clock-history" aria-hidden="true"></i><span>สร้างข้อมูลเมื่อ ${escapeHtml(meta.generated_at || "—")} · Dashboard ${escapeHtml(CFG.VERSION)}</span></li>
        </ul>
      </div>`;
  }

  function tableHtml(rows, terms) {
    const { hl, textCell, pageRange } = App.ui;
    return `
      <div class="table-wrap catalog-wrap">
        <table class="data-table catalog-table sources-table">
          <caption class="sr-only">แหล่งอ้างอิงประกาศ</caption>
          <thead><tr>
            <th class="num">#</th><th class="col-title">ชื่อประกาศ</th><th>ปี</th><th>หมวด</th><th>กลุ่ม</th>
            <th>หน้า</th><th>คุณภาพข้อความ PDF</th><th>สถานะข้อมูล</th><th class="col-note">หมายเหตุ</th>
          </tr></thead>
          <tbody>${rows.map((r) => {
            const year = yearOf(r);
            const read = readabilityOf(r);
            return `
              <tr class="cat-${r.category.toLowerCase()}">
                <td class="num">${escapeHtml(r.seq)}</td>
                <td class="col-title">
                  <div>${hl(r.announcement_title, terms)}</div>
                  <button type="button" class="link-btn mini" data-open-detail="${escapeHtml(r.id)}"><i class="bi bi-layout-sidebar-reverse" aria-hidden="true"></i> ${escapeHtml(r.program_name)}</button>
                </td>
                <td class="nowrap">${year ? `พ.ศ. ${escapeHtml(year)}` : `<span class="missing">ไม่ระบุ</span>`}</td>
                <td><span class="nav-letter">${escapeHtml(r.category)}</span></td>
                <td><span class="group-code">${escapeHtml(r.group_code)}</span></td>
                <td class="nowrap">${escapeHtml(pageRange(r))}</td>
                <td><span class="pill ${READ_META[read] || ""}">${escapeHtml(read)}</span></td>
                <td>${App.statusBadge(r.data_status)}</td>
                <td class="col-note">${textCell(r.source_note, terms)}</td>
              </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function render(section, route) {
    if (!App.data) return App.renderWhenData(section, route, render);

    const records = App.data.records.slice().sort((a, b) => (a.source_page || 0) - (b.source_page || 0) || a.seq - b.seq);
    const meta = App.data.meta || {};
    const filters = App.filters.parse(route.query, ["year", "read"]);
    const years = App.countTags(records, (r) => [yearOf(r) || "ไม่ระบุ"]).sort((a, b) => String(a.value).localeCompare(String(b.value)));
    const reads = App.countTags(records, (r) => [readabilityOf(r)]);

    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Source Reference</p>
            <h1 class="h2">แหล่งอ้างอิง</h1>
            <p class="section-desc">ประกาศ ${fmt(CFG.FUND_SUMMARY.announcements)} ฉบับจากเอกสารรวม ${fmt(CFG.SOURCE.PAGES)} หน้า · ${escapeHtml(CFG.SOURCE.DOCUMENT)} · Updated ${escapeHtml(CFG.SOURCE.UPDATED)}</p>
          </div>
        </div>

        <div class="disclaimer-card" role="note">
          <i class="bi bi-shield-exclamation" aria-hidden="true"></i>
          <div>
            <strong>Disclaimer</strong>
            <p>Dashboard นี้เป็นเครื่องมือช่วยศึกษาและบริหารจัดการ<br>ไม่ใช้แทนประกาศและหลักเกณฑ์ฉบับทางการ<br>โปรดตรวจสอบประกาศฉบับล่าสุดก่อนดำเนินการ Claim</p>
          </div>
        </div>

        ${docsHtml(meta)}
        ${notesHtml(meta)}

        <div class="block-head"><h2 class="h3">รายชื่อประกาศ</h2><p>เรียงตามหน้าในเอกสารรวม · คลิกชื่อ Program เพื่อดูรายละเอียด</p></div>
        <div class="filter-host is-static" data-filter-host></div>
        <div data-sources></div>
      </div>`;

    const out = section.querySelector("[data-sources]");
    const draw = (f) => {
      const rows = App.filters.apply(records, f).filter((r) =>
        (!f.year || (yearOf(r) || "ไม่ระบุ") === f.year) &&
        (!f.read || readabilityOf(r) === f.read));
      out.innerHTML = `
        <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(records.length)} ประกาศ</p>
        ${rows.length ? tableHtml(rows, App.ui.termsOf(f.q)) : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบประกาศที่ตรงกับตัวกรอง</p></div>`}`;
    };

    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope: records,
      filters,
      fields: ["q", "cat", "group", "status"],
      extraFields: [
        { key: "year", label: "ปี พ.ศ.", allLabel: "ทุกปี", options: years.map((y) => ({ value: y.value, label: y.value, count: y.count })) },
        { key: "read", label: "คุณภาพข้อความ PDF", allLabel: "ทั้งหมด", options: reads.map((x) => ({ value: x.value, label: x.value, count: x.count })) }
      ],
      onChange: draw
    });

    draw(filters);
    App.detail.syncFromRoute(route);
  }

  App.registerView("sources", render);
})();
