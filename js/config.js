/* =========================================================
 * config.js — ค่าตั้งค่าระบบ (Public · Read-only)
 * หลักเกณฑ์กองทุน สปสช.ปี2569
 *
 * ⚠ ไฟล์นี้เผยแพร่บน GitHub Pages — ห้ามใส่ข้อมูลลับ
 *   (password, client_secret, API_SECRET, DB password)
 *   และห้ามใส่ข้อมูลรายบุคคลผู้ป่วย (HN/VN/AN/Citizen ID)
 *
 * แหล่งข้อมูลโครงสร้าง (FUND_SUMMARY / CATEGORIES):
 *   Revenue_Master_2569.xlsx — ชีต Executive_Summary, Revenue_Master_2569, Source_Notes
 *   ข้อมูลระดับ Program/รายการบริการ จะแยกไว้ที่ ./data/revenue-master.json (Phase 2)
 * ========================================================= */
(function () {
  "use strict";

  function deepFreeze(obj) {
    Object.values(obj).forEach(function (v) {
      if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    });
    return Object.freeze(obj);
  }

  window.APP_CONFIG = deepFreeze({
    SYSTEM_NAME: "หลักเกณฑ์กองทุน สปสช.ปี2569",
    SYSTEM_SUBTITLE: "แนวทางศึกษาสิทธิประโยชน์ เงื่อนไขการเบิกจ่าย และโอกาสการ Claim รายได้",
    FOOTER_TEXT: "พัฒนาโดย ศูนย์รายได้ โรงพยาบาลแม่สะเรียง",
    VERSION: "version_2609132237", // version_yymmddhhnn
    CURRENT_PHASE: 5,

    /*
     * Owner Matrix — หน่วยงานหลักของโรงพยาบาล และชื่อที่ใช้ในคอลัมน์ "หน่วยงานเจ้าภาพ" ของ Revenue Master
     * (แยกชื่อด้วย + และ /) ชื่อที่ไม่อยู่ใน aliases จะแสดงเป็นหน่วยงานตามชื่อเดิม
     */
    DEPARTMENTS: [
      { id: "revenue", name: "ศูนย์รายได้", icon: "bi-cash-stack", aliases: ["ศูนย์รายได้"] },
      { id: "medrec", name: "เวชระเบียน", icon: "bi-folder2-open", aliases: ["เวชระเบียน", "Coder"] },
      { id: "opd", name: "OPD", icon: "bi-person-badge", aliases: ["OPD"] },
      { id: "ipd", name: "IPD", icon: "bi-hospital", aliases: ["IPD"] },
      { id: "or", name: "OR", icon: "bi-scissors", aliases: ["OR"] },
      { id: "pharmacy", name: "เภสัชกรรม", icon: "bi-capsule", aliases: ["เภสัช", "เภสัชกรรม"] },
      { id: "lab", name: "Lab", icon: "bi-droplet-half", aliases: ["Lab"] },
      { id: "xray", name: "X-Ray", icon: "bi-camera", aliases: ["รังสี"] },
      { id: "pt", name: "กายภาพ", icon: "bi-person-walking", aliases: ["PT", "OT", "กายภาพ"] },
      { id: "ttm", name: "แพทย์แผนไทย", icon: "bi-flower1", aliases: ["แพทย์แผนไทย"] },
      { id: "dental", name: "ทันตกรรม", icon: "bi-emoji-smile", aliases: ["ทันตกรรม", "Dental"] },
      { id: "ncd", name: "คลินิกโรคเรื้อรัง", icon: "bi-heart-pulse", aliases: ["NCD", "NCD clinic"] },
      { id: "refer", name: "ส่งต่อ", icon: "bi-arrow-left-right", aliases: ["Refer"] },
      { id: "finance", name: "การเงิน", icon: "bi-bank", aliases: ["การเงิน"] },
      { id: "it", name: "IT", icon: "bi-pc-display", aliases: ["IT"] }
    ],

    /* ใช้ relative path เท่านั้น (รองรับ https://username.github.io/repository/) */
    PATHS: {
      REVENUE_MASTER: "./data/revenue-master.json",
      LOGO: "" // ใส่ "./assets/logo.png" เมื่อเพิ่มไฟล์โลโก้แล้ว (ว่าง = ใช้ไอคอน)
    },

    FEATURES: {
      LOAD_REVENUE_MASTER: true // สร้างไฟล์ด้วย code/tools/build_revenue_master.py
    },

    THEME: {
      NAVY: "#0B1F3A",
      BLUE: "#2563EB",
      CYAN: "#06B6D4",
      GREEN: "#008C72",
      BG: "#F5F7FA",
      INK: "#0F172A",
      INK_2: "#334155",
      MUTED: "#64748B",
      GRID: "#EEF2F6",
      FONT_FAMILY: "'Prompt', 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif",
      /* สีประจำหมวด — ผ่าน validate_palette (CVD/normal-vision) · Cyan ต้องมี label/ตัวเลขกำกับเสมอ */
      CATEGORY_COLORS: { A: "#2563EB", B: "#008C72", C: "#06B6D4" }
    },

    SOURCE: {
      WORKBOOK: "Revenue_Master_2569.xlsx",
      SUMMARY_SHEET: "Executive_Summary",
      DOCUMENT: "ประกาศสำนักงานหลักประกันสุขภาพแห่งชาติ: รวมประกาศการจ่ายฯ 76 ฉบับ",
      UPDATED: "1 มีนาคม 2569",
      PAGES: 943
    },

    DISCLAIMER:
      "Dashboard นี้เป็นเครื่องมือช่วยศึกษาและบริหารจัดการ ไม่ใช้แทนประกาศและหลักเกณฑ์ฉบับทางการ โปรดตรวจสอบประกาศฉบับล่าสุดก่อนดำเนินการ Claim",

    /* ---------- โครงสร้างกองทุน (ตรวจสอบกับ Executive_Summary แล้ว) ---------- */
    FUND_SUMMARY: {
      funds: 1,
      fundName: "กองทุนหลักประกันสุขภาพแห่งชาติ",
      categories: 3,
      groupsWithAnnouncements: 18,
      announcements: 76
    },

    /*
     * announcements = จำนวนประกาศในชุด 76 ฉบับ (Executive_Summary)
     * firstPage     = หน้าเริ่มต้นของประกาศฉบับแรกในกลุ่ม (คอลัมน์ "หน้าเริ่มต้น" ในเอกสารรวม 943 หน้า)
     * examples      = ตัวอย่าง Program ตามขอบเขตระบบ / ชื่อ Program ใน Revenue Master
     */
    CATEGORIES: [
      {
        code: "A",
        route: "cat-a",
        name: "ภายใต้งบเหมาจ่ายรายหัว",
        announcements: 44,
        groups: [
          { code: "A1", name: "บริการผู้ป่วยนอก", announcements: 3, firstPage: 11, examples: ["OP ทั่วไป", "OP กทม.", "OPAE ในเครือข่าย กทม."] },
          { code: "A2", name: "บริการผู้ป่วยใน", announcements: 11, firstPage: 80, examples: ["IP ทั่วไป", "UCEP", "ORS", "CRRT", "Homeward", "ODS", "MIS", "IMC"] },
          { code: "A31", name: "ปกป้องการได้รับบริการนอกเครือข่าย", announcements: 4, firstPage: 257, examples: ["OPAE", "OP Refer", "OP Anywhere", "สิทธิว่าง", "พาหนะ"] },
          { code: "A32", name: "บริการเพิ่มความมั่นใจด้านคุณภาพ", announcements: 3, firstPage: 284, examples: ["CA Anywhere", "Stroke", "STEMI", "Cleft"] },
          { code: "A33", name: "ลดความเสี่ยงด้านการเงิน", announcements: 7, firstPage: 314, examples: ["Instrument", "อุปกรณ์และอวัยวะเทียม", "CPAP", "CAG", "PCI", "Transplant"] },
          { code: "A34", name: "บริการที่ต้องกำกับการใช้ใกล้ชิด", announcements: 3, firstPage: 513, examples: ["Methadone", "ยา จ.2", "Hemophilia", "ยา CL", "ยากำพร้า", "Antidote"] },
          { code: "A35", name: "บริการเฉพาะโรค", announcements: 10, firstPage: 544, examples: ["Thalassemia", "TB", "Palliative Care", "Rare Disease", "Infertility", "Proton Therapy", "Robotic Surgery", "Advanced Radiation", "AI Chest X-ray"] },
          { code: "A4", name: "ฟื้นฟูสมรรถภาพ", announcements: 1, firstPage: 627, examples: ["Medical rehabilitation"] },
          { code: "A5", name: "แพทย์แผนไทย", announcements: 1, firstPage: 635, examples: ["Thai traditional medicine"] },
          { code: "A6", name: "ค่าเสื่อม", announcements: 1, firstPage: 667, examples: ["Depreciation"] }
        ]
      },
      {
        code: "B",
        route: "cat-b",
        name: "นอกงบเหมาจ่ายรายหัว",
        announcements: 30,
        groups: [
          { code: "B1", name: "HIV / AIDS", announcements: 1, firstPage: 672, examples: ["HIV/AIDS & prevention"] },
          { code: "B2", name: "ไตวายเรื้อรัง", announcements: 1, firstPage: 692, examples: ["CKD/RRT"] },
          { code: "B3", name: "โรคเรื้อรัง", announcements: 3, firstPage: 730, examples: ["DM", "HT", "DM Remission", "CGM", "จิตเวชเรื้อรัง", "Asthma", "COPD"] },
          { code: "B4", name: "พื้นที่กันดาร / เสี่ยงภัย", announcements: 0, firstPage: null, examples: [], note: "ไม่มีประกาศในชุด 76 ฉบับ" },
          { code: "B5", name: "Primary Care / Innovative Services", announcements: 15, firstPage: 752, examples: ["ร้านยา", "คลินิกพยาบาล", "เทคนิคการแพทย์", "เวชกรรม", "ทันตกรรม", "แพทย์แผนไทย", "Telemedicine", "กายภาพบำบัด", "CI"] },
          { code: "B61", name: "บริการร่วม อปท.", announcements: 1, firstPage: 839, examples: ["Diaper / absorbent products"] },
          { code: "B62", name: "กองทุนฟื้นฟูระดับจังหวัด", announcements: 0, firstPage: null, examples: [], note: "ไม่มีฉบับในชุด 76 ฉบับ — ใช้ประกาศคณะกรรมการหลัก" },
          { code: "B63", name: "LTC", announcements: 1, firstPage: 843, examples: ["LTC"] },
          { code: "B7", name: "เงินช่วยเหลือเบื้องต้น", announcements: 0, firstPage: null, examples: [], note: "ไม่มีฉบับในชุด 76 ฉบับ — ใช้ประกาศคณะกรรมการหลัก" },
          { code: "B8", name: "PP / Prevention", announcements: 8, firstPage: 853, examples: ["NPP", "PPB", "PPA", "PPFS", "PPBKK", "PP NCDs", "ฮอร์โมนยืนยันเพศ", "ธนาคารนมแม่", "มิตรภาพบำบัด"] }
        ]
      },
      {
        code: "C",
        route: "cat-c",
        name: "เกี่ยวข้องมากกว่า 1 งบ / อื่น ๆ",
        announcements: 2,
        groups: [
          { code: "C1", name: "บริการเกี่ยวข้องมากกว่า 1 งบ / อื่น ๆ", announcements: 2, firstPage: 933, examples: ["Hepatitis C / HCV"] }
        ]
      }
    ],

    /* KPI ที่ต้องคำนวณจาก Dataset จริง (./data/revenue-master.json) — Phase 2 */
    DATA_KPIS: [
      { key: "programs", label: "จำนวน Program", unit: "Program", icon: "bi-collection" },
      { key: "icd10", label: "รายการ ICD-10", unit: "รหัส", icon: "bi-heart-pulse" },
      { key: "icd9", label: "รายการ ICD-9-CM", unit: "รหัส", icon: "bi-bandaid" },
      { key: "paymentMethods", label: "Payment Method", unit: "รูปแบบ", icon: "bi-cash-stack" },
      { key: "claimSystems", label: "Claim System", unit: "ระบบ", icon: "bi-hdd-network" },
      { key: "feeSchedule", label: "Program แบบ Fee Schedule", unit: "Program", icon: "bi-list-check" }
    ],

    /* ---------- Navigation หลัก (13 เมนู) ---------- */
    NAV: [
      { id: "overview", label: "ภาพรวม", icon: "bi-speedometer2", phase: 1,
        description: "Executive Dashboard ภาพรวมกองทุน" },
      { id: "cat-a", label: "หมวด A", letter: "A", phase: 2,
        description: "ภายใต้งบเหมาจ่ายรายหัว" },
      { id: "cat-b", label: "หมวด B", letter: "B", phase: 2,
        description: "นอกงบเหมาจ่ายรายหัว" },
      { id: "cat-c", label: "หมวด C", letter: "C", phase: 2,
        description: "เกี่ยวข้องมากกว่า 1 งบ / อื่น ๆ" },
      { id: "catalog", label: "Claim Catalog", icon: "bi-table", phase: 3,
        description: "ตารางรายการ Claim แบบ Interactive พร้อม Filter ครบทุกมิติ",
        planned: ["ตาราง หมวด → กลุ่ม → Program → รายการ Claim → หน่วยงานเจ้าภาพ", "Filter หมวด · กลุ่ม · Program · ระบบ Claim · Payment Method", "Filter มี ICD-10 / มี ICD-9", "Detail Drawer: กลุ่มเป้าหมาย → เงื่อนไข → เงินที่จะได้รับ"] },
      { id: "codes", label: "ICD / Procedure", icon: "bi-upc-scan", phase: 3,
        description: "ค้นหา ICD-10 และ ICD-9-CM แล้วดู Program ที่เกี่ยวข้อง",
        planned: ["Sub Tab ICD-10", "Sub Tab ICD-9-CM / Procedure", "Click Code → Program ที่เกี่ยวข้อง", "รองรับ Diagnosis–Procedure Pair"] },
      { id: "payment", label: "อัตราจ่าย", icon: "bi-cash-coin", phase: 3,
        description: "Payment Explorer — วิธีจ่าย อัตรา หน่วย เพดาน และสูตร",
        planned: ["Payment Method · Rate · Unit · Ceiling", "Formula · DRG Version · Point · Global Budget", "Filter Group · Program · Payment Method", "ไม่มีตัวเลข → แสดง “ตรวจสอบอัตราจ่ายตามประกาศฉบับเต็ม”"] },
      { id: "claim-system", label: "ระบบ Claim", icon: "bi-diagram-3", phase: 3,
        description: "Claim System Explorer — e-Claim · NAP · NHSO Health Platform · ระบบเฉพาะ",
        planned: ["จำนวนรายการต่อระบบ Claim", "ข้อมูลที่ต้องส่ง", "Flow: HIS → ตรวจข้อมูล → Claim System → REP → STM → Revenue Database", "หน่วยงานเจ้าภาพ"] },
      { id: "departments", label: "หน่วยงาน", icon: "bi-building", phase: 4,
        description: "Owner Matrix — หน่วยงานใดรับผิดชอบ Program ใด",
        planned: ["ศูนย์รายได้ · เวชระเบียน · OPD · IPD · OR · เภสัชกรรม · Lab ฯลฯ", "Click หน่วยงาน → Program · รายการ Claim · เงื่อนไข", "รหัสสำคัญ และระบบ Claim", "รายงานติดตาม"] },
      { id: "who-claims", label: "ใครต้อง Claim อะไร", icon: "bi-person-check", phase: 4,
        description: "Matrix หน่วยงาน → Program → รายการ Claim → ข้อมูลที่ต้องเตรียม → ระบบ Claim",
        planned: ["Matrix หน่วยงาน × Program", "รายการ Claim ที่ต้องรับผิดชอบ", "ข้อมูลที่ต้องเตรียม", "ดึงจาก Revenue Master จริง"] },
      { id: "readiness", label: "Claim Readiness", icon: "bi-clipboard2-check", phase: 4,
        description: "Checklist ความพร้อมการ Claim ของแต่ละ Program",
        planned: ["Target · Rights · ICD · Procedure Ready", "Service Code · Authorization · Document · Claim System Ready", "Status: Complete · Partial · Needs Review"] },
      { id: "search", label: "ค้นหา", icon: "bi-search", phase: 2,
        description: "Global Search ทั้งระบบ" },
      { id: "sources", label: "แหล่งอ้างอิง", icon: "bi-journal-bookmark", phase: 4,
        description: "รายชื่อประกาศ 76 ฉบับ พร้อมหมวด กลุ่ม และหน้าอ้างอิง",
        planned: ["ชื่อประกาศ · ปี · หมวด · กลุ่ม · หน้า · หมายเหตุ", "เชื่อมกลับไปยัง Program ที่เกี่ยวข้อง", "Disclaimer การใช้งาน"] }
    ],

    SEARCH_SCOPE: ["Program", "โรค", "ICD", "Procedure", "Service Code", "Drug Code", "GPUID", "Instrument", "Lab", "หน่วยงาน"],

    SEARCH_SUGGESTIONS: [
      "Cancer", "มะเร็ง", "Stroke", "STEMI", "ODS", "MIS", "IMC", "Instrument", "CPAP", "CAG",
      "PCI", "HIV", "CKD", "DM", "HT", "Palliative", "PP", "Telemedicine", "LTC"
    ]
  });
})();
