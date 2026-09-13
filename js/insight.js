/* =========================================================
 * insight.js — Executive Insight บนหน้าภาพรวม (Phase 4)
 * - การ์ดข้อมูลเชิงบริหาร คำนวณจาก Dataset จริง
 * - กราฟ: Payment Method Distribution · Claim System Distribution · Program by Department
 *   (แท่งแนวนอนสีเดียว + ตารางคู่กราฟ)
 * แทรก section หลัง #abc-overview · render เมื่อข้อมูลพร้อมและอยู่หน้าภาพรวม
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[insight.js] ต้องโหลดหลัง app.js");
    return;
  }

  const CFG = App.config;
  const { escapeHtml, fmt } = App.utils;
  const TOP_DEPARTMENTS = 12;
  const state = { rendered: false, charts: [] };

  function ensureSection() {
    let section = document.getElementById("executive-insight");
    if (section) return section;
    const anchor = document.getElementById("abc-overview");
    if (!anchor) return null;
    section = document.createElement("section");
    section.className = "section";
    section.id = "executive-insight";
    section.setAttribute("aria-labelledby", "insightTitle");
    anchor.insertAdjacentElement("afterend", section);
    return section;
  }

  function uniqueCount(records, key) {
    return new Set(records.flatMap((r) => r[key].map((c) => c.code))).size;
  }

  function insightCard(item) {
    return `
      <a class="insight-card${item.tone ? ` tone-${item.tone}` : ""}" href="${item.href}">
        <span class="insight-icon" aria-hidden="true"><i class="bi ${item.icon}"></i></span>
        <span>
          <span class="insight-value">${fmt(item.value)}<span>${escapeHtml(item.unit)}</span></span>
          <span class="insight-label">${escapeHtml(item.label)}</span>
          <span class="insight-sub">${escapeHtml(item.sub)}</span>
        </span>
      </a>`;
  }

  function chartCard(id, title, subtitle, rows, unit) {
    return `
      <article class="card chart-card">
        <header class="card-head"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></header>
        <div class="chart-box" style="height:${rows.length * 26 + 44}px"><canvas id="${id}" role="img" aria-label="${escapeHtml(`${title}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`)}"></canvas></div>
        <details class="chart-table">
          <summary>ดูเป็นตาราง</summary>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>รายการ</th><th class="num">${escapeHtml(unit)}</th></tr></thead>
              <tbody>${rows.map((r) => `<tr><td><a href="${r.href}">${escapeHtml(r.label)}</a></td><td class="num">${fmt(r.value)}</td></tr>`).join("")}</tbody>
            </table>
          </div>
        </details>
      </article>`;
  }

  function barChart(canvas, rows, unit) {
    const T = CFG.THEME;
    const Chart = window.Chart;
    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{
          data: rows.map((r) => r.value),
          backgroundColor: T.BLUE,
          borderRadius: 4,
          borderSkipped: "start",
          barPercentage: 0.78,
          categoryPercentage: 0.9,
          maxBarThickness: 16
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", axis: "y", intersect: false },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0, color: T.MUTED }, grid: { color: T.GRID }, border: { display: false } },
          y: { grid: { display: false }, border: { color: "#E2E8F0" }, ticks: { color: T.INK_2, font: { weight: "500" } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: T.NAVY, padding: 10, cornerRadius: 8, displayColors: false,
            titleFont: { family: T.FONT_FAMILY, weight: "600" }, bodyFont: { family: T.FONT_FAMILY },
            callbacks: { label: (item) => `${fmt(item.raw)} ${unit}`, afterLabel: () => "คลิกเพื่อดูรายละเอียด" }
          }
        }
      }
    });
    const hit = (evt) => chart.getElementsAtEventForMode(evt, "index", { axis: "y", intersect: false }, true);
    canvas.addEventListener("click", (evt) => {
      const points = hit(evt);
      if (points.length) location.hash = rows[points[0].index].href;
    });
    canvas.addEventListener("mousemove", (evt) => { canvas.style.cursor = hit(evt).length ? "pointer" : "default"; });
    return chart;
  }

  function render() {
    if (state.rendered || !App.data || !App.readiness || !App.owners) return;
    const route = App.getRoute();
    if (!route || route.view !== "overview") return;
    const section = ensureSection();
    if (!section) return;
    state.rendered = true;

    const records = App.data.records;
    const statusCount = (s) => records.filter((r) => App.readiness.evaluate(r).status === s).length;
    const systems = App.countTags(records, (r) => r.claim_system_tags);
    const methods = App.countTags(records, (r) => r.payment_method_tags);
    const owners = App.owners.model().all
      .filter((d) => d.records.length)
      .sort((a, b) => b.records.length - a.records.length);
    const icd10 = uniqueCount(records, "icd10");
    const icd9 = uniqueCount(records, "icd9");
    const gpuid = uniqueCount(records, "drug_codes");
    const pairs = records.reduce((sum, r) => sum + Object.keys(r.pair_groups || {}).length, 0);

    /* มิติที่ทำให้ยังไม่ Complete มากที่สุด (สถานะ บางส่วน / ต้องตรวจสอบ) */
    const blocker = App.readiness.DIMENSIONS
      .map((d) => ({
        key: d.key, label: d.label,
        count: records.filter((r) => ["partial", "review"].includes(App.readiness.evaluate(r).dims.find((x) => x.key === d.key).state)).length
      }))
      .sort((a, b) => b.count - a.count)[0];

    const cards = [
      {
        icon: "bi-check2-circle", tone: "ok", value: statusCount("Complete"), unit: "Program",
        label: "ข้อมูลพร้อม Claim (Complete)",
        sub: blocker && blocker.count ? `ติดมากที่สุด: ${blocker.label} ${fmt(blocker.count)} Program` : `Readiness Complete จาก ${fmt(records.length)} Program`,
        href: blocker && blocker.count ? `#/readiness?rdim=${blocker.key}` : "#/readiness?rstatus=Complete"
      },
      { icon: "bi-exclamation-triangle", tone: "review", value: statusCount("Needs Review"), unit: "Program", label: "ต้องตรวจประกาศฉบับเต็ม", sub: "Readiness Needs Review", href: `#/readiness?rstatus=${encodeURIComponent("Needs Review")}` },
      systems[0] && { icon: "bi-send", value: systems[0].count, unit: "Program", label: `ส่งผ่าน ${systems[0].value}`, sub: `ระบบ Claim ที่ใช้มากที่สุด จาก ${fmt(systems.length)} ระบบ`, href: "#/claim-system" },
      owners[0] && { icon: "bi-building", value: owners[0].records.length, unit: "Program", label: `${owners[0].name} เป็นเจ้าภาพ`, sub: "หน่วยงานที่เกี่ยวข้องมากที่สุด", href: App.owners.href(owners[0]) },
      methods[0] && { icon: "bi-cash-coin", value: methods[0].count, unit: "Program", label: `จ่ายแบบ ${methods[0].value}`, sub: `Payment Method ที่พบมากที่สุด จาก ${fmt(methods.length)} รูปแบบ`, href: `#/payment?pay=${encodeURIComponent(methods[0].value)}` },
      { icon: "bi-upc-scan", value: icd10 + icd9 + gpuid, unit: "รหัส", label: "รหัสที่ดึงได้พร้อมเลขหน้า", sub: `ICD-10 ${fmt(icd10)} · ICD-9-CM ${fmt(icd9)} · GPUID ${fmt(gpuid)} · Pair ${fmt(pairs)} แถว`, href: "#/codes" }
    ].filter(Boolean);

    const methodRows = methods.map((m) => ({ label: m.value, value: m.count, href: `#/payment?pay=${encodeURIComponent(m.value)}` }));
    const systemRows = systems.map((s) => ({ label: s.value, value: s.count, href: "#/claim-system" }));
    const deptRows = owners.slice(0, TOP_DEPARTMENTS).map((d) => ({ label: d.name, value: d.records.length, href: App.owners.href(d) }));

    section.innerHTML = `
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Executive Insight</p>
            <h2 id="insightTitle">ข้อมูลเชิงบริหารจาก Revenue Master</h2>
            <p class="section-desc">คำนวณจาก Dataset จริง ${fmt(records.length)} Program · 1 Program อาจมีหลายวิธีจ่าย / หลายระบบ / หลายหน่วยงาน · คลิกการ์ดหรือแท่งกราฟเพื่อดูรายละเอียด</p>
          </div>
        </div>
        <div class="insight-grid">${cards.map(insightCard).join("")}</div>
        <div class="insight-charts">
          ${chartCard("chartPayment", "Payment Method Distribution", "จำนวน Program ต่อวิธีจ่าย", methodRows, "Program")}
          ${chartCard("chartSystem", "Claim System Distribution", "จำนวน Program ต่อระบบ Claim", systemRows, "Program")}
          ${chartCard("chartDepartment", "Program by Department", `หน่วยงาน ${TOP_DEPARTMENTS} อันดับแรก`, deptRows, "Program")}
        </div>
      </div>`;

    if (typeof window.Chart === "undefined") {
      section.querySelectorAll(".chart-box").forEach((box) => { box.hidden = true; });
      section.querySelectorAll(".chart-table").forEach((details) => { details.open = true; });
      return;
    }
    try {
      state.charts = [
        barChart(section.querySelector("#chartPayment"), methodRows, "Program"),
        barChart(section.querySelector("#chartSystem"), systemRows, "Program"),
        barChart(section.querySelector("#chartDepartment"), deptRows, "Program")
      ];
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => state.charts.forEach((c) => c.update("none")));
      }
    } catch (err) {
      console.error("[insight.js] chart error", err);
      section.querySelectorAll(".chart-table").forEach((details) => { details.open = true; });
    }
  }

  const tryRender = () => setTimeout(render, 0);
  App.whenData().then(tryRender).catch(() => {});
  window.addEventListener("hashchange", tryRender);
})();
