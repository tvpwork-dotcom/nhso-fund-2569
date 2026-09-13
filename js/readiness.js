/* =========================================================
 * readiness.js — Claim Readiness (Phase 4)
 * 8 มิติ: Target · Rights · ICD · Procedure · Service Code · Authorization · Document · Claim System
 * สถานะแต่ละมิติ: พร้อม · บางส่วน · ต้องตรวจสอบ · ไม่ระบุว่าต้องใช้
 * Readiness = ความพร้อมของ "ข้อมูล" ใน Revenue Master / PDF ไม่ใช่ความพร้อมเชิงปฏิบัติของหน่วยงาน
 * สถานะรวม: Complete · Partial · Needs Review (รวมกับสถานะข้อมูลของ Record)
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[readiness.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml, fmt, pct } = App.utils;
  const READY = "ready";
  const PARTIAL = "partial";
  const REVIEW = "review";
  const NA = "na";
  const STATE_ORDER = [READY, PARTIAL, REVIEW, NA];
  const STATUS_ORDER = ["Complete", "Partial", "Needs Review"];
  const GENERIC_SYSTEM = "ระบบที่ สปสช. กำหนด";
  const STATE_META = Object.freeze({
    ready: { label: "พร้อม", icon: "bi-check-circle-fill", cls: "rd-ready" },
    partial: { label: "บางส่วน", icon: "bi-circle-half", cls: "rd-partial" },
    review: { label: "ต้องตรวจสอบ", icon: "bi-exclamation-triangle-fill", cls: "rd-review" },
    na: { label: "ไม่ระบุว่าต้องใช้", icon: "bi-dash-circle", cls: "rd-na" }
  });
  const STATUS_NOTE = Object.freeze({
    "Complete": "ทุกมิติที่เกี่ยวข้องมีข้อมูลพร้อม",
    "Partial": "มีบางมิติที่ข้อมูลยังไม่ครบ",
    "Needs Review": "ต้องตรวจสอบประกาศฉบับเต็มก่อน Claim"
  });

  const has = (v) => v != null && String(v).trim() !== "";
  const clip = (text, n) => {
    const s = String(text == null ? "" : text);
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const lower = (s) => String(s).toLowerCase();
  const hasCheck = (r, key) => App.claim.checklist(r).some((c) => c.key === key);

  /* ---------------- Rules (ข้อมูลใน Record เท่านั้น) ---------------- */
  const DIMENSIONS = [
    {
      key: "target", label: "Target Ready", th: "กลุ่มเป้าหมาย",
      evaluate: (r) => (has(r.target_population)
        ? [READY, "ระบุกลุ่มเป้าหมายใน Revenue Master"]
        : [REVIEW, "ไม่ระบุกลุ่มเป้าหมาย"])
    },
    {
      key: "rights", label: "Rights Ready", th: "สิทธิ",
      evaluate: (r) => (hasCheck(r, "rights")
        ? [READY, "ระบุสิทธิ / ผู้มีสิทธิ"]
        : [PARTIAL, "ไม่ระบุเงื่อนไขสิทธิชัดเจน — ตรวจสอบตามประกาศ"])
    },
    {
      key: "icd", label: "ICD Ready", th: "ICD-10",
      evaluate: (r) => {
        if (r.icd10.length) return [READY, `${fmt(r.icd10.length)} รหัส ICD-10 จาก PDF`];
        if (/ICD/i.test(r.icd10_text)) return [REVIEW, `Revenue Master ระบุ “${clip(r.icd10_text, 40)}” แต่ยังไม่มีรหัส`];
        return [NA, "ไม่ระบุว่าต้องใช้ ICD-10"];
      }
    },
    {
      key: "procedure", label: "Procedure Ready", th: "Procedure",
      evaluate: (r) => {
        if (r.icd9.length) return [READY, `${fmt(r.icd9.length)} รหัส ICD-9-CM จาก PDF`];
        if (/ICD-?9/i.test(r.icd9_text)) return [REVIEW, `Revenue Master ระบุ “${clip(r.icd9_text, 40)}” แต่ยังไม่มีรหัส`];
        if (/procedure|หัตถการ/i.test(r.icd9_text)) return [PARTIAL, `ระบุ “${clip(r.icd9_text, 40)}” แต่ไม่มีรายการรหัส`];
        return [NA, "ไม่ระบุว่าต้องใช้หัตถการ"];
      }
    },
    {
      key: "service", label: "Service Code Ready", th: "Service Code",
      evaluate: (r) => {
        const listed = r.service_codes.length + r.drug_codes.length;
        if (listed) return [READY, `${fmt(listed)} รายการรหัสจาก PDF`];
        if (has(r.service_code_text)) return [PARTIAL, `ระบุ “${clip(r.service_code_text, 40)}” แต่ยังไม่มีรายการรหัส`];
        return [REVIEW, "ไม่ระบุรหัสบริการ"];
      }
    },
    {
      key: "auth", label: "Authorization Ready", th: "Authorization",
      evaluate: (r) => (hasCheck(r, "auth") ? [READY, "ระบุการอนุมัติ / Authorization"] : [NA, "ไม่ระบุว่าต้องขออนุมัติ"])
    },
    {
      key: "document", label: "Document Ready", th: "เอกสาร",
      evaluate: (r) => (hasCheck(r, "document") ? [READY, "ระบุเอกสาร / ข้อมูลประกอบ"] : [NA, "ไม่ระบุเอกสารเฉพาะ"])
    },
    {
      key: "system", label: "Claim System Ready", th: "ระบบ Claim",
      evaluate: (r) => {
        const specific = r.claim_system_tags.filter((t) => t !== GENERIC_SYSTEM);
        if (specific.length) return [READY, specific.join(" · ")];
        if (has(r.claim_system)) return [PARTIAL, `“${clip(r.claim_system, 40)}” — ตรวจสอบช่องทางตามประกาศ`];
        return [REVIEW, "ไม่ระบุระบบ Claim"];
      }
    }
  ];

  const cache = new WeakMap();
  function evaluate(r) {
    if (cache.has(r)) return cache.get(r);
    const dims = DIMENSIONS.map((d) => {
      const [state, reason] = d.evaluate(r);
      return { key: d.key, label: d.label, th: d.th, state, reason };
    });
    const states = dims.map((d) => d.state);
    let status = "Complete";
    if (states.includes(REVIEW) || r.data_status === "Needs Review") status = "Needs Review";
    else if (states.includes(PARTIAL) || r.data_status === "Partial") status = "Partial";
    const result = { dims, status };
    cache.set(r, result);
    return result;
  }

  /* ---------------- UI pieces ---------------- */
  function stateIcon(dim) {
    const meta = STATE_META[dim.state];
    return `<span class="rd ${meta.cls}" title="${escapeHtml(`${dim.label}: ${meta.label} — ${dim.reason}`)}"><i class="bi ${meta.icon}" aria-hidden="true"></i><span class="sr-only">${escapeHtml(meta.label)}</span></span>`;
  }

  function legendHtml() {
    return `<ul class="rd-legend">${STATE_ORDER.map((s) =>
      `<li><i class="bi ${STATE_META[s].icon} ${STATE_META[s].cls}" aria-hidden="true"></i>${escapeHtml(STATE_META[s].label)}</li>`).join("")}</ul>`;
  }

  function summaryHtml(records) {
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
    records.forEach((r) => { counts[evaluate(r).status] += 1; });
    return `
      <div class="rd-summary">
        ${STATUS_ORDER.map((s) => `
          <a class="rd-status-card" href="#/readiness?rstatus=${encodeURIComponent(s)}">
            ${App.statusBadge(s)}
            <strong>${fmt(counts[s])}</strong>
            <p>${pct(counts[s], records.length)}% · ${escapeHtml(STATUS_NOTE[s])}</p>
          </a>`).join("")}
      </div>`;
  }

  function dimensionBarsHtml(records) {
    return `
      <div class="rd-bars">
        ${DIMENSIONS.map((d) => {
          const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0]));
          records.forEach((r) => { counts[evaluate(r).dims.find((x) => x.key === d.key).state] += 1; });
          const aria = STATE_ORDER.map((s) => `${STATE_META[s].label} ${counts[s]}`).join(", ");
          return `
            <div class="rd-bar-row">
              <span class="rd-bar-label">${escapeHtml(d.label)}</span>
              <span class="rd-bar" role="img" aria-label="${escapeHtml(`${d.label}: ${aria}`)}">
                ${STATE_ORDER.map((s) => (counts[s] ? `<span class="rd-seg ${STATE_META[s].cls}" style="flex:${counts[s]}" title="${escapeHtml(`${STATE_META[s].label} ${counts[s]}`)}"></span>` : "")).join("")}
              </span>
              <span class="rd-bar-counts">
                ${STATE_ORDER.map((s) => `<span><i class="bi ${STATE_META[s].icon} ${STATE_META[s].cls}" aria-hidden="true"></i> ${fmt(counts[s])}</span>`).join("")}
              </span>
            </div>`;
        }).join("")}
      </div>`;
  }

  function tableHtml(rows, terms) {
    return `
      <div class="table-wrap catalog-wrap">
        <table class="data-table catalog-table readiness-table">
          <caption class="sr-only">Claim Readiness</caption>
          <thead><tr>
            <th class="col-program sticky-col">Program</th>
            <th>Readiness</th>
            ${DIMENSIONS.map((d) => `<th class="rd-th" title="${escapeHtml(d.label)}">${escapeHtml(d.th)}</th>`).join("")}
          </tr></thead>
          <tbody>${rows.map((r) => {
            const ev = evaluate(r);
            const lc = lower(r.category);
            return `
              <tr class="cat-${lc}">
                <td class="col-program sticky-col">
                  <span class="group-code-sm cat-${lc}">${escapeHtml(r.group_code)}</span>
                  <button type="button" class="link-btn" data-open-detail="${escapeHtml(r.id)}">${App.ui.hl(r.program_name, terms)}</button>
                  <button type="button" class="link-btn mini rd-toggle" data-rd-toggle="${escapeHtml(r.id)}" aria-expanded="false">เหตุผล</button>
                </td>
                <td>${App.statusBadge(ev.status)}</td>
                ${ev.dims.map((d) => `<td class="rd-cell">${stateIcon(d)}</td>`).join("")}
              </tr>
              <tr class="rd-reasons" data-rd-reasons="${escapeHtml(r.id)}" hidden>
                <td colspan="${DIMENSIONS.length + 2}">
                  <ul class="rd-reason-list">
                    ${ev.dims.map((d) => `<li><i class="bi ${STATE_META[d.state].icon} ${STATE_META[d.state].cls}" aria-hidden="true"></i><span><strong>${escapeHtml(d.label)}</strong> · ${escapeHtml(STATE_META[d.state].label)} — ${escapeHtml(d.reason)}</span></li>`).join("")}
                    <li><i class="bi bi-database" aria-hidden="true"></i><span><strong>สถานะข้อมูล</strong> · ${escapeHtml(r.data_status)}</span></li>
                  </ul>
                </td>
              </tr>`;
          }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  /** มิติที่ยังไม่พร้อม (บางส่วน / ต้องตรวจสอบ) มากที่สุด — คลิกเพื่อกรอง */
  function blockersHtml(records) {
    const list = DIMENSIONS
      .map((d) => ({
        key: d.key, label: d.label,
        count: records.filter((r) => {
          const state = evaluate(r).dims.find((x) => x.key === d.key).state;
          return state === PARTIAL || state === REVIEW;
        }).length
      }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    if (!list.length) return "";
    return `
      <p class="rd-blockers">
        <span class="mini-label">มิติที่ยังไม่พร้อมมากที่สุด:</span>
        ${list.map((b) => `<a class="chip chip-link" href="#/readiness?rdim=${b.key}">${escapeHtml(b.label)}<strong>${fmt(b.count)}</strong></a>`).join("")}
      </p>`;
  }

  /* ---------------- View ---------------- */
  function render(section, route) {
    if (!App.data) return App.renderWhenData(section, route, render);

    const records = App.data.records;
    const filters = App.filters.parse(route.query, ["rstatus", "rdim"]);

    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Claim Readiness</p>
            <h1 class="h2">Claim Readiness</h1>
            <p class="section-desc">ความพร้อมของข้อมูลสำหรับ Claim แยก 8 มิติ — ประเมินจากข้อมูลใน Revenue Master และรหัส/อัตราจ่ายที่ดึงจาก PDF เท่านั้น ไม่ใช่ความพร้อมเชิงปฏิบัติของหน่วยงาน</p>
          </div>
          ${legendHtml()}
        </div>
        ${summaryHtml(records)}
        <div class="card rd-panel">
          <h2 class="h3">ความพร้อมรายมิติ (${fmt(records.length)} Program)</h2>
          ${blockersHtml(records)}
          ${dimensionBarsHtml(records)}
        </div>
        <div class="filter-host is-static" data-filter-host></div>
        <div data-readiness></div>
      </div>`;

    const out = section.querySelector("[data-readiness]");
    const draw = (f) => {
      const rows = App.filters.apply(records, f).filter((r) => {
        const ev = evaluate(r);
        if (f.rstatus && ev.status !== f.rstatus) return false;
        if (f.rdim) {
          const dim = ev.dims.find((d) => d.key === f.rdim);
          if (!dim || (dim.state !== PARTIAL && dim.state !== REVIEW)) return false;
        }
        return true;
      });
      out.innerHTML = `
        <p class="list-summary" aria-live="polite">แสดง <strong>${fmt(rows.length)}</strong> จาก ${fmt(records.length)} Program · ชี้ที่ไอคอนหรือกด “เหตุผล” เพื่อดูที่มา</p>
        ${rows.length ? tableHtml(rows, App.ui.termsOf(f.q)) : `<div class="empty-state"><i class="bi bi-funnel" aria-hidden="true"></i><p>ไม่พบ Program ที่ตรงกับตัวกรอง</p></div>`}`;
    };

    App.filters.renderBar(section.querySelector("[data-filter-host]"), {
      scope: records,
      filters,
      fields: ["q", "cat", "group", "dept"],
      extraFields: [
        {
          key: "rstatus", label: "Readiness", allLabel: "ทุกสถานะ",
          options: STATUS_ORDER.map((s) => ({ value: s, label: s, count: records.filter((r) => evaluate(r).status === s).length }))
        },
        {
          key: "rdim", label: "มิติที่ยังไม่พร้อม", allLabel: "ทุกมิติ",
          options: DIMENSIONS.map((d) => ({
            value: d.key, label: d.label,
            count: records.filter((r) => [PARTIAL, REVIEW].includes(evaluate(r).dims.find((x) => x.key === d.key).state)).length
          }))
        }
      ],
      onChange: draw
    });

    out.addEventListener("click", (evt) => {
      const btn = evt.target instanceof Element ? evt.target.closest("[data-rd-toggle]") : null;
      if (!btn) return;
      const row = out.querySelector(`[data-rd-reasons="${CSS.escape(btn.dataset.rdToggle)}"]`);
      if (!row) return;
      row.hidden = !row.hidden;
      btn.setAttribute("aria-expanded", String(!row.hidden));
      btn.textContent = row.hidden ? "เหตุผล" : "ซ่อนเหตุผล";
    });

    draw(filters);
    App.detail.syncFromRoute(route);
  }

  App.readiness = { evaluate, DIMENSIONS, STATE_META, STATUS_ORDER };
  App.registerView("readiness", render);
})();
