/* =========================================================
 * claim-system.js — Claim System Explorer "ระบบ Claim" (Phase 3)
 * แสดง: Claim System · Program · จำนวนรายการ · ข้อมูลที่ต้องส่ง · หน่วยงานเจ้าภาพ
 * Flow: HIS → ตรวจข้อมูล → Claim System → REP → STM → Revenue Database
 * "ข้อมูลที่ต้องส่ง" สรุปจาก Checklist ของแต่ละ Program (App.claim.checklist)
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[claim-system.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml, fmt } = App.utils;
  const NONE = "ไม่ระบุระบบ Claim";
  const NEEDS = [
    ["diagnosis", "ICD-10"],
    ["procedure", "ICD-9-CM"],
    ["service", "Service Code"],
    ["drug", "รหัสยา / GPUID"],
    ["auth", "Authorization"],
    ["verify", "ยืนยันตัวตน"],
    ["document", "เอกสาร"]
  ];

  function groupBySystem(records) {
    const map = new Map();
    records.forEach((r) => {
      (r.claim_system_tags.length ? r.claim_system_tags : [NONE]).forEach((tag) => {
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag).push(r);
      });
    });
    return Array.from(map, ([name, list]) => ({ name, records: list }))
      .sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name, "th"));
  }

  function needsOf(list) {
    return NEEDS
      .map(([key, label]) => ({ label, count: list.filter((r) => App.claim.checklist(r).some((c) => c.key === key)).length }))
      .filter((n) => n.count > 0);
  }

  function trackingOf(list) {
    const counts = new Map();
    list.forEach((r) => {
      new Set(String(r.tracking_report || "").split(/[/+,]/).map((s) => s.trim()).filter(Boolean))
        .forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return Array.from(counts, ([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  const codeCount = (list) => list.reduce((sum, r) => sum + r.icd10.length + r.icd9.length + r.drug_codes.length, 0);
  const chips = (items) => (items.length
    ? `<span class="chips">${items.map((i) => `<span class="chip">${escapeHtml(i.label)} <strong>${fmt(i.count)}</strong></span>`).join("")}</span>`
    : `<span class="missing">ไม่ระบุ</span>`);
  const deptsOf = (list, n) => App.countTags(list, (r) => r.departments).slice(0, n).map((d) => ({ label: d.value, count: d.count }));

  function cardHtml(system, index) {
    const list = system.records;
    return `
      <article class="system-card" id="sys-${index}">
        <header>
          <i class="bi bi-hdd-network" aria-hidden="true"></i>
          <h3>${escapeHtml(system.name)}</h3>
          <span class="count-badge">${fmt(list.length)}</span>
        </header>
        <div class="system-meta">
          <div><p class="mini-label">ข้อมูลที่ต้องส่ง (จำนวน Program)</p>${chips(needsOf(list))}</div>
          <div><p class="mini-label">รายงานติดตาม</p>${chips(trackingOf(list))}</div>
          <div><p class="mini-label">หน่วยงานเจ้าภาพ</p>${chips(deptsOf(list, 6))}</div>
        </div>
        <details>
          <summary>Program ทั้งหมด (${fmt(list.length)})</summary>
          <ul class="system-programs">
            ${list.map((r) => `
              <li class="cat-${r.category.toLowerCase()}">
                <span class="group-code-sm cat-${r.category.toLowerCase()}">${escapeHtml(r.group_code)}</span>
                <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${escapeHtml(r.program_name)}</button>
                ${App.statusBadge(r.data_status)}
              </li>`).join("")}
          </ul>
        </details>
      </article>`;
  }

  function render(section, route) {
    if (!App.data) return App.renderWhenData(section, route, render);

    const systems = groupBySystem(App.data.records);
    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Claim System Explorer</p>
            <h1 class="h2">ระบบ Claim</h1>
            <p class="section-desc">e-Claim · NAP · NHSO Health Platform · ระบบเฉพาะ · ช่องทางตามประกาศ — 1 Program อาจส่งข้อมูลมากกว่า 1 ระบบ · จัดกลุ่มจากคอลัมน์ "ระบบ Claim" ใน Revenue Master</p>
          </div>
        </div>

        <div class="card flow-card-lg">
          <h2 class="h3">เส้นทางข้อมูล Claim</h2>
          ${App.claim.flowHtml(null)}
        </div>

        <div class="table-wrap">
          <table class="data-table system-table">
            <caption class="sr-only">สรุประบบ Claim</caption>
            <thead><tr><th>Claim System</th><th>Program</th><th class="num">จำนวนรายการ</th><th>ข้อมูลที่ต้องส่ง</th><th>หน่วยงานเจ้าภาพ</th></tr></thead>
            <tbody>${systems.map((s, i) => `
              <tr>
                <td><button type="button" class="link-btn" data-scroll-system="sys-${i}">${escapeHtml(s.name)}</button></td>
                <td>${s.records.slice(0, 4).map((r) => `<button type="button" class="link-btn mini" data-open-detail="${escapeHtml(r.id)}">${escapeHtml(r.program_name)}</button>`).join(", ")}${s.records.length > 4 ? ` <span class="mini-label">+${fmt(s.records.length - 4)}</span>` : ""}</td>
                <td class="num">${fmt(s.records.length)} Program<br><span class="mini-label">${fmt(codeCount(s.records))} รหัส</span></td>
                <td>${chips(needsOf(s.records))}</td>
                <td>${chips(deptsOf(s.records, 4))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>

        <div class="system-grid">${systems.map(cardHtml).join("")}</div>
      </div>`;

    section.addEventListener("click", (evt) => {
      const btn = evt.target instanceof Element ? evt.target.closest("[data-scroll-system]") : null;
      if (!btn) return;
      const card = section.querySelector(`#${btn.dataset.scrollSystem}`);
      if (card) {
        const details = card.querySelector("details");
        if (details) details.open = true;
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    App.detail.syncFromRoute(route);
  }

  App.registerView("claim-system", render);
})();
