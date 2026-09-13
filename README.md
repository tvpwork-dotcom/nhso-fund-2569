# หลักเกณฑ์กองทุน สปสช.ปี2569

แนวทางศึกษาสิทธิประโยชน์ เงื่อนไขการเบิกจ่าย และโอกาสการ Claim รายได้
พัฒนาโดย ศูนย์รายได้ โรงพยาบาลแม่สะเรียง

Dashboard แบบ Static (HTML + CSS + Vanilla JavaScript) สำหรับเปิดบน **GitHub Pages** ได้ทันที ไม่ต้องใช้ npm, build process หรือ backend

> **Disclaimer** — Dashboard นี้เป็นเครื่องมือช่วยศึกษาและบริหารจัดการ ไม่ใช้แทนประกาศและหลักเกณฑ์ฉบับทางการ โปรดตรวจสอบประกาศฉบับล่าสุดก่อนดำเนินการ Claim

---

## เมนูในระบบ

| เมนู | URL | สิ่งที่ดูได้ |
|---|---|---|
| ภาพรวม | `#/overview` | KPI กองทุน, A/B/C, Executive Insight, คุณภาพข้อมูล |
| หมวด A / B / C | `#/cat-a` → `#/cat-a/A2` → `#/cat-a/A2/RM-011` | หมวด → กลุ่ม → Program → รายละเอียด 1–13 |
| Claim Catalog | `#/catalog` | ตาราง 14 คอลัมน์ + ตัวกรอง + Detail Drawer |
| ICD / Procedure | `#/codes`, `#/codes/icd9` | ค้นรหัส → Program ที่เกี่ยวข้อง + Diagnosis–Procedure Pair |
| อัตราจ่าย | `#/payment` | Payment Method · Rate · Unit · Ceiling · Formula |
| ระบบ Claim | `#/claim-system` | ระบบ Claim · ข้อมูลที่ต้องส่ง · หน่วยงาน |
| หน่วยงาน | `#/departments` | Owner Matrix |
| ใครต้อง Claim อะไร | `#/who-claims` | Matrix หน่วยงาน × กลุ่ม |
| Claim Readiness | `#/readiness` | ความพร้อมข้อมูล 8 มิติ |
| ค้นหา | `#/search?q=` | Global Search |
| แหล่งอ้างอิง | `#/sources` | รายชื่อประกาศ · ปี · หน้า · Disclaimer |

ทุกหน้าแชร์ลิงก์ได้ (ตัวกรองและ Program ที่เปิดอยู่เก็บใน URL)

---

## โครงสร้างไฟล์

```text
index.html                 จุดเริ่มต้น
css/style.css              ธีมและ layout ทั้งหมด
js/config.js               ชื่อระบบ · version · โครงสร้างกองทุน · เมนู · หน่วยงาน (ไม่มีข้อมูลลับ)
js/app.js                  Router (#/...) · เมนู · Breadcrumb · ภาพรวม
js/ux.js                   Error handling · Toast · ออฟไลน์ · กลับขึ้นด้านบน · คัดลอกลิงก์
js/dashboard.js            โหลดและตรวจสอบ data/revenue-master.json · KPI · คุณภาพข้อมูล
js/drilldown.js            หมวด A/B/C → กลุ่ม → Program
js/search.js               Global Search
js/filters.js              ตัวกรองที่ใช้ร่วมกัน
js/detail.js               รายละเอียด Program + Detail Drawer
js/catalog.js · codes.js · payment.js · claim-system.js
js/owners.js · readiness.js · insight.js · sources.js
data/revenue-master.json   ข้อมูล 76 Program (สร้างจากสคริปต์ ไม่แก้ด้วยมือ)
assets/images/             รูปภาพ (ถ้ามี)
.nojekyll                  ให้ GitHub Pages ส่งไฟล์ตรงโดยไม่ผ่าน Jekyll
```

ทุกไฟล์อ้างอิงด้วย relative path (`./css/...`, `./js/...`, `./data/...`) จึงทำงานได้ที่ `https://<username>.github.io/<repository>/`

---

## วิธีเผยแพร่บน GitHub Pages

1. สร้าง repository ใหม่บน GitHub (แนะนำชื่อภาษาอังกฤษ เช่น `nhso-fund-2569`)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ **รวม** `.nojekyll` (ไม่ต้องอัปโหลด `.claude/` — ระบุไว้ใน `.gitignore` แล้ว)
3. ไปที่ **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / folder **/ (root)** → Save
4. รอ 1–2 นาที แล้วเปิด `https://<username>.github.io/<repository>/`

ตรวจหลัง deploy:

- [ ] หน้าภาพรวมแสดง KPI “จำนวน Program 76” และแผงคุณภาพข้อมูลขึ้นว่า “ตรวจสอบความสอดคล้อง … ผ่าน”
- [ ] เปิด `#/catalog` แล้วคลิก Program เห็น Drawer รายละเอียด
- [ ] เปิด `#/codes?q=C15` เห็นรหัส 8 รายการ
- [ ] Footer แสดง version ตรงกับ `js/config.js`

> GitHub Pages แยกตัวพิมพ์ใหญ่–เล็กของชื่อไฟล์ (Windows ไม่แยก) — สคริปต์ตรวจสอบด้านล่างเช็กให้แล้ว
> GitHub Pages เก็บ cache ประมาณ 10 นาที หากแก้แล้วยังไม่เห็นผล ให้กด Ctrl+F5

---

## การอัปเดตข้อมูล (บนเครื่องผู้ดูแล)

สคริปต์อยู่นอก repository ที่ `code/tools/` (ต้องมี Python 3 และ `pip install openpyxl pypdf`)

```bash
# 1) สร้าง data/revenue-master.json จาก Excel + PDF ประกาศ
python build_revenue_master.py

# 2) ตรวจคุณภาพข้อมูลและความพร้อม deploy (ต้องไม่มี ERROR)
python validate_revenue_master.py

# 3) (ถ้าต้องการ) สร้างไฟล์ HTML เดียวสำหรับส่งต่อ → code/dist/nhso_fund_dashboard_2569.html
python bundle_single_html.py
```

เมื่อแก้ไขระบบ ให้ปรับ `VERSION` ใน `js/config.js` เป็น `version_yymmddhhnn` (เช่น `version_2609132045`)

### หลักการข้อมูล

- ไม่สร้าง ICD-10 / ICD-9-CM / อัตราจ่าย / เงื่อนไข / Service Code ขึ้นเอง — ทุกค่ามาจาก Revenue Master หรือข้อความใน PDF พร้อมเลขหน้า
- ข้อมูลที่ไม่มีแสดง “ไม่ระบุใน Revenue Master” หรือ “โปรดตรวจสอบประกาศฉบับเต็ม”
- ไม่ลบ record ที่ข้อมูลไม่ครบ ใช้สถานะ Complete / Partial / Needs Review แทน
- PDF ประกาศบางส่วนเป็นภาษาไทยที่อ่านไม่ได้ (ฟอนต์ไม่มีตารางแปลงอักษร) หรือเป็นภาพ — ข้อมูลส่วนนั้นยังดึงไม่ได้

---

## ความปลอดภัย

- เวอร์ชันนี้เป็น **Public Read-only** — ไม่มี HN / VN / AN / เลขบัตรประชาชน หรือข้อมูลรายบุคคลผู้ป่วย
- ห้าม commit `password`, `client_secret`, `API_SECRET`, DB password ลง repository
- หากอนาคตต้องมี Import / Edit / Delete ให้ใช้ GitHub Pages → Google Identity Services → Google Apps Script → Google Sheets พร้อม RBAC และ Audit Log ที่ backend
