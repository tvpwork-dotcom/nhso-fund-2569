/* =========================================================
 * filters.js — ตัวกรองรายการ Program (Phase 2 · ขยายใน Phase 3–4)
 * - อ่าน/เขียนค่าตัวกรองใน URL hash
 *   ?cat=&group=&prog=&target=&sys=&pay=&dept=&status=&icd10=&icd9=&q=
 * - ใช้ร่วมกันใน Tab A/B/C, Claim Catalog, อัตราจ่าย, หน่วยงาน, Readiness, แหล่งอ้างอิง
 * - เลือกฟิลด์ที่แสดงได้ (fields) · ตัวกรองเพิ่มเติมพับเก็บได้ (primary)
 * - extraFields: ตัวกรองเฉพาะหน้า (เช่น rstatus, year) — หน้านั้นกรองข้อมูลเอง
 * - พารามิเตอร์อื่นใน URL (sort, dir, open, code) คงไว้เมื่อเปลี่ยนตัวกรอง
 * ต้องโหลดหลัง app.js (ใช้ App.countTags จาก dashboard.js ตอน render)
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[filters.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;

  const KEYS = ["cat", "group", "prog", "target", "sys", "pay", "dept", "status", "icd10", "icd9", "q"];
  const LABELS = Object.freeze({
    cat: "หมวด",
    group: "กลุ่ม",
    prog: "Program",
    target: "กลุ่มเป้าหมาย",
    sys: "ระบบ Claim",
    pay: "Payment Method",
    dept: "หน่วยงาน",
    status: "สถานะข้อมูล",
    icd10: "ICD-10",
    icd9: "ICD-9-CM",
    q: "คำค้น"
  });
  const ALL_LABELS = Object.freeze({
    cat: "ทุกหมวด",
    group: "ทุกกลุ่ม",
    prog: "ทุก Program",
    sys: "ทุกระบบ",
    pay: "ทุกวิธีจ่าย",
    dept: "ทุกหน่วยงาน",
    status: "ทุกสถานะ",
    icd10: "ทั้งหมด",
    icd9: "ทั้งหมด"
  });
  const DEFAULT_FIELDS = ["q", "group", "sys", "pay", "dept", "status", "icd10", "icd9"];
  const STATUS_ORDER = ["Complete", "Partial", "Needs Review"];

  const normalize = (v) => (App.utils.normalizeText ? App.utils.normalizeText(v) : String(v || "").toLowerCase());

  function parse(query, extraKeys) {
    const filters = {};
    KEYS.concat(extraKeys || []).forEach((key) => {
      const value = query && query[key] != null ? String(query[key]).trim() : "";
      if (value) filters[key] = value;
    });
    return filters;
  }

  function toQuery(filters) {
    const params = new URLSearchParams();
    KEYS.forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
    return params.toString();
  }

  function activeCount(filters) {
    return KEYS.filter((key) => filters[key]).length;
  }

  /** เปลี่ยนพารามิเตอร์ใน hash ปัจจุบันโดยไม่ trigger hashchange (ค่าว่าง = ลบ) */
  function setHashParams(changes) {
    const raw = location.hash || "#/overview";
    const i = raw.indexOf("?");
    const path = i >= 0 ? raw.slice(0, i) : raw;
    const params = new URLSearchParams(i >= 0 ? raw.slice(i + 1) : "");
    Object.keys(changes).forEach((key) => {
      const value = changes[key];
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    });
    const qs = params.toString();
    try { history.replaceState(null, "", path + (qs ? `?${qs}` : "")); } catch (err) { /* ignore */ }
  }

  const haystackCache = new WeakMap();
  function haystack(r) {
    let text = haystackCache.get(r);
    if (text === undefined) {
      text = normalize([
        r.program_name, r.announcement_title, r.group_code, r.group_name, r.claim_item,
        r.target_population, r.conditions, r.payment_method, r.payment_rate, r.claim_system,
        r.department_owner, r.tracking_report, r.source_note
      ].join(" \n "));
      haystackCache.set(r, text);
    }
    return text;
  }

  function matchPresence(flag, list) {
    if (!flag) return true;
    return flag === "1" ? list.length > 0 : list.length === 0;
  }

  function apply(records, filters) {
    const terms = filters.q ? normalize(filters.q).split(/\s+/).filter(Boolean) : [];
    const target = filters.target ? normalize(filters.target) : "";
    return records.filter((r) =>
      (!filters.cat || r.category === filters.cat) &&
      (!filters.group || r.group_code === filters.group) &&
      (!filters.prog || r.id === filters.prog) &&
      (!target || normalize(r.target_population).includes(target)) &&
      (!filters.sys || r.claim_system_tags.includes(filters.sys)) &&
      (!filters.pay || r.payment_method_tags.includes(filters.pay)) &&
      (!filters.dept || r.departments.includes(filters.dept)) &&
      (!filters.status || r.data_status === filters.status) &&
      matchPresence(filters.icd10, r.icd10) &&
      matchPresence(filters.icd9, r.icd9) &&
      terms.every((t) => haystack(r).includes(t))
    );
  }

  /* ---------------- Options ---------------- */
  function groupOptions(scope) {
    const order = new Map(App.getGroups().map((g, i) => [g.code, i]));
    return App.countTags(scope, (r) => [r.group_code])
      .map((o) => {
        const g = App.getGroup(o.value);
        return Object.assign(o, { label: g ? `${g.code} · ${g.name}` : o.value });
      })
      .sort((a, b) => (order.has(a.value) ? order.get(a.value) : 999) - (order.has(b.value) ? order.get(b.value) : 999));
  }

  function presenceOptions(scope, key) {
    return [
      { value: "1", label: "มีรหัส", count: scope.filter((r) => r[key].length > 0).length },
      { value: "0", label: "ไม่มีรหัส", count: scope.filter((r) => r[key].length === 0).length }
    ];
  }

  function optionsFor(key, scope) {
    switch (key) {
      case "cat":
        return CFG.CATEGORIES
          .map((c) => ({ value: c.code, label: `หมวด ${c.code} · ${c.name}`, count: scope.filter((r) => r.category === c.code).length }))
          .filter((o) => o.count > 0);
      case "group":
        return groupOptions(scope);
      case "prog":
        return scope.slice().sort((a, b) => a.seq - b.seq).map((r) => ({ value: r.id, label: `${r.group_code} · ${r.program_name}` }));
      case "sys":
        return App.countTags(scope, (r) => r.claim_system_tags);
      case "pay":
        return App.countTags(scope, (r) => r.payment_method_tags);
      case "dept":
        return App.countTags(scope, (r) => r.departments);
      case "status":
        return STATUS_ORDER.map((s) => ({ value: s, label: s, count: scope.filter((r) => r.data_status === s).length }));
      case "icd10":
      case "icd9":
        return presenceOptions(scope, key);
      default:
        return [];
    }
  }

  /* ---------------- UI ---------------- */
  function selectHtml(key, options, value, advanced, label, allLabel) {
    let list = options;
    if (value && !list.some((o) => o.value === value)) list = [{ value, label: value, count: 0 }].concat(list);
    return `
      <label class="filter-field${value ? " is-active" : ""}"${advanced ? " data-advanced hidden" : ""}>
        <span class="filter-label">${escapeHtml(label || LABELS[key] || key)}</span>
        <select data-filter="${escapeHtml(key)}">
          <option value="">${escapeHtml(allLabel || ALL_LABELS[key] || "ทั้งหมด")}</option>
          ${list.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label || o.value)}${o.count != null ? ` (${fmt(o.count)})` : ""}</option>`).join("")}
        </select>
      </label>`;
  }

  function fieldHtml(key, scope, filters, advanced) {
    const adv = advanced ? " data-advanced hidden" : "";
    if (key === "q") {
      return `
        <div class="filter-search"${adv}>
          <i class="bi bi-funnel" aria-hidden="true"></i>
          <input type="search" data-filter="q" value="${escapeHtml(filters.q || "")}" placeholder="กรองในรายการนี้…" aria-label="กรองรายการ" autocomplete="off">
        </div>`;
    }
    if (key === "target") {
      return `
        <label class="filter-field filter-text${filters.target ? " is-active" : ""}"${adv}>
          <span class="filter-label">${escapeHtml(LABELS.target)}</span>
          <input type="search" data-filter="target" value="${escapeHtml(filters.target || "")}" placeholder="เช่น มะเร็ง, CKD" autocomplete="off">
        </label>`;
    }
    return selectHtml(key, optionsFor(key, scope), filters[key], advanced);
  }

  /**
   * renderBar(container, { scope, filters, fields, primary, hideGroup, extraFields, onChange })
   * extraFields: [{ key, label, allLabel, options: [{ value, label, count }] }]
   * เปลี่ยนตัวกรอง → อัปเดต URL (replaceState) → เรียก onChange(filters)
   */
  function renderBar(container, opts) {
    const scope = opts.scope || [];
    let fields = (opts.fields || DEFAULT_FIELDS).filter((k) => KEYS.includes(k));
    if (opts.hideGroup) fields = fields.filter((k) => k !== "group");
    const primary = Number.isFinite(opts.primary) ? opts.primary : fields.length;
    const advancedKeys = fields.slice(primary);
    const extras = (opts.extraFields || []).filter((e) => e && e.key && !KEYS.includes(e.key));
    const allKeys = KEYS.concat(extras.map((e) => e.key));
    const countActive = (f) => allKeys.filter((key) => f[key]).length;
    let filters = Object.assign({}, opts.filters);

    container.innerHTML = `
      <div class="filter-bar" role="group" aria-label="ตัวกรองรายการ">
        ${fields.map((key, i) => fieldHtml(key, scope, filters, i >= primary)).join("")}
        ${extras.map((e) => selectHtml(e.key, e.options || [], filters[e.key], false, e.label, e.allLabel)).join("")}
        ${advancedKeys.length ? `<button type="button" class="btn btn-outline btn-sm filter-more-btn" data-filter-more aria-expanded="false"><i class="bi bi-sliders" aria-hidden="true"></i> ตัวกรองเพิ่มเติม (${advancedKeys.length})</button>` : ""}
        <button type="button" class="btn btn-outline btn-sm filter-reset" data-filter-reset${countActive(filters) ? "" : " hidden"}>
          <i class="bi bi-x-circle" aria-hidden="true"></i> ล้างตัวกรอง
        </button>
      </div>`;

    const resetBtn = container.querySelector("[data-filter-reset]");
    const moreBtn = container.querySelector("[data-filter-more]");
    const setExpanded = (on) => {
      container.querySelectorAll("[data-advanced]").forEach((el) => { el.hidden = !on; });
      if (moreBtn) {
        moreBtn.setAttribute("aria-expanded", String(on));
        moreBtn.classList.toggle("is-active", on);
      }
    };
    if (moreBtn) moreBtn.addEventListener("click", () => setExpanded(moreBtn.getAttribute("aria-expanded") !== "true"));
    setExpanded(advancedKeys.some((key) => filters[key]));

    const update = (next) => {
      filters = {};
      allKeys.forEach((key) => { if (next[key]) filters[key] = next[key]; });
      const changes = {};
      allKeys.forEach((key) => { changes[key] = filters[key] || ""; });
      setHashParams(changes);
      resetBtn.hidden = countActive(filters) === 0;
      opts.onChange(Object.assign({}, filters));
    };

    container.querySelectorAll("select[data-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        select.closest(".filter-field").classList.toggle("is-active", !!select.value);
        update(Object.assign({}, filters, { [select.dataset.filter]: select.value }));
      });
    });

    container.querySelectorAll("input[data-filter]").forEach((input) => {
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const field = input.closest(".filter-field");
          if (field) field.classList.toggle("is-active", !!input.value.trim());
          update(Object.assign({}, filters, { [input.dataset.filter]: input.value.trim() }));
        }, 220);
      });
      input.addEventListener("keydown", (evt) => { if (evt.key === "Enter") evt.preventDefault(); });
    });

    resetBtn.addEventListener("click", () => {
      container.querySelectorAll("input[data-filter]").forEach((input) => { input.value = ""; });
      container.querySelectorAll("select[data-filter]").forEach((select) => { select.value = ""; });
      container.querySelectorAll(".filter-field").forEach((field) => field.classList.remove("is-active"));
      update({});
    });
  }

  App.filters = { KEYS, LABELS, parse, toQuery, apply, activeCount, renderBar, setHashParams };
})();
