/* =========================================================
 * dashboard.js — Revenue Master data layer (Phase 2 · Phase 5 validation)
 * - โหลด ./data/revenue-master.json ด้วย relative path (GitHub Pages)
 *   หรือใช้ window.REVENUE_MASTER_DATA (ไฟล์ HTML เดียว)
 * - สร้างดัชนี byId / byGroup / byCategory
 * - ตรวจความสอดคล้องกับ config.js และรูปแบบรหัส (Validation)
 * - คำนวณ KPI จาก Dataset จริง → App.setDataKpis()
 * - สรุป Data Quality: Complete · Partial · Needs Review
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[dashboard.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { $, escapeHtml, fmt, pct } = App.utils;

  const STATUS_META = Object.freeze({
    "Complete": { cls: "status-complete", icon: "bi-check-circle-fill" },
    "Partial": { cls: "status-partial", icon: "bi-circle-half" },
    "Needs Review": { cls: "status-review", icon: "bi-exclamation-triangle-fill" }
  });
  const STATUS_ORDER = ["Complete", "Partial", "Needs Review"];
  const ICD10_RE = /^[A-Z]\d{2}(?:\.\d{1,2})?\*?(?:-[A-Z]\d{2}(?:\.\d{1,2})?\*?)?$/;
  const ICD9_RE = /^\d{2}\.\d{1,2}(?:-\d{2}\.\d{1,2})?$/;

  /* ต้องตรงกับ quality_flags ที่ build_revenue_master.py สร้าง */
  const FLAG_LABELS = Object.freeze({
    missing_group: "ไม่ระบุกลุ่ม",
    missing_program: "ไม่ระบุ Program",
    missing_target: "ไม่ระบุกลุ่มเป้าหมาย",
    missing_conditions: "ไม่ระบุเงื่อนไข",
    missing_rate: "ไม่ระบุอัตราจ่าย",
    rate_not_numeric: "อัตราจ่ายไม่มีตัวเลข",
    missing_claim_system: "ไม่ระบุระบบ Claim",
    missing_owner: "ไม่ระบุหน่วยงานเจ้าภาพ",
    missing_source: "ไม่ระบุหน้าอ้างอิง",
    duplicate: "Record ซ้ำ",
    invalid_icd: "รูปแบบ ICD ไม่ถูกต้อง",
    icd10_described_not_extracted: "มีคำอธิบาย ICD-10 แต่ยังไม่มีรหัสจาก PDF",
    icd9_described_not_extracted: "มีคำอธิบาย ICD-9-CM แต่ยังไม่มีรหัสจาก PDF",
    icd10_rows_missing_digits: "บางแถวใน PDF รหัส ICD-10 ไม่ครบ",
    source_garbled: "ข้อความภาษาไทยในประกาศอ่านไม่ได้",
    source_image: "ประกาศเป็นภาพ ไม่มีข้อความ",
    instrument_codes_not_extracted: "รหัส Instrument อยู่ในหน้าที่อ่านไม่ได้"
  });

  const ROUTE_BY_CATEGORY = new Map(CFG.CATEGORIES.map((c) => [c.code, c.route]));
  const state = { promise: null };

  /* ---------------- Helpers (shared with other modules) ---------------- */
  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50))
      .toLowerCase();
  }

  function onDomReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function statusBadge(status) {
    const name = STATUS_META[status] ? status : "Needs Review";
    const meta = STATUS_META[name];
    return `<span class="status ${meta.cls}"><i class="bi ${meta.icon}" aria-hidden="true"></i>${escapeHtml(name)}</span>`;
  }

  function flagLabel(key) {
    return FLAG_LABELS[key] || key;
  }

  function countTags(records, getter) {
    const counts = new Map();
    records.forEach((r) => {
      new Set(getter(r) || []).forEach((v) => {
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      });
    });
    return Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), "th"));
  }

  function statusCounts(records) {
    const counts = { "Complete": 0, "Partial": 0, "Needs Review": 0 };
    records.forEach((r) => { counts[r.data_status] = (counts[r.data_status] || 0) + 1; });
    return counts;
  }

  function recordHref(r) {
    const route = ROUTE_BY_CATEGORY.get(r.category) || "overview";
    return `#/${route}/${encodeURIComponent(r.group_code)}/${encodeURIComponent(r.id)}`;
  }

  function loadErrorHtml(err) {
    const isFile = location.protocol === "file:";
    const offline = navigator.onLine === false;
    let hint = "กรุณาตรวจสอบว่าอัปโหลดไฟล์ ./data/revenue-master.json แล้ว จากนั้นกด “ลองใหม่”";
    if (isFile) hint = "เปิดไฟล์โดยตรง (file://) เบราว์เซอร์จะไม่อนุญาตให้โหลดข้อมูล กรุณาเปิดผ่าน GitHub Pages หรือ local web server";
    else if (offline) hint = "อุปกรณ์ออฟไลน์อยู่ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วกด “ลองใหม่”";
    return `
      <div class="notice notice-error" role="alert">
        <i class="bi bi-x-octagon" aria-hidden="true"></i>
        <div><strong>โหลด Revenue Master ไม่สำเร็จ</strong><br>${escapeHtml(hint)}
        <br><small>${escapeHtml((err && err.message) || "")}</small>
        ${isFile ? "" : `<br><button type="button" class="btn btn-outline btn-sm" data-retry-load><i class="bi bi-arrow-clockwise" aria-hidden="true"></i> ลองใหม่</button>`}</div>
      </div>`;
  }

  /* ---------------- Load & index ---------------- */
  function fetchJson(url, timeoutMs) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    return fetch(url, { cache: "no-cache", signal: ctrl ? ctrl.signal : undefined })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
        return res.json();
      })
      .catch((err) => {
        if (err && err.name === "AbortError") throw new Error(`หมดเวลาโหลดข้อมูล (${Math.round(timeoutMs / 1000)} วินาที)`);
        throw err;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
  }

  function normalizeRecord(r) {
    const arr = (v) => (Array.isArray(v) ? v : []);
    const str = (v) => (v == null ? "" : String(v));
    return Object.assign({}, r, {
      group_name: str(r.group_name || (App.getGroup(r.group_code) || {}).name),
      program_name: str(r.program_name),
      announcement_title: str(r.announcement_title),
      target_population: str(r.target_population),
      conditions: str(r.conditions),
      payment_rate: str(r.payment_rate),
      claim_system: str(r.claim_system),
      icd10: arr(r.icd10),
      icd9: arr(r.icd9),
      service_codes: arr(r.service_codes),
      drug_codes: arr(r.drug_codes),
      instrument_codes: arr(r.instrument_codes),
      lab_codes: arr(r.lab_codes),
      payment_method_tags: arr(r.payment_method_tags),
      claim_system_tags: arr(r.claim_system_tags),
      departments: arr(r.departments),
      rate_mentions: arr(r.rate_mentions),
      quality_flags: arr(r.quality_flags),
      data_status: STATUS_META[r.data_status] ? r.data_status : "Needs Review"
    });
  }

  function buildDataset(json) {
    if (!json || !Array.isArray(json.records)) {
      throw new Error("รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบ records");
    }
    const records = json.records.filter((r) => r && r.id).map(normalizeRecord);
    const byId = new Map();
    const byGroup = new Map();
    const byCategory = new Map();
    records.forEach((r) => {
      byId.set(r.id, r);
      if (!byGroup.has(r.group_code)) byGroup.set(r.group_code, []);
      byGroup.get(r.group_code).push(r);
      if (!byCategory.has(r.category)) byCategory.set(r.category, []);
      byCategory.get(r.category).push(r);
    });
    return { meta: json.meta || {}, records, byId, byGroup, byCategory };
  }

  /** ตรวจความสอดคล้องกับ config.js และรูปแบบรหัส — ไม่ลบ record ใด ๆ แค่รายงาน */
  function validateDataset(data) {
    const issues = [];
    const groups = new Map();
    CFG.CATEGORIES.forEach((c) => c.groups.forEach((g) => groups.set(g.code, { cat: c.code, announcements: g.announcements })));
    const perCat = {};
    const perGroup = {};
    const seen = new Set();

    data.records.forEach((r) => {
      if (seen.has(r.id)) issues.push(`id ซ้ำ ${r.id}`);
      seen.add(r.id);
      const g = groups.get(r.group_code);
      if (!g) issues.push(`${r.id}: ไม่พบกลุ่ม ${r.group_code} ใน config`);
      else if (g.cat !== r.category) issues.push(`${r.id}: หมวด ${r.category} ไม่ตรงกับกลุ่ม ${r.group_code}`);
      perCat[r.category] = (perCat[r.category] || 0) + 1;
      perGroup[r.group_code] = (perGroup[r.group_code] || 0) + 1;
      r.icd10.forEach((c) => { if (!ICD10_RE.test(c.code)) issues.push(`${r.id}: ICD-10 ไม่ถูกรูปแบบ ${c.code}`); });
      r.icd9.forEach((c) => { if (!ICD9_RE.test(c.code)) issues.push(`${r.id}: ICD-9-CM ไม่ถูกรูปแบบ ${c.code}`); });
    });
    CFG.CATEGORIES.forEach((c) => {
      if ((perCat[c.code] || 0) !== c.announcements) issues.push(`หมวด ${c.code}: ข้อมูล ${perCat[c.code] || 0} ≠ config ${c.announcements}`);
    });
    groups.forEach((g, code) => {
      if ((perGroup[code] || 0) !== g.announcements) issues.push(`กลุ่ม ${code}: ข้อมูล ${perGroup[code] || 0} ≠ config ${g.announcements}`);
    });

    if (issues.length) console.warn("[dashboard.js] validation issues:", issues);
    return { ok: issues.length === 0, records: data.records.length, issues };
  }

  function computeKpis(data) {
    const unique = (getter) => {
      const set = new Set();
      data.records.forEach((r) => getter(r).forEach((v) => { if (v) set.add(v); }));
      return set.size;
    };
    return {
      programs: data.records.length,
      icd10: unique((r) => r.icd10.map((c) => c.code)),
      icd9: unique((r) => r.icd9.map((c) => c.code)),
      paymentMethods: unique((r) => r.payment_method_tags),
      claimSystems: unique((r) => r.claim_system_tags),
      feeSchedule: data.records.filter((r) => r.payment_method_tags.includes("Fee Schedule")).length
    };
  }

  /* ---------------- Overview: Data Quality ---------------- */
  function dataQualityHost() {
    let host = $("#dataQuality");
    if (host) return host;
    const anchor = $("#kpiData");
    if (!anchor) return null;
    host = document.createElement("div");
    host.id = "dataQuality";
    host.className = "dq";
    anchor.insertAdjacentElement("afterend", host);
    return host;
  }

  function validationHtml(v) {
    if (!v) return "";
    return v.ok
      ? `<p class="dq-validation ok"><i class="bi bi-shield-check" aria-hidden="true"></i><span>ตรวจสอบความสอดคล้องกับโครงสร้างกองทุนและรูปแบบรหัส ICD: ผ่าน (${fmt(v.records)} Record)</span></p>`
      : `<p class="dq-validation warn"><i class="bi bi-shield-exclamation" aria-hidden="true"></i><span>ตรวจสอบความสอดคล้อง: พบ ${fmt(v.issues.length)} ประเด็น — ${escapeHtml(v.issues.slice(0, 3).join(" · "))}${v.issues.length > 3 ? " …" : ""}</span></p>`;
  }

  function renderDataQuality(data) {
    const host = dataQualityHost();
    if (!host) return;
    const total = data.records.length;
    const counts = statusCounts(data.records);
    const flags = countTags(data.records, (r) => r.quality_flags).slice(0, 6);
    const meta = data.meta;

    host.innerHTML = `
      <div class="dq-head">
        <h3>คุณภาพข้อมูล Revenue Master</h3>
        <span class="dq-sub">${fmt(total)} Record · สร้างเมื่อ ${escapeHtml(meta.generated_at || "—")}</span>
      </div>
      <div class="dq-body">
        <div>
          <div class="dq-meter" role="img" aria-label="${STATUS_ORDER.map((s) => `${s} ${counts[s]}`).join(", ")}">
            ${STATUS_ORDER.map((s) => (counts[s] ? `<span class="dq-seg ${STATUS_META[s].cls}" style="flex:${counts[s]}"></span>` : "")).join("")}
          </div>
          <ul class="dq-legend">
            ${STATUS_ORDER.map((s) => `<li>${statusBadge(s)}<strong>${fmt(counts[s])}</strong><span>${pct(counts[s], total)}%</span></li>`).join("")}
          </ul>
        </div>
        <div class="dq-flags">
          <p class="mini-label">ประเด็นที่พบบ่อย (จำนวน Record)</p>
          <ul>${flags.map((f) => `<li><span>${escapeHtml(flagLabel(f.value))}</span><strong>${fmt(f.count)}</strong></li>`).join("")}</ul>
        </div>
      </div>
      ${validationHtml(App.dataValidation)}
      ${meta.extraction_note ? `<p class="dq-note"><i class="bi bi-info-circle" aria-hidden="true"></i><span>${escapeHtml(meta.extraction_note)}</span></p>` : ""}`;
  }

  function renderLoadError(err) {
    const host = dataQualityHost();
    if (host) host.innerHTML = loadErrorHtml(err);
    const status = $("#kpiDataStatus");
    if (status) status.innerHTML = `<span class="pill pill-error"><i class="bi bi-x-circle" aria-hidden="true"></i> โหลดข้อมูลไม่สำเร็จ</span>`;
  }

  /* ---------------- Public ---------------- */
  function loadData() {
    if (state.promise) return state.promise;

    if (!CFG.FEATURES.LOAD_REVENUE_MASTER) {
      state.promise = Promise.reject(new Error("ปิดการโหลด Revenue Master ใน config.js"));
      state.promise.catch(() => {});
      return state.promise;
    }

    /* ไฟล์ HTML เดียว (single-file build) ฝังข้อมูลไว้ใน window.REVENUE_MASTER_DATA */
    const url = `${CFG.PATHS.REVENUE_MASTER}?v=${encodeURIComponent(CFG.VERSION)}`;
    const source = window.REVENUE_MASTER_DATA
      ? Promise.resolve(window.REVENUE_MASTER_DATA)
      : fetchJson(url, 20000);
    state.promise = source
      .then((json) => {
        const data = buildDataset(json);
        App.data = data;
        App.dataValidation = validateDataset(data);
        onDomReady(() => {
          App.setDataKpis(computeKpis(data));
          renderDataQuality(data);
        });
        return data;
      })
      .catch((err) => {
        console.error("[dashboard.js] load failed:", err);
        App.dataError = err;
        onDomReady(() => renderLoadError(err));
        throw err;
      });
    state.promise.catch(() => {});
    return state.promise;
  }

  App.data = null;
  App.dataError = null;
  App.dataValidation = null;
  App.utils.normalizeText = normalizeText;
  App.statusBadge = statusBadge;
  App.flagLabel = flagLabel;
  App.countTags = countTags;
  App.statusCounts = statusCounts;
  App.recordHref = recordHref;
  App.loadErrorHtml = loadErrorHtml;
  App.loadData = loadData;
  App.whenData = loadData;

  loadData();
})();
