/* =========================================================
 * search.js — Global Search (Phase 2)
 * ค้นได้ทั้ง Program · โรค · ICD-10 · ICD-9-CM · GPUID · ระบบ Claim · หน่วยงาน
 * - รหัส: prefix (C15 → C15.0) และช่วงรหัส (E11.5 อยู่ใน E11.0-E11.9)
 * - คำพ้องไทย/อังกฤษ (มะเร็ง ↔ cancer, neoplasm …)
 * - Search highlight
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[search.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;
  const MAX_CODE_ROWS = 150;
  const MAX_TOKENS = 8;

  /* คำพ้องสำหรับการค้นหา (ไม่ใช่ข้อมูลกองทุน) */
  const SYNONYM_GROUPS = [
    ["มะเร็ง", "cancer", "neoplasm", "carcinoma", "chemo", "เคมีบำบัด", "รังสีรักษา"],
    ["เบาหวาน", "dm", "diabetes"],
    ["ความดัน", "ht", "hypertension"],
    ["ไต", "ckd", "kidney", "renal", "rrt", "dialysis"],
    ["หลอดเลือดสมอง", "stroke"],
    ["หัวใจ", "stemi", "cardiac", "cag", "pci"],
    ["เอดส์", "hiv", "aids"],
    ["วัณโรค", "tb", "tuberculosis"],
    ["ประคับประคอง", "palliative"],
    ["ส่งเสริมสุขภาพ", "pp", "prevention"],
    ["ทางไกล", "telemedicine"],
    ["ภาวะพึ่งพิง", "ltc"],
    ["ผ่าตัด", "surgery", "ods", "mis"],
    ["ฟื้นฟู", "rehabilitation", "rehab", "imc"],
    ["แผนไทย", "thai traditional"],
    ["อุปกรณ์", "instrument", "อวัยวะเทียม"],
    ["ตับอักเสบซี", "hcv", "hepatitis c"]
  ];

  const normalize = (v) => (App.utils.normalizeText ? App.utils.normalizeText(v) : String(v || "").toLowerCase());
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const codeKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const CODE_QUERY = /^(?:[a-z]\d{2}(?:\.?[0-9a-z]{0,4})?|\d{2}\.?\d{0,2}|\d{6,7})$/i;

  /* ---------------- Index ---------------- */
  let cache = { data: null, rows: [] };

  function codeEntry(type, c) {
    const code = String(c.code || "");
    const parts = code.split(/\s*-\s*/);
    const desc = c.desc || c.name || "";
    return {
      type, code, desc, page: c.page,
      keyLo: codeKey(parts[0]),
      keyHi: codeKey(parts[1] || parts[0]),
      descNorm: normalize(desc)
    };
  }

  function buildRows(data) {
    return data.records.map((r) => ({
      record: r,
      fields: [
        { key: "program_name", label: "Program", w: 10, text: r.program_name },
        { key: "group", label: "กลุ่ม", w: 6, text: `${r.group_code} ${r.group_name || ""} หมวด ${r.category}` },
        { key: "announcement_title", label: "ชื่อประกาศ", w: 5, text: r.announcement_title },
        { key: "claim_item", label: "รายการ Claim", w: 5, text: r.claim_item },
        { key: "target_population", label: "กลุ่มเป้าหมาย", w: 4, text: r.target_population },
        { key: "conditions", label: "เงื่อนไข", w: 3, text: r.conditions },
        { key: "payment", label: "อัตราจ่าย", w: 3, text: [r.payment_rate, r.payment_method_tags.join(" ")].join(" ") },
        { key: "claim_system", label: "ระบบ Claim", w: 3, text: [r.claim_system, r.claim_system_tags.join(" ")].join(" ") },
        { key: "departments", label: "หน่วยงาน", w: 3, text: r.department_owner },
        { key: "tracking_report", label: "รายงานติดตาม", w: 2, text: r.tracking_report },
        { key: "codes_text", label: "คำอธิบายรหัส", w: 2, text: [r.icd10_text, r.icd9_text, r.service_code_text].join(" ") },
        { key: "source_note", label: "หมายเหตุ", w: 1, text: r.source_note }
      ].map((f) => Object.assign(f, { text: f.text || "", norm: normalize(f.text || "") })),
      codes: []
        .concat(r.icd10.map((c) => codeEntry("ICD-10", c)))
        .concat(r.icd9.map((c) => codeEntry("ICD-9-CM", c)))
        .concat(r.drug_codes.map((c) => codeEntry("GPUID", c)))
    }));
  }

  function rows() {
    if (cache.data !== App.data) cache = { data: App.data, rows: buildRows(App.data) };
    return cache.rows;
  }

  /* ---------------- Matching ---------------- */
  function termMatcher(term) {
    // คำละตินสั้น (≤3) ต้องขึ้นต้นคำ เพื่อไม่ให้ "dm" ไปตรงกับ "admit"
    if (/^[a-z0-9]{1,3}$/.test(term)) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}`);
      return (text) => re.test(text);
    }
    return (text) => text.includes(term);
  }

  function expand(term) {
    const group = SYNONYM_GROUPS.find((g) => g.includes(term));
    return group || [term];
  }

  function codeMatches(entry, qKey) {
    if (!qKey || !entry.keyLo) return false;
    if (entry.keyLo.startsWith(qKey)) return true;
    if (entry.keyHi !== entry.keyLo && qKey.length >= 3) {
      return qKey >= entry.keyLo && qKey <= `${entry.keyHi}￿`;
    }
    return false;
  }

  function runSearch(query) {
    const tokens = normalize(query).split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
    const specs = tokens.map((raw) => ({
      raw,
      alts: expand(raw).map((term) => ({ term, test: termMatcher(term) })),
      codeKey: CODE_QUERY.test(raw) ? codeKey(raw) : ""
    }));
    const highlightTerms = Array.from(new Set(specs.flatMap((s) => s.alts.map((a) => a.term))));

    const programs = [];
    const codeRows = [];
    rows().forEach((row) => {
      let score = 0;
      const fieldHits = new Set();
      const codeHits = new Map();

      for (const spec of specs) {
        let hit = false;
        row.fields.forEach((f) => {
          if (f.norm && spec.alts.some((a) => a.test(f.norm))) {
            score += f.w;
            fieldHits.add(f);
            hit = true;
          }
        });
        let descHits = 0;
        row.codes.forEach((c) => {
          const byCode = spec.codeKey && codeMatches(c, spec.codeKey);
          const byDesc = !byCode && spec.raw.length >= 3 && c.descNorm && spec.alts.some((a) => a.test(c.descNorm));
          if (byCode || byDesc) {
            hit = true;
            codeHits.set(`${c.type}|${c.code}`, c);
            if (byCode) score += 9; else descHits += 1;
          }
        });
        score += Math.min(descHits, 4);
        if (!hit) return;
      }

      const hits = Array.from(codeHits.values());
      programs.push({ record: row.record, score, fields: Array.from(fieldHits), codeHits: hits });
      hits.forEach((entry) => codeRows.push({ entry, record: row.record }));
    });

    programs.sort((a, b) => b.score - a.score || (a.record.seq || 0) - (b.record.seq || 0));
    return { programs, codeRows, highlightTerms };
  }

  /* ---------------- Highlight ---------------- */
  function highlight(text, terms) {
    const raw = String(text == null ? "" : text);
    const lower = normalize(raw);
    if (!terms || !terms.length || lower.length !== raw.length) return escapeHtml(raw);
    const ranges = [];
    terms.forEach((t) => {
      if (!t) return;
      let i = lower.indexOf(t);
      while (i !== -1) {
        ranges.push([i, i + t.length]);
        i = lower.indexOf(t, i + t.length);
      }
    });
    if (!ranges.length) return escapeHtml(raw);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push(r.slice());
    });
    let out = "";
    let pos = 0;
    merged.forEach(([s, e]) => {
      out += `${escapeHtml(raw.slice(pos, s))}<mark>${escapeHtml(raw.slice(s, e))}</mark>`;
      pos = e;
    });
    return out + escapeHtml(raw.slice(pos));
  }

  function snippet(text, terms, radius) {
    const r = radius || 60;
    const raw = String(text || "");
    const lower = normalize(raw);
    let first = -1;
    (terms || []).forEach((t) => {
      const i = lower.indexOf(t);
      if (i !== -1 && (first === -1 || i < first)) first = i;
    });
    if (raw.length <= r * 2 + 20) return highlight(raw, terms);
    if (first === -1) return `${highlight(raw.slice(0, r * 2), terms)}…`;
    const start = Math.max(0, first - r);
    const end = Math.min(raw.length, first + r);
    return `${start > 0 ? "…" : ""}${highlight(raw.slice(start, end), terms)}${end < raw.length ? "…" : ""}`;
  }

  /* ---------------- View ---------------- */
  function suggestionsHtml(title) {
    return `
      <div class="card card-pad">
        <h3>${escapeHtml(title)}</h3>
        <div class="chips chips-lg">${CFG.SEARCH_SUGGESTIONS.map((s) =>
          `<a class="chip chip-link" href="#/search?q=${encodeURIComponent(s)}">${escapeHtml(s)}</a>`).join("")}</div>
      </div>`;
  }

  function programResult(p, terms) {
    const r = p.record;
    const hits = p.fields
      .filter((f) => f.key !== "program_name" && f.key !== "announcement_title")
      .sort((a, b) => b.w - a.w)
      .slice(0, 3);
    const codes = p.codeHits;
    return `
      <a class="result-card cat-${escapeHtml(String(r.category).toLowerCase())}" href="${App.recordHref(r)}">
        <div class="result-head">
          <span class="nav-letter" aria-hidden="true">${escapeHtml(r.category)}</span>
          <span class="group-code">${escapeHtml(r.group_code)}</span>
          <h3>${highlight(r.program_name, terms)}</h3>
          ${App.statusBadge(r.data_status)}
        </div>
        <p class="result-title">${highlight(r.announcement_title, terms)}</p>
        ${hits.length || codes.length ? `
        <ul class="result-hits">
          ${hits.map((f) => `<li><span class="hit-label">${escapeHtml(f.label)}</span><span>${snippet(f.text, terms)}</span></li>`).join("")}
          ${codes.length ? `<li><span class="hit-label">รหัส</span><span>${codes.slice(0, 8).map((c) => `<code>${highlight(c.code, terms)}</code>`).join(" ")}${codes.length > 8 ? ` <span class="mini-label">+${fmt(codes.length - 8)}</span>` : ""}</span></li>` : ""}
        </ul>` : ""}
      </a>`;
  }

  function codeTableHtml(codeRows, terms) {
    const shown = codeRows.slice(0, MAX_CODE_ROWS);
    return `
      <section class="result-section" aria-labelledby="resCodes">
        <h2 id="resCodes" class="h3">รหัสที่ตรงกัน</h2>
        <div class="table-wrap code-table-wrap">
          <table class="data-table">
            <thead><tr><th>รหัส</th><th>ประเภท</th><th>คำอธิบาย</th><th>Program</th><th class="num">หน้า</th></tr></thead>
            <tbody>${shown.map(({ entry, record }) => `
              <tr>
                <td><code>${highlight(entry.code, terms)}</code></td>
                <td>${escapeHtml(entry.type)}</td>
                <td>${entry.desc ? highlight(entry.desc, terms) : `<span class="missing">ไม่มีคำอธิบายใน PDF</span>`}</td>
                <td><a href="${App.recordHref(record)}">${escapeHtml(record.group_code)} · ${escapeHtml(record.program_name)}</a></td>
                <td class="num">${entry.page ? escapeHtml(entry.page) : "—"}</td>
              </tr>`).join("")}</tbody>
          </table>
        </div>
        ${codeRows.length > MAX_CODE_ROWS ? `<p class="mini-label">แสดง ${fmt(MAX_CODE_ROWS)} จาก ${fmt(codeRows.length)} รหัส — พิมพ์คำค้นให้เจาะจงขึ้น</p>` : ""}
      </section>`;
  }

  function resultsHtml(res, q, ms) {
    const terms = res.highlightTerms;
    if (!res.programs.length) {
      return `
        <div class="empty-state">
          <i class="bi bi-search" aria-hidden="true"></i>
          <p>ไม่พบผลลัพธ์สำหรับ “${escapeHtml(q)}”</p>
          <p class="mini-label">ลองคำอื่น หรือรหัสแบบย่อ เช่น C15, N18</p>
        </div>
        ${suggestionsHtml("ลองคำค้นเหล่านี้")}`;
    }
    const depts = App.countTags(res.programs.map((p) => p.record), (r) => r.departments).slice(0, 12);
    return `
      <p class="search-summary">พบ <strong>${fmt(res.programs.length)}</strong> Program · <strong>${fmt(res.codeRows.length)}</strong> รหัสที่ตรงกัน <span class="mini-label">(${Math.round(ms)} ms)</span></p>
      ${depts.length ? `<div class="search-depts"><span class="mini-label">หน่วยงานที่เกี่ยวข้อง</span><span class="chips">${depts.map((d) => `<span class="chip">${escapeHtml(d.value)} (${fmt(d.count)})</span>`).join("")}</span></div>` : ""}
      <section class="result-section" aria-labelledby="resPrograms">
        <h2 id="resPrograms" class="h3">Program</h2>
        <div class="result-list">${res.programs.map((p) => programResult(p, terms)).join("")}</div>
      </section>
      ${res.codeRows.length ? codeTableHtml(res.codeRows, terms) : ""}
      <p class="source-line"><i class="bi bi-info-circle" aria-hidden="true"></i><span>ผลค้นหามาจาก Revenue Master และรหัสที่ดึงจาก PDF ประกาศ · ${escapeHtml(CFG.DISCLAIMER)}</span></p>`;
  }

  function renderSearchView(section, route) {
    const q = (route.query.q || "").trim();
    section.innerHTML = `
      <div class="container section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Global Search</p>
            <h1 class="h2">ค้นหา</h1>
            <p class="section-desc">ค้นได้ทั้ง ${CFG.SEARCH_SCOPE.map(escapeHtml).join(" · ")}</p>
          </div>
        </div>
        <form class="search-hero" role="search" data-search-form>
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" name="q" value="${escapeHtml(q)}" placeholder="พิมพ์คำค้น เช่น Stroke, N18.5, ODS, CPAP, มะเร็ง" aria-label="คำค้น" autocomplete="off" enterkeyhint="search">
          <button class="btn btn-primary" type="submit">ค้นหา</button>
        </form>
        <div data-search-results></div>
      </div>`;

    const host = section.querySelector("[data-search-results]");
    if (!q) {
      host.innerHTML = suggestionsHtml("คำค้นตัวอย่าง");
      return;
    }
    if (!App.data) {
      host.innerHTML = `<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span> กำลังโหลด Revenue Master…</div>`;
      App.whenData()
        .then(() => { if (App.getRoute() === route) renderSearchView(section, route); })
        .catch((err) => { if (App.getRoute() === route) host.innerHTML = App.loadErrorHtml(err); });
      return;
    }
    const t0 = performance.now();
    const res = runSearch(q);
    host.innerHTML = resultsHtml(res, q, performance.now() - t0);
  }

  App.search = { run: runSearch, highlight, snippet, codeKey, codeMatches };
  App.registerView("search", renderSearchView);
})();
