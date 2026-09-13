/* =========================================================
 * owners.js — Owner Matrix "หน่วยงาน" + "ใครต้อง Claim อะไร" (Phase 4)
 *   #/departments            → หน่วยงานหลัก + หน่วยงานอื่นตาม Revenue Master
 *   #/departments/<id>       → Program · รายการ Claim · เงื่อนไข · รหัสสำคัญ · ระบบ Claim · รายงานติดตาม
 *   #/who-claims?owner=&group=
 *                            → Matrix หน่วยงาน × กลุ่ม + หน่วยงาน → Program → รายการ Claim
 *                              → ข้อมูลที่ต้องเตรียม → ระบบ Claim
 * หน่วยงานมาจากคอลัมน์ "หน่วยงานเจ้าภาพ" (แยกด้วย + และ /) จัดกลุ่มตาม CONFIG.DEPARTMENTS
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[owners.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;
  const lower = (s) => String(s).toLowerCase();
  const PROPOSAL_NOTE = "หน่วยงานเจ้าภาพ · ผู้ Claim · รายงานติดตาม เป็นข้อเสนอเชิงปฏิบัติการใน Revenue Master — ต้องปรับตามโครงสร้างจริงของโรงพยาบาล";
  const MATRIX_OTHERS = 10;

  /* ---------------- Model ---------------- */
  let cache = { data: null, model: null };

  function tokensOf(r) {
    const out = [];
    r.departments.forEach((dept) => dept.split("/").forEach((part) => {
      const value = part.trim();
      if (value && !out.includes(value)) out.push(value);
    }));
    return out;
  }

  function buildModel(data) {
    const standard = (CFG.DEPARTMENTS || []).map((d) => ({
      id: d.id, name: d.name, icon: d.icon || "bi-building", standard: true,
      aliases: d.aliases || [], found: new Set(), records: []
    }));
    const aliasMap = new Map();
    standard.forEach((d) => d.aliases.forEach((alias) => aliasMap.set(lower(alias), d)));
    const others = new Map();

    data.records.forEach((r) => {
      const seen = new Set();
      tokensOf(r).forEach((token) => {
        let dept = aliasMap.get(lower(token));
        if (!dept) {
          if (!others.has(token)) {
            others.set(token, { id: token, name: token, icon: "bi-diagram-2", standard: false, aliases: [token], found: new Set(), records: [] });
          }
          dept = others.get(token);
        }
        dept.found.add(token);
        if (!seen.has(dept)) {
          seen.add(dept);
          dept.records.push(r);
        }
      });
    });

    const otherList = Array.from(others.values())
      .sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name, "th"));
    const all = standard.concat(otherList);
    return { standard, others: otherList, all, byId: new Map(all.map((d) => [d.id, d])) };
  }

  function model() {
    if (cache.data !== App.data) cache = { data: App.data, model: buildModel(App.data) };
    return cache.model;
  }

  const deptHref = (d) => `#/departments/${encodeURIComponent(d.id)}`;
  const codeTotal = (list) => list.reduce((sum, r) => sum + r.icd10.length + r.icd9.length + r.drug_codes.length, 0);
  const noteHtml = () => `<div class="notice notice-info" role="note"><i class="bi bi-info-circle" aria-hidden="true"></i><div>${escapeHtml(PROPOSAL_NOTE)}</div></div>`;
  const setCrumbs = (items) => App.setBreadcrumb([{ label: "ภาพรวม", href: "#/overview", icon: "bi-house-door" }].concat(items));
  const aliasHtml = (d) => (d.found.size ? `<p class="dept-alias">ชื่อใน Revenue Master: ${escapeHtml(Array.from(d.found).join(", "))}</p>` : "");
  const tagChips = (tags) => (tags.length ? `<span class="cell-tags">${tags.map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}</span>` : "");

  /* ---------------- Departments list ---------------- */
  function deptCard(d) {
    const n = d.records.length;
    const cats = CFG.CATEGORIES
      .map((c) => ({ code: c.code, count: d.records.filter((r) => r.category === c.code).length }))
      .filter((c) => c.count > 0);
    const systems = App.countTags(d.records, (r) => r.claim_system_tags).slice(0, 3);
    return `
      <a class="dept-card${n ? "" : " is-empty"}" href="${deptHref(d)}">
        <div class="dept-card-head">
          <span class="dept-icon" aria-hidden="true"><i class="bi ${d.icon}"></i></span>
          <h3>${escapeHtml(d.name)}</h3>
          <span class="count-badge" title="จำนวน Program">${fmt(n)}</span>
        </div>
        ${n
          ? `<div class="dept-cats">${cats.map((c) => `<span class="group-code-sm cat-${lower(c.code)}">หมวด ${c.code} · ${fmt(c.count)}</span>`).join("")}</div>
             ${systems.length ? `<p class="mini-label">${systems.map((s) => `${escapeHtml(s.value)} (${fmt(s.count)})`).join(" · ")}</p>` : ""}`
          : `<p class="missing">ไม่มี Program ใน Revenue Master</p>`}
        ${d.standard ? aliasHtml(d) : ""}
      </a>`;
  }

  function renderDepartments(section, route) {
    if (!App.data) return App.renderWhenData(section, route, renderDepartments);
    const m = model();
    const id = route.segments[0] || "";
    const dept = id ? m.byId.get(id) : null;
    if (dept) return renderDepartment(section, dept, route);

    setCrumbs([{ label: "หน่วยงาน" }]);
    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Owner Matrix</p>
            <h1 class="h2">หน่วยงาน</h1>
            <p class="section-desc">หน่วยงานเจ้าภาพของแต่ละ Program — คลิกหน่วยงานเพื่อดู Program, รายการ Claim, เงื่อนไข, รหัสสำคัญ, ระบบ Claim และรายงานติดตาม</p>
          </div>
          <a class="btn btn-outline btn-sm" href="#/who-claims"><i class="bi bi-grid-3x3" aria-hidden="true"></i> Matrix ใครต้อง Claim อะไร</a>
        </div>
        ${id ? `<div class="notice" role="note"><i class="bi bi-info-circle" aria-hidden="true"></i><div>ไม่พบหน่วยงาน “${escapeHtml(id)}”</div></div>` : ""}
        ${noteHtml()}
        <div class="block-head">
          <h2 class="h3">หน่วยงานหลัก (${fmt(m.standard.length)})</h2>
          <p>จัดกลุ่มชื่อหน่วยงานใน Revenue Master ตามหน่วยงานของโรงพยาบาล</p>
        </div>
        <div class="dept-grid">${m.standard.map(deptCard).join("")}</div>
        <div class="block-head">
          <h2 class="h3">หน่วยงานอื่นตาม Revenue Master (${fmt(m.others.length)})</h2>
          <p>ชื่อหน่วยงานที่ไม่อยู่ในกลุ่มหลัก แสดงตามชื่อเดิม</p>
        </div>
        <div class="dept-grid dept-grid-compact">${m.others.map(deptCard).join("")}</div>
      </div>`;
  }

  /* ---------------- Department detail ---------------- */
  function keyCodesHtml(r) {
    const parts = [];
    const chipList = (list, type) =>
      `${list.slice(0, 4).map((c) => App.claim.codeChip(c, type)).join("")}${list.length > 4 ? `<span class="mini-label">+${fmt(list.length - 4)}</span>` : ""}`;
    if (r.icd10.length) parts.push(`<div><span class="mini-label">ICD-10 ${fmt(r.icd10.length)}</span><div>${chipList(r.icd10, "icd10")}</div></div>`);
    if (r.icd9.length) parts.push(`<div><span class="mini-label">ICD-9-CM ${fmt(r.icd9.length)}</span><div>${chipList(r.icd9, "icd9")}</div></div>`);
    if (r.drug_codes.length) parts.push(`<div><span class="mini-label">GPUID ${fmt(r.drug_codes.length)} รายการ</span></div>`);
    if (App.ui.has(r.service_code_text)) parts.push(`<div><span class="mini-label">รหัสบริการ:</span> ${escapeHtml(App.ui.clip(r.service_code_text, 60))}</div>`);
    return parts.length ? `<div class="key-codes">${parts.join("")}</div>` : `<span class="missing">ไม่ระบุ</span>`;
  }

  function renderDepartment(section, dept, route) {
    setCrumbs([{ label: "หน่วยงาน", href: "#/departments" }, { label: dept.name }]);
    document.title = `${dept.name} · ${CFG.SYSTEM_NAME}`;
    const scope = dept.records;

    section.innerHTML = `
      <div class="group-hero dept-hero">
        <div class="container group-hero-inner">
          <a class="back-link" href="#/departments"><i class="bi bi-arrow-left" aria-hidden="true"></i> หน่วยงานทั้งหมด</a>
          <div class="group-hero-main">
            <span class="dept-icon dept-icon-lg" aria-hidden="true"><i class="bi ${dept.icon}"></i></span>
            <div>
              <p class="eyebrow">${dept.standard ? "หน่วยงานหลัก" : "หน่วยงานตาม Revenue Master"}</p>
              <h1>${escapeHtml(dept.name)}</h1>
              ${aliasHtml(dept)}
            </div>
          </div>
          <dl class="group-hero-stats">
            <div><dt>Program</dt><dd>${fmt(scope.length)}</dd></div>
            <div><dt>ระบบ Claim</dt><dd>${fmt(App.countTags(scope, (r) => r.claim_system_tags).length)}</dd></div>
            <div><dt>รหัสจาก PDF</dt><dd>${fmt(codeTotal(scope))}</dd></div>
          </dl>
        </div>
      </div>
      <div class="container section section-tight">
        ${noteHtml()}
        ${scope.length
          ? `<div class="filter-host is-static" data-filter-host></div><div data-dept-table></div>`
          : `<div class="empty-state"><i class="bi bi-inbox" aria-hidden="true"></i><p>หน่วยงานนี้ไม่มี Program ใน Revenue Master</p></div>`}
      </div>`;

    if (!scope.length) return;
    const out = section.querySelector("[data-dept-table]");
    const draw = (f) => {
      const rows = App.filters.apply(scope, f);
      const terms = App.ui.termsOf(f.q);
      const { hl, textCell } = App.ui;
      out.innerHTML = `
        <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(scope.length)} Program</p>
        ${rows.length ? `
          <div class="table-wrap catalog-wrap">
            <table class="data-table catalog-table dept-table">
              <caption class="sr-only">Program ที่ ${escapeHtml(dept.name)} รับผิดชอบ</caption>
              <thead><tr>
                <th class="col-program sticky-col">Program</th><th>รายการ Claim</th><th>เงื่อนไข</th>
                <th>รหัสสำคัญ</th><th>ระบบ Claim</th><th>รายงานติดตาม</th>
              </tr></thead>
              <tbody>${rows.map((r) => `
                <tr class="cat-${lower(r.category)}">
                  <td class="col-program sticky-col">
                    <span class="group-code-sm cat-${lower(r.category)}">${escapeHtml(r.group_code)}</span>
                    <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${hl(r.program_name, terms)}</button>
                    <div class="cell-meta">${App.statusBadge(r.data_status)}</div>
                  </td>
                  <td>${textCell(r.claim_item, terms)}</td>
                  <td>${textCell(r.conditions, terms)}</td>
                  <td>${keyCodesHtml(r)}</td>
                  <td>${r.claim_system_tags.length ? tagChips(r.claim_system_tags) : textCell(r.claim_system, terms)}</td>
                  <td>${textCell(r.tracking_report, terms)}</td>
                </tr>`).join("")}
              </tbody>
            </table>
          </div>`
          : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบ Program ที่ตรงกับตัวกรอง</p></div>`}`;
    };
    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope, filters: App.filters.parse(route.query), fields: ["q", "cat", "sys", "status"], onChange: draw
    });
    draw(App.filters.parse(route.query));
    App.detail.syncFromRoute(route);
  }

  /* ---------------- Who claims what ---------------- */
  function matrixHtml(rows, groups, active) {
    const countIn = (d, code) => d.records.filter((r) => r.group_code === code).length;
    const max = Math.max(1, ...rows.map((d) => Math.max(0, ...groups.map((g) => countIn(d, g.code)))));
    return `
      <div class="table-wrap matrix-wrap">
        <table class="data-table matrix-table">
          <caption class="sr-only">จำนวน Program ต่อหน่วยงานและกลุ่ม</caption>
          <thead><tr>
            <th scope="col">หน่วยงาน</th><th scope="col">รวม</th>
            ${groups.map((g) => `<th scope="col" title="${escapeHtml(g.name)}">${escapeHtml(g.code)}</th>`).join("")}
          </tr></thead>
          <tbody>${rows.map((d) => `
            <tr>
              <th scope="row"><a href="${deptHref(d)}">${escapeHtml(d.name)}</a>${d.standard ? "" : ` <span class="mini-label">(ชื่อเดิม)</span>`}</th>
              <td><strong>${fmt(d.records.length)}</strong></td>
              ${groups.map((g) => {
                const n = countIn(d, g.code);
                if (!n) return `<td><span class="matrix-empty" aria-hidden="true">·</span></td>`;
                const ratio = n / max;
                const isActive = active.owner === d.id && active.group === g.code;
                return `<td><button type="button" class="matrix-cell${ratio > 0.58 ? " is-strong" : ""}${isActive ? " is-active" : ""}" style="--a:${(0.1 + 0.6 * ratio).toFixed(2)}" data-owner="${escapeHtml(d.id)}" data-group="${escapeHtml(g.code)}" aria-label="${escapeHtml(d.name)} กลุ่ม ${escapeHtml(g.code)}: ${n} Program">${n}</button></td>`;
              }).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function prepHtml(r) {
    const labels = App.claim.checklist(r).map((c) => c.label);
    const codes = [
      r.icd10.length && `ICD-10 ${fmt(r.icd10.length)} รหัส`,
      r.icd9.length && `ICD-9-CM ${fmt(r.icd9.length)} รหัส`,
      r.drug_codes.length && `GPUID ${fmt(r.drug_codes.length)} รายการ`
    ].filter(Boolean);
    if (!labels.length && !codes.length) return `<span class="missing">ไม่ระบุ</span>`;
    return `<span class="prep-chips">${labels.map((l) => `<span class="chip">${escapeHtml(l)}</span>`).join("")}${codes.map((c) => `<span class="chip chip-code">${escapeHtml(c)}</span>`).join("")}</span>`;
  }

  function renderWho(section, route) {
    if (!App.data) return App.renderWhenData(section, route, renderWho);
    const m = model();
    const withPrograms = m.all.filter((d) => d.records.length);
    const matrixRows = m.standard.filter((d) => d.records.length).concat(m.others.slice(0, MATRIX_OTHERS));
    const groups = App.getGroups().filter((g) => g.announcements > 0);
    const filters = App.filters.parse(route.query, ["owner"]);

    setCrumbs([{ label: "ใครต้อง Claim อะไร" }]);
    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Who Claims What</p>
            <h1 class="h2">ใครต้อง Claim อะไร</h1>
            <p class="section-desc">หน่วยงาน → Program → รายการ Claim → ข้อมูลที่ต้องเตรียม → ระบบ Claim · ข้อมูลที่ต้องเตรียมสรุปจาก Checklist ของแต่ละ Program</p>
          </div>
          <a class="btn btn-outline btn-sm" href="#/departments"><i class="bi bi-building" aria-hidden="true"></i> การ์ดหน่วยงาน</a>
        </div>
        ${noteHtml()}
        <div class="card card-pad matrix-card">
          <div class="block-head">
            <h2 class="h3">Matrix หน่วยงาน × กลุ่ม</h2>
            <p>ตัวเลข = จำนวน Program · สีเข้ม = มาก · คลิกช่องเพื่อดูรายการด้านล่าง · แสดงหน่วยงานหลักและหน่วยงานอื่น ${MATRIX_OTHERS} อันดับแรก</p>
          </div>
          ${matrixHtml(matrixRows, groups, filters)}
        </div>
        <div class="filter-host is-static" data-filter-host></div>
        <div data-who></div>
      </div>`;

    const out = section.querySelector("[data-who]");
    const draw = (f) => {
      const selected = f.owner ? [m.byId.get(f.owner)].filter(Boolean) : withPrograms;
      const blocks = selected
        .map((dept) => ({ dept, rows: App.filters.apply(dept.records, f) }))
        .filter((b) => b.rows.length);
      const total = blocks.reduce((sum, b) => sum + b.rows.length, 0);
      const terms = App.ui.termsOf(f.q);
      out.innerHTML = `
        <p class="list-summary" aria-live="polite"><strong>${fmt(blocks.length)}</strong> หน่วยงาน · <strong>${fmt(total)}</strong> รายการ (1 Program อาจอยู่หลายหน่วยงาน)</p>
        ${blocks.length ? `
          <div class="table-wrap catalog-wrap">
            <table class="data-table catalog-table who-table">
              <caption class="sr-only">ใครต้อง Claim อะไร</caption>
              <thead><tr><th>หน่วยงาน / Program</th><th>รายการ Claim</th><th>ข้อมูลที่ต้องเตรียม</th><th>ระบบ Claim</th></tr></thead>
              ${blocks.map((b) => `
                <tbody>
                  <tr class="who-dept-row"><td colspan="4"><a href="${deptHref(b.dept)}"><i class="bi ${b.dept.icon}" aria-hidden="true"></i> ${escapeHtml(b.dept.name)}</a> <span class="count-badge">${fmt(b.rows.length)}</span></td></tr>
                  ${b.rows.map((r) => `
                    <tr class="cat-${lower(r.category)}">
                      <td>
                        <span class="group-code-sm cat-${lower(r.category)}">${escapeHtml(r.group_code)}</span>
                        <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${App.ui.hl(r.program_name, terms)}</button>
                        <div class="cell-meta">${App.statusBadge(r.data_status)}</div>
                      </td>
                      <td>${App.ui.textCell(r.claim_item, terms)}</td>
                      <td>${prepHtml(r)}</td>
                      <td>${r.claim_system_tags.length ? tagChips(r.claim_system_tags) : App.ui.textCell(r.claim_system, terms)}</td>
                    </tr>`).join("")}
                </tbody>`).join("")}
            </table>
          </div>`
          : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบรายการที่ตรงกับตัวกรอง</p></div>`}`;
    };

    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope: App.data.records,
      filters,
      fields: ["q", "cat", "group", "sys"],
      extraFields: [{
        key: "owner", label: "หน่วยงาน", allLabel: "ทุกหน่วยงาน",
        options: withPrograms.map((d) => ({ value: d.id, label: d.standard ? d.name : `${d.name} (ชื่อเดิม)`, count: d.records.length }))
      }],
      onChange: draw
    });

    section.querySelector(".matrix-card").addEventListener("click", (evt) => {
      const cell = evt.target instanceof Element ? evt.target.closest("[data-owner]") : null;
      if (!cell) return;
      const params = new URLSearchParams({ owner: cell.dataset.owner, group: cell.dataset.group });
      location.hash = `#/who-claims?${params.toString()}`;
    });

    draw(filters);
    if (filters.owner || filters.group) {
      requestAnimationFrame(() => out.scrollIntoView({ block: "start" }));
    }
    App.detail.syncFromRoute(route);
  }

  App.owners = { model, href: deptHref, tokensOf };
  App.registerView("departments", renderDepartments);
  App.registerView("who-claims", renderWho);
})();
