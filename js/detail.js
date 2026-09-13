/* =========================================================
 * detail.js — รายละเอียด Program + Detail Drawer (Phase 3)
 * ลำดับข้อมูล 1–13:
 *   กลุ่มเป้าหมาย → เงื่อนไข Claim (Checklist) → เงินที่จะได้รับ → ระบบ Claim (Flow)
 *   → ICD-10 → ICD-9-CM (+ Diagnosis–Procedure Pair) → Service Code → Drug → Instrument → Lab
 *   → หน่วยงานเจ้าภาพ → รายงานติดตาม → Source
 * - Checklist / Unit / Ceiling / Formula สร้างจากข้อความใน Revenue Master และ PDF เท่านั้น
 * - ใช้ร่วมกัน: หน้า Program (drilldown.js) และ Drawer (Catalog / ICD / อัตราจ่าย / ระบบ Claim)
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[detail.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;
  const MISSING = "ไม่ระบุใน Revenue Master";
  const CHECK_FULL = "โปรดตรวจสอบประกาศฉบับเต็ม";
  const RATE_CHECK = "ตรวจสอบอัตราจ่ายตามประกาศฉบับเต็ม";

  /* ---------------- Shared UI helpers ---------------- */
  const has = (v) => v != null && String(v).trim() !== "";
  const lower = (s) => String(s).toLowerCase();
  const clip = (text, n) => {
    const s = String(text == null ? "" : text);
    return s.length > n ? `${s.slice(0, n)}…` : s;
  };
  const missing = (text) => `<span class="missing">${escapeHtml(text || MISSING)}</span>`;
  const valueOrMissing = (v) => (has(v) ? escapeHtml(v) : missing());
  const termsOf = (q) => (q ? App.utils.normalizeText(q).split(/\s+/).filter(Boolean) : []);
  const hl = (text, terms) => (App.search && terms && terms.length ? App.search.highlight(text, terms) : escapeHtml(text));
  const textCell = (value, terms) => (has(value)
    ? `<div class="clamp" title="${escapeHtml(value)}">${hl(value, terms)}</div>`
    : `<span class="missing" title="${MISSING}">ไม่ระบุ</span>`);

  function pageRange(r) {
    if (!r.source_page) return "—";
    return r.source_page_end && r.source_page_end !== r.source_page
      ? `${r.source_page}–${r.source_page_end}`
      : String(r.source_page);
  }

  function renderWhenData(section, route, renderer) {
    section.innerHTML = `<div class="container section"><div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> กำลังโหลด Revenue Master…</div></div>`;
    App.whenData()
      .then(() => { if (App.getRoute() === route) renderer(section, route); })
      .catch((err) => { if (App.getRoute() === route) section.innerHTML = `<div class="container section">${App.loadErrorHtml(err)}</div>`; });
  }

  /* =========================================================
   * Claim rules — สร้างจากข้อความของ Program เท่านั้น (ไม่ใช่เงื่อนไขใหม่)
   * แต่ละข้อจะแสดงหลักฐานว่ามาจากคอลัมน์ใด
   * ========================================================= */
  const FIELD_LABELS = Object.freeze({
    target_population: "กลุ่มเป้าหมาย",
    conditions: "เงื่อนไข",
    claim_system: "ระบบ Claim",
    claim_owner: "ผู้ Claim",
    claim_item: "รายการ Claim",
    icd10_text: "ICD-10",
    icd9_text: "ICD-9",
    service_code_text: "รหัสบริการ",
    payment_rate: "อัตราจ่าย",
    tracking_report: "รายงานติดตาม",
    source_note: "หมายเหตุ"
  });

  const CHECK_RULES = [
    { key: "rights", label: "สิทธิถูกต้อง", sources: [["target_population", /สิทธิ|\bUC\b/i], ["conditions", /สิทธิ/]] },
    { key: "target", label: "กลุ่มเป้าหมายตรง", sources: [["target_population", /\S/]] },
    { key: "verify", label: "ยืนยันตัวตน / ปิดสิทธิ", sources: [["claim_system", /Face Verification|ยืนยันตัวตน/i], ["conditions", /ปิดสิทธิ|ยืนยันตัวตน|Face Verification/i]] },
    { key: "diagnosis", label: "Diagnosis ถูกต้อง · ICD-10 ครบ", codes: "icd10", sources: [["icd10_text", /ICD-?10|diagnosis/i]] },
    { key: "procedure", label: "Procedure ถูกต้อง · ICD-9-CM ครบ", codes: "icd9", sources: [["icd9_text", /ICD-?9|procedure|หัตถการ/i]] },
    { key: "pair", label: "Diagnosis–Procedure ตรงคู่", sources: [["conditions", /match|diagnosis.?procedure/i], ["source_note", /mapping|ICD10\s*↔\s*ICD9/i]] },
    { key: "service", label: "Service Code ครบ", sources: [["service_code_text", /\S/]] },
    { key: "drug", label: "รหัสยา / GPUID ถูกต้อง", codes: "drug_codes", sources: [["service_code_text", /drug|GPUID/i]] },
    { key: "auth", label: "Authorization ครบ", sources: [["conditions", /อนุมัติ|PAK|approval|authori[sz]|pre-?auth/i], ["claim_system", /PAK/i], ["target_population", /อนุมัติ|PAK/i]] },
    { key: "document", label: "เอกสาร / ข้อมูลประกอบครบ", sources: [["conditions", /เอกสาร|เวชระเบียน|coding|care plan|ADL|\bBI\b|consent|ทะเบียน|registry/i], ["service_code_text", /16 แฟ้ม|claim set/i]] },
    { key: "clinical", label: "เป็นไปตามแนวทาง / ข้อบ่งชี้", sources: [["conditions", /ข้อบ่งชี้|guideline|แนวทาง|pathway|clinical/i], ["payment_rate", /regimen/i]] },
    { key: "frequency", label: "ความถี่ / จำนวนครั้งตามเกณฑ์", sources: [["conditions", /ครั้ง|frequency/i]] },
    { key: "provider", label: "Provider ผ่านเกณฑ์", sources: [["claim_owner", /ขึ้นทะเบียน|ผ่านเกณฑ์|ศักยภาพ|ได้รับอนุญาต|ศูนย์/], ["conditions", /ศักยภาพ|ขึ้นทะเบียน/]] },
    { key: "timely", label: "Claim ภายในระยะเวลา", sources: [["conditions", /ทันเวลา|ภายใน|time window|ระยะเวลา|เวลา/i], ["source_note", /เวลา/]] }
  ];

  const checklistCache = new WeakMap();
  function checklist(r) {
    if (checklistCache.has(r)) return checklistCache.get(r);
    const items = CHECK_RULES.map((rule) => {
      const evidence = [];
      if (rule.codes && r[rule.codes] && r[rule.codes].length) {
        evidence.push({ label: "PDF", text: `${fmt(r[rule.codes].length)} รหัสที่ดึงได้พร้อมเลขหน้า` });
      }
      (rule.sources || []).forEach(([field, pattern]) => {
        const text = r[field];
        if (has(text) && pattern.test(text)) evidence.push({ label: FIELD_LABELS[field] || field, text });
      });
      return evidence.length ? { key: rule.key, label: rule.label, evidence } : null;
    }).filter(Boolean);
    checklistCache.set(r, items);
    return items;
  }

  function paymentFacts(r) {
    const text = `${r.payment_rate} ${r.announcement_title}`;
    const drg = text.match(/DRGs?\s*(?:Version|v\.?)\s*(\d+)/i);
    const units = new Map();
    const ceilings = [];
    r.rate_mentions.forEach((m) => {
      const unit = m.text.match(/บาท\s*(ต่?อ\s*[^\s,.;()]{1,24})/);
      if (unit) {
        const value = unit[1].replace(/\s+/g, "");
        if (!units.has(value)) units.set(value, m.page);
      }
      /* เพดานเงิน = "ไม่เกิน <จำนวน> บาท" (ไม่นับ "ไม่เกิน 1 ครั้ง" ซึ่งเป็นความถี่) */
      if (/ไม่?เกิน\s*[\d,.]+\s*บาท/.test(m.text)) ceilings.push(m);
    });
    const tags = r.payment_method_tags;
    let formula = "";
    if (tags.includes("DRG")) formula = /AdjRW/i.test(text) ? "DRG · AdjRW" : "DRG";
    else if (tags.includes("Formula")) formula = r.payment_rate;
    return {
      tags,
      rate: r.payment_rate,
      units: Array.from(units, ([unit, page]) => ({ unit, page })),
      ceilings,
      formula,
      drgVersion: drg ? `Version ${drg[1]}` : "",
      point: /\bpoint\b|คะแนน/i.test(`${r.payment_rate} ${r.conditions}`) ? r.payment_rate : "",
      globalBudget: tags.includes("Global Budget"),
      feeSchedule: tags.includes("Fee Schedule"),
      hasNumbers: r.rate_mentions.length > 0
    };
  }

  function pairGroups(r) {
    const groups = new Map();
    const add = (type, c) => (c.pairs || []).forEach((key) => {
      if (!groups.has(key)) groups.set(key, { key, icd10: [], icd9: [], info: (r.pair_groups || {})[key] || {} });
      groups.get(key)[type].push(c);
    });
    r.icd10.forEach((c) => add("icd10", c));
    r.icd9.forEach((c) => add("icd9", c));
    return Array.from(groups.values()).filter((g) => g.icd10.length && g.icd9.length);
  }

  function pairLabel(group) {
    const info = group.info || {};
    return info.row
      ? `ตารางที่ ${info.table} แถว ${info.row}${info.page ? ` · หน้า ${info.page}` : ""}`
      : group.key;
  }

  function flowHtml(r) {
    const tracking = r ? r.tracking_report || "" : "";
    const steps = r
      ? [
          { icon: "bi-pc-display", label: "HIS", sub: "บันทึกบริการ / เวชระเบียน", on: true },
          { icon: "bi-clipboard-check", label: "ตรวจข้อมูล", sub: `Checklist ${fmt(checklist(r).length)} รายการ`, on: true },
          { icon: "bi-send", label: "Claim System", sub: r.claim_system_tags.length ? r.claim_system_tags.join(" · ") : (r.claim_system || MISSING), on: has(r.claim_system) },
          { icon: "bi-file-earmark-check", label: "REP", sub: /REP/i.test(tracking) ? "ระบุในรายงานติดตาม" : "ไม่ระบุในรายงานติดตาม", on: /REP/i.test(tracking) },
          { icon: "bi-receipt", label: "STM", sub: /STM/i.test(tracking) ? "ระบุในรายงานติดตาม" : "ไม่ระบุในรายงานติดตาม", on: /STM/i.test(tracking) },
          { icon: "bi-database-check", label: "Revenue Database", sub: "ติดตามรายได้ที่พึงได้รับ", on: true }
        ]
      : [
          { icon: "bi-pc-display", label: "HIS", sub: "บันทึกบริการ / เวชระเบียน", on: true },
          { icon: "bi-clipboard-check", label: "ตรวจข้อมูล", sub: "Checklist ก่อน Claim", on: true },
          { icon: "bi-send", label: "Claim System", sub: "e-Claim · NAP · ระบบเฉพาะ", on: true },
          { icon: "bi-file-earmark-check", label: "REP", sub: "ผลการตรวจสอบ Claim", on: true },
          { icon: "bi-receipt", label: "STM", sub: "Statement การจ่ายเงิน", on: true },
          { icon: "bi-database-check", label: "Revenue Database", sub: "ติดตามรายได้ที่พึงได้รับ", on: true }
        ];
    return `
      <ol class="claim-flow" aria-label="เส้นทางข้อมูล Claim">
        ${steps.map((s) => `
          <li class="${s.on ? "is-on" : "is-off"}">
            <i class="bi ${s.icon}" aria-hidden="true"></i>
            <strong>${escapeHtml(s.label)}</strong>
            <span>${escapeHtml(s.sub)}</span>
          </li>`).join("")}
      </ol>`;
  }

  /* ---------------- Section renderers ---------------- */
  function detailSection(no, title, bodyHtml, badge, open) {
    return `
      <details class="detail"${open ? " open" : ""}>
        <summary>
          <span class="detail-no">${no}</span>
          <span class="detail-title">${escapeHtml(title)}</span>
          ${badge != null ? `<span class="detail-badge">${escapeHtml(String(badge))}</span>` : ""}
          <i class="bi bi-chevron-down detail-chevron" aria-hidden="true"></i>
        </summary>
        <div class="detail-body">${bodyHtml}</div>
      </details>`;
  }

  function answerCard(no, icon, title, question, bodyHtml, extraHtml, isMoney) {
    return `
      <article class="answer-card${isMoney ? " is-money" : ""}">
        <header class="answer-head">
          <span class="answer-no">${no}</span>
          <div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(question)}</p></div>
          <i class="bi ${icon} answer-icon" aria-hidden="true"></i>
        </header>
        <div class="answer-body">${bodyHtml}</div>
        ${extraHtml || ""}
      </article>`;
  }

  function subRows(rows) {
    return `<dl class="answer-sub">${rows.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${valueOrMissing(value)}</dd></div>`).join("")}</dl>`;
  }

  const answerText = (v) => (has(v) ? `<p class="answer-text">${escapeHtml(v)}</p>` : `<p class="missing">${MISSING}</p>`);

  function checklistHtml(items) {
    if (!items.length) return `<p class="missing">${MISSING}</p>`;
    return `
      <ul class="checklist">
        ${items.map((item) => `
          <li>
            <i class="bi bi-check2-square" aria-hidden="true"></i>
            <div>
              <strong>${escapeHtml(item.label)}</strong>
              <span class="evidence">${item.evidence.slice(0, 2).map((e) =>
                `<span><em>${escapeHtml(e.label)}:</em> ${escapeHtml(clip(e.text, 90))}</span>`).join("")}</span>
            </div>
          </li>`).join("")}
      </ul>`;
  }

  function rateMentionsHtml(r) {
    const list = r.rate_mentions;
    if (!list.length) return "";
    const item = (m) => `<li><span>${escapeHtml(m.text)}</span><span class="page-ref">หน้า ${escapeHtml(m.page)}</span></li>`;
    return `
      <div class="rate-mentions">
        <p class="mini-label">ข้อความอัตราจ่ายที่พบใน PDF ประกาศ (${fmt(list.length)} รายการ)</p>
        <ul>${list.slice(0, 10).map(item).join("")}</ul>
        ${list.length > 10 ? `<details><summary>แสดงอีก ${fmt(list.length - 10)} รายการ</summary><ul>${list.slice(10).map(item).join("")}</ul></details>` : ""}
      </div>`;
  }

  function moneyCard(r) {
    const f = paymentFacts(r);
    const quote = (m) => `<span class="fact-quote">${escapeHtml(clip(m.text, 140))} <small>หน้า ${escapeHtml(m.page)}</small></span>`;
    const optional = [
      ["DRG Version", f.drgVersion],
      ["Point", f.point ? clip(f.point, 80) : ""],
      ["Global Budget", f.globalBudget ? "ภายใต้ Global Budget / การจัดสรร" : ""],
      ["Fee Schedule", f.feeSchedule ? "จ่ายตาม Fee Schedule รายการบริการ" : ""]
    ];
    const present = optional.filter(([, v]) => v);
    const absent = optional.filter(([, v]) => !v).map(([k]) => k);
    const body = `
      <dl class="money-grid">
        <div><dt>Payment Method</dt><dd>${f.tags.length ? f.tags.map((t) => `<span class="pill pill-money">${escapeHtml(t)}</span>`).join(" ") : missing()}</dd></div>
        <div><dt>Rate</dt><dd>${has(f.rate) ? `<strong>${escapeHtml(f.rate)}</strong>` : missing(RATE_CHECK)}</dd></div>
        <div><dt>Unit</dt><dd>${f.units.length ? f.units.slice(0, 6).map((u) => `<span class="pill">${escapeHtml(u.unit)} <small>หน้า ${escapeHtml(u.page)}</small></span>`).join(" ") : missing()}</dd></div>
        <div><dt>Ceiling</dt><dd>${f.ceilings.length ? f.ceilings.slice(0, 3).map(quote).join("") : missing()}</dd></div>
        <div><dt>Formula</dt><dd>${has(f.formula) ? escapeHtml(f.formula) : missing()}</dd></div>
        ${present.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}
      </dl>
      ${absent.length ? `<p class="fact-absent">ไม่พบข้อมูล: ${escapeHtml(absent.join(" · "))}</p>` : ""}
      <p class="fact-absent"><i class="bi bi-info-circle" aria-hidden="true"></i> Unit / Ceiling ดึงจากข้อความอัตราจ่ายใน PDF พร้อมเลขหน้า</p>`;
    const extra = rateMentionsHtml(r) +
      (!f.hasNumbers ? `<p class="missing-note"><i class="bi bi-search" aria-hidden="true"></i> ${RATE_CHECK}</p>` : "");
    return answerCard(3, "bi-cash-coin", "เงินที่จะได้รับ", "ครบเงื่อนไขแล้ว ได้เงินเท่าไร / จ่ายแบบใด", body, extra, true);
  }

  const codeHref = (type, code) => `#/codes${type === "icd9" ? "/icd9" : ""}?code=${encodeURIComponent(code)}`;
  const codeChip = (c, type) =>
    `<a class="code-chip" href="${codeHref(type, c.code)}" title="${escapeHtml(c.desc || "")}">${escapeHtml(c.code)}</a>`;

  function codeTable(codes, columns, type) {
    return `
      <div class="table-wrap code-table-wrap">
        <table class="data-table">
          <thead><tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
          <tbody>${codes.map((c) => `
            <tr data-code-row="${escapeHtml(App.utils.normalizeText(columns.map((col) => (c[col.key] == null ? "" : c[col.key])).join(" ")))}">
              ${columns.map((col) => {
                const v = c[col.key];
                if (col.key === "code") {
                  return type
                    ? `<td><a class="code-link" href="${codeHref(type, v)}"><code>${escapeHtml(v)}</code></a></td>`
                    : `<td><code>${escapeHtml(v)}</code></td>`;
                }
                if (col.num) {
                  const shown = v == null || v === "" ? "—" : (col.money ? Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : v);
                  return `<td class="num">${escapeHtml(shown)}</td>`;
                }
                return `<td>${has(v) ? escapeHtml(v) : `<span class="missing">ไม่มีคำอธิบายใน PDF</span>`}</td>`;
              }).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function codeTools(count, label) {
    return `
      <div class="code-tools">
        ${count > 12 ? `<input type="search" class="code-filter" data-code-filter placeholder="กรองรหัส / คำอธิบาย…" aria-label="กรอง ${escapeHtml(label)}">` : ""}
        <span class="mini-label" data-code-count>${fmt(count)} รหัส</span>
      </div>`;
  }

  function pairsHtml(r) {
    const groups = pairGroups(r);
    if (!groups.length) return "";
    const shown = groups.slice(0, 40);
    return `
      <div class="pair-block">
        <p class="mini-label">Diagnosis–Procedure Pair ตามแถวในตารางประกาศ (${fmt(groups.length)} แถว)</p>
        <div class="pair-list">
          ${shown.map((g) => `
            <div class="pair">
              <span class="pair-label">${escapeHtml(pairLabel(g))}</span>
              <div class="pair-codes">
                <div><span class="mini-label">ICD-10</span><div>${g.icd10.map((c) => codeChip(c, "icd10")).join("")}</div></div>
                <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
                <div><span class="mini-label">ICD-9-CM</span><div>${g.icd9.map((c) => codeChip(c, "icd9")).join("")}</div></div>
              </div>
            </div>`).join("")}
        </div>
        ${groups.length > shown.length ? `<p class="mini-label">แสดง ${fmt(shown.length)} จาก ${fmt(groups.length)} แถว — ดูทั้งหมดที่เมนู ICD / Procedure</p>` : ""}
        <p class="fact-absent"><i class="bi bi-info-circle" aria-hidden="true"></i> จับคู่เฉพาะแถวที่รหัสครบและชัดเจน แถวอื่น${CHECK_FULL}</p>
      </div>`;
  }

  function codeSection(no, title, codes, describedText, notExtracted, type, extraHtml) {
    const described = has(describedText)
      ? `<p class="described"><span class="mini-label">คำอธิบายใน Revenue Master:</span> ${escapeHtml(describedText)}</p>`
      : "";
    const body = codes.length
      ? codeTools(codes.length, title) + codeTable(codes, [
          { key: "code", label: "รหัส" },
          { key: "desc", label: "คำอธิบาย (จาก PDF)" },
          { key: "page", label: "หน้า", num: true }
        ], type)
      : `<p class="missing">${notExtracted ? `ยังไม่มีรหัสจาก PDF — ${CHECK_FULL}` : MISSING}</p>`;
    return detailSection(no, title, described + body + (extraHtml || ""), fmt(codes.length), codes.length > 0);
  }

  function drugSection(no, drugs) {
    const body = drugs.length
      ? codeTools(drugs.length, "Drug Code") + codeTable(drugs, [
          { key: "code", label: "GPUID" },
          { key: "name", label: "รายการยา (จาก PDF)" },
          { key: "price", label: "ราคา/อัตรา (บาท)", num: true, money: true },
          { key: "page", label: "หน้า", num: true }
        ])
      : `<p class="missing">${MISSING}</p>`;
    return detailSection(no, "Drug Code / GPUID", body, fmt(drugs.length), false);
  }

  function simpleCodeSection(no, title, codes, note) {
    const body = codes.length
      ? codeTable(codes, [{ key: "code", label: "รหัส" }, { key: "desc", label: "คำอธิบาย" }, { key: "page", label: "หน้า", num: true }])
      : `<p class="missing">${escapeHtml(note || MISSING)}</p>`;
    return detailSection(no, title, body, fmt(codes.length), false);
  }

  function sourceSection(no, r) {
    const ex = r.extraction || {};
    const quality = ex.pages_total
      ? `<span class="chips">
          <span class="chip">อ่านได้ ${fmt(ex.clean_thai || 0)} หน้า</span>
          <span class="chip">ตาราง/อังกฤษ ${fmt(ex.english_table || 0)} หน้า</span>
          <span class="chip">ไทยอ่านไม่ได้ ${fmt(ex.garbled_thai || 0)} หน้า</span>
          <span class="chip">ภาพ ${fmt(ex.image || 0)} หน้า</span>
        </span>`
      : missing();
    const body = `
      <dl class="source-dl">
        <div><dt>ชื่อประกาศ</dt><dd>${valueOrMissing(r.announcement_title)}</dd></div>
        <div><dt>หมวด / กลุ่ม</dt><dd>${escapeHtml(r.category)} · ${escapeHtml(r.group_code)} ${escapeHtml(r.group_name || "")}</dd></div>
        <div><dt>หน้าในเอกสารรวม</dt><dd>หน้า ${pageRange(r)} ${ex.pages_total ? `(${fmt(ex.pages_total)} หน้า)` : ""}</dd></div>
        <div><dt>คุณภาพข้อความ PDF</dt><dd>${quality}</dd></div>
        <div><dt>หมายเหตุ</dt><dd>${valueOrMissing(r.source_note)}</dd></div>
        <div><dt>ลำดับใน Revenue Master</dt><dd>${escapeHtml(r.seq)} · ${escapeHtml(r.id)}</dd></div>
      </dl>`;
    return detailSection(no, "Source", body, `หน้า ${pageRange(r)}`, true);
  }

  function flagsHtml(r) {
    if (!r.quality_flags.length) return "";
    return `
      <div class="notice flag-box" role="note">
        <i class="bi bi-clipboard-check" aria-hidden="true"></i>
        <div>
          <strong>สถานะข้อมูล: ${escapeHtml(r.data_status)}</strong> — ${CHECK_FULL}ก่อนดำเนินการ Claim
          <ul class="flag-list">${r.quality_flags.map((f) => `<li>${escapeHtml(App.flagLabel(f))}</li>`).join("")}</ul>
        </div>
      </div>`;
  }

  function sectionsHtml(r) {
    const checks = checklist(r);
    return `
      ${flagsHtml(r)}
      <div class="answer-grid">
        ${answerCard(1, "bi-people-fill", "กลุ่มเป้าหมาย", "ใครมีสิทธิ / ใครเข้าเกณฑ์",
          answerText(r.target_population),
          subRows([["ผู้ Claim", r.claim_owner], ["รายการ Claim", r.claim_item], ["คุณสมบัติหน่วยบริการ", r.provider_requirement]]))}
        ${answerCard(2, "bi-ui-checks", "เงื่อนไข Claim", "ต้องมีเงื่อนไขอะไรจึง Claim ได้",
          answerText(r.conditions),
          `<div class="checklist-block">
            <p class="mini-label">Checklist ก่อน Claim · เฉพาะที่เกี่ยวข้องกับ Program นี้ (${fmt(checks.length)})</p>
            ${checklistHtml(checks)}
            <p class="fact-absent"><i class="bi bi-info-circle" aria-hidden="true"></i> สร้างจากข้อความใน Revenue Master / PDF — ไม่ใช่เงื่อนไขใหม่</p>
          </div>`)}
        ${moneyCard(r)}
      </div>

      <div class="detail-sections">
        ${detailSection(4, "ระบบ Claim", `
          <p>${valueOrMissing(r.claim_system)}</p>
          ${r.claim_system_tags.length ? `<span class="chips">${r.claim_system_tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</span>` : ""}
          ${flowHtml(r)}`,
          r.claim_system_tags.length, true)}
        ${codeSection(5, "ICD-10", r.icd10, r.icd10_text, r.quality_flags.includes("icd10_described_not_extracted"), "icd10")}
        ${codeSection(6, "ICD-9-CM", r.icd9, r.icd9_text, r.quality_flags.includes("icd9_described_not_extracted"), "icd9", pairsHtml(r))}
        ${detailSection(7, "Service Code", `
          ${has(r.service_code_text) ? `<p class="described"><span class="mini-label">คำอธิบายใน Revenue Master:</span> ${escapeHtml(r.service_code_text)}</p>` : ""}
          ${r.service_codes.length
            ? codeTable(r.service_codes, [{ key: "code", label: "รหัส" }, { key: "desc", label: "คำอธิบาย" }, { key: "page", label: "หน้า", num: true }])
            : `<p class="missing">ยังไม่มีรายการรหัสบริการ — ${CHECK_FULL}</p>`}`,
          fmt(r.service_codes.length), false)}
        ${drugSection(8, r.drug_codes)}
        ${simpleCodeSection(9, "Instrument Code", r.instrument_codes,
          r.quality_flags.includes("instrument_codes_not_extracted") ? `รหัส Instrument อยู่ในหน้าที่ข้อความภาษาไทยอ่านไม่ได้ — ${CHECK_FULL}` : "")}
        ${simpleCodeSection(10, "Lab Code", r.lab_codes, "")}
        ${detailSection(11, "หน่วยงานเจ้าภาพ", `
          ${r.departments.length ? `<span class="chips chips-lg">${r.departments.map((d) => `<span class="chip">${escapeHtml(d)}</span>`).join("")}</span>` : `<p class="missing">${MISSING}</p>`}
          <p class="proposal-note"><i class="bi bi-info-circle" aria-hidden="true"></i><span>ผู้ Claim · รายงานติดตาม · หน่วยงานเจ้าภาพ เป็นข้อเสนอเชิงปฏิบัติการใน Revenue Master ต้องปรับตามโครงสร้างจริงของโรงพยาบาล</span></p>`,
          r.departments.length, true)}
        ${detailSection(12, "รายงานติดตาม", `<p>${valueOrMissing(r.tracking_report)}</p>`, null, true)}
        ${sourceSection(13, r)}
      </div>`;
  }

  function bind(root) {
    root.querySelectorAll("[data-code-filter]").forEach((input) => {
      const body = input.closest(".detail-body");
      const rows = Array.from(body.querySelectorAll("[data-code-row]"));
      const counter = body.querySelector("[data-code-count]");
      input.addEventListener("input", () => {
        const q = App.utils.normalizeText(input.value.trim());
        let shown = 0;
        rows.forEach((row) => {
          const match = !q || row.dataset.codeRow.includes(q);
          row.hidden = !match;
          if (match) shown += 1;
        });
        counter.textContent = q ? `${fmt(shown)} จาก ${fmt(rows.length)} รหัส` : `${fmt(rows.length)} รหัส`;
      });
    });
  }

  /* ---------------- Full page (level 3 of drill down) ---------------- */
  function renderPage(section, r, ctx) {
    const cat = ctx.cat;
    const group = ctx.group;
    const siblings = App.data.byGroup.get(group.code) || [];
    const index = siblings.indexOf(r);
    const prev = siblings[index - 1];
    const next = siblings[index + 1];

    App.setBreadcrumb([
      { label: "ภาพรวม", href: "#/overview", icon: "bi-house-door" },
      { label: `หมวด ${cat.code}`, href: `#/${cat.route}` },
      { label: group.code, href: `#/${cat.route}/${group.code}` },
      { label: r.program_name }
    ]);
    document.title = `${r.program_name} · ${CFG.SYSTEM_NAME}`;

    section.innerHTML = `
      <div class="program-hero cat-${lower(cat.code)}">
        <div class="container">
          <a class="back-link" href="#/${cat.route}/${escapeHtml(group.code)}"><i class="bi bi-arrow-left" aria-hidden="true"></i> ${escapeHtml(group.code)} · ${escapeHtml(group.name)}</a>
          <div class="program-hero-main">
            <div>
              <p class="eyebrow">หมวด ${escapeHtml(cat.code)} › ${escapeHtml(group.code)} › Program</p>
              <h1>${escapeHtml(r.program_name)}</h1>
              <p class="program-hero-title">${valueOrMissing(r.announcement_title)}</p>
            </div>
            <div class="program-hero-meta">
              ${App.statusBadge(r.data_status)}
              <span class="pill"><i class="bi bi-file-earmark-text" aria-hidden="true"></i> หน้า ${pageRange(r)}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="container section section-tight cat-${lower(cat.code)}">
        ${sectionsHtml(r)}
        <nav class="pager" aria-label="Program ในกลุ่มเดียวกัน">
          ${prev ? `<a class="prev" href="${App.recordHref(prev)}"><span><i class="bi bi-arrow-left" aria-hidden="true"></i> ก่อนหน้า</span>${escapeHtml(prev.program_name)}</a>` : ""}
          ${next ? `<a class="next" href="${App.recordHref(next)}"><span>ถัดไป <i class="bi bi-arrow-right" aria-hidden="true"></i></span>${escapeHtml(next.program_name)}</a>` : ""}
        </nav>
      </div>`;
    bind(section);
  }

  /* ---------------- Detail Drawer ---------------- */
  const drawer = { el: null, overlay: null, lastFocus: null, currentId: null };

  function ensureDrawer() {
    if (drawer.el) return;
    drawer.overlay = document.createElement("div");
    drawer.overlay.className = "dd-overlay";
    drawer.overlay.hidden = true;
    drawer.overlay.addEventListener("click", () => close());

    drawer.el = document.createElement("aside");
    drawer.el.className = "detail-drawer";
    drawer.el.setAttribute("role", "dialog");
    drawer.el.setAttribute("aria-modal", "true");
    drawer.el.setAttribute("aria-labelledby", "ddTitle");
    drawer.el.setAttribute("aria-hidden", "true");
    drawer.el.inert = true;
    drawer.el.innerHTML = `
      <header class="dd-head">
        <div class="dd-heading" data-dd-heading></div>
        <div class="dd-actions">
          <button type="button" class="btn btn-sm dd-full" data-copy-link="" aria-label="คัดลอกลิงก์ Program นี้"><i class="bi bi-link-45deg" aria-hidden="true"></i> คัดลอกลิงก์</button>
          <a class="btn btn-sm dd-full" data-dd-full href="#/overview"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> เปิดหน้าเต็ม</a>
          <button type="button" class="icon-btn icon-btn-plain" data-dd-close aria-label="ปิดรายละเอียด"><i class="bi bi-x-lg"></i></button>
        </div>
      </header>
      <div class="dd-body" data-dd-body></div>`;
    document.body.append(drawer.overlay, drawer.el);
    drawer.el.querySelector("[data-dd-close]").addEventListener("click", () => close());
  }

  const isOpen = () => !!drawer.el && drawer.el.classList.contains("is-open");

  function open(id, opts) {
    const options = opts || {};
    const r = App.data && App.data.byId.get(id);
    if (!r) return;
    ensureDrawer();
    drawer.el.querySelector("[data-dd-heading]").innerHTML = `
      <p class="eyebrow">หมวด ${escapeHtml(r.category)} › ${escapeHtml(r.group_code)} › Program</p>
      <h2 id="ddTitle">${escapeHtml(r.program_name)}</h2>
      <p>${escapeHtml(r.announcement_title)}</p>
      <div class="dd-meta">${App.statusBadge(r.data_status)}<span class="pill">หน้า ${pageRange(r)}</span></div>`;
    drawer.el.querySelector("[data-dd-full]").setAttribute("href", App.recordHref(r));
    const body = drawer.el.querySelector("[data-dd-body]");
    body.className = `dd-body cat-${lower(r.category)}`;
    body.innerHTML = sectionsHtml(r);
    body.scrollTop = 0;
    bind(body);

    if (!isOpen()) {
      drawer.lastFocus = document.activeElement;
      drawer.el.classList.add("is-open");
      drawer.el.inert = false;
      drawer.el.setAttribute("aria-hidden", "false");
      drawer.overlay.hidden = false;
      document.body.classList.add("no-scroll");
    }
    drawer.el.querySelector("[data-dd-close]").focus({ preventScroll: true });
    drawer.currentId = id;
    if (options.updateUrl !== false && App.filters) App.filters.setHashParams({ open: id });
  }

  function close(opts) {
    const options = opts || {};
    if (!isOpen()) return;
    drawer.el.classList.remove("is-open");
    drawer.el.inert = true;
    drawer.el.setAttribute("aria-hidden", "true");
    drawer.overlay.hidden = true;
    document.body.classList.remove("no-scroll");
    drawer.currentId = null;
    if (!options.keepUrl && App.filters) App.filters.setHashParams({ open: "" });
    const last = drawer.lastFocus;
    if (last && typeof last.focus === "function" && document.contains(last)) last.focus({ preventScroll: true });
  }

  function syncFromRoute(route) {
    const id = route && route.query && route.query.open;
    if (id && App.data && App.data.byId.has(id)) open(id, { updateUrl: false });
  }

  document.addEventListener("click", (evt) => {
    const target = evt.target instanceof Element ? evt.target.closest("[data-open-detail]") : null;
    if (!target) return;
    evt.preventDefault();
    open(target.dataset.openDetail);
  });
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape" && isOpen()) close();
  });
  /* app.js อาจ render view (และเปิด Drawer จาก ?open=) ก่อน listener นี้ทำงาน
     จึงปิดเฉพาะเมื่อ URL ใหม่ไม่ได้ขอ Program เดิม */
  window.addEventListener("hashchange", () => {
    if (!isOpen()) return;
    const raw = location.hash;
    const i = raw.indexOf("?");
    const requested = new URLSearchParams(i >= 0 ? raw.slice(i + 1) : "").get("open");
    if (requested !== drawer.currentId) close({ keepUrl: true });
  });

  App.renderWhenData = renderWhenData;
  App.ui = { has, clip, missing, termsOf, hl, textCell, pageRange };
  App.claim = { checklist, paymentFacts, pairGroups, pairLabel, flowHtml, codeHref, codeChip };
  App.detail = { sectionsHtml, renderPage, open, close, isOpen, syncFromRoute, bind };
})();
