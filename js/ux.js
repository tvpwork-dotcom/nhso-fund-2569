/* =========================================================
 * ux.js — Error handling + UX polish (Phase 5)
 * - Toast: App.ux.toast(message, { tone: "ok" | "error", icon, duration })
 * - จับ error ที่ไม่คาดคิดทั้งหน้า (error / unhandledrejection) → แจ้งผู้ใช้ ไม่ปล่อยหน้าว่าง
 * - แจ้งสถานะออฟไลน์ · ปุ่มกลับขึ้นด้านบน
 * - [data-copy-link="#/..."] คัดลอกลิงก์ (ค่าว่าง = URL ปัจจุบัน)
 * - [data-retry-load] โหลดหน้าใหม่เมื่อโหลดข้อมูลไม่สำเร็จ
 * ต้องโหลดหลัง app.js
 * ========================================================= */
(function () {
  "use strict";

  const App = window.App;
  if (!App) {
    console.error("[ux.js] ต้องโหลดหลัง app.js");
    return;
  }

  const { escapeHtml } = App.utils;
  const ERROR_THROTTLE_MS = 5000;
  let stack = null;
  let lastErrorAt = 0;

  const onReady = (fn) =>
    (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn());

  /* ---------------- Toast ---------------- */
  function ensureStack() {
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, opts) {
    const options = opts || {};
    if (!document.body) return;
    const el = document.createElement("div");
    el.className = `toast${options.tone ? ` is-${options.tone}` : ""}`;
    el.innerHTML = `
      <i class="bi ${options.icon || "bi-info-circle"}" aria-hidden="true"></i>
      <span>${escapeHtml(message)}</span>
      <button type="button" aria-label="ปิดข้อความ"><i class="bi bi-x-lg" aria-hidden="true"></i></button>`;
    el.querySelector("button").addEventListener("click", () => el.remove());
    ensureStack().appendChild(el);
    setTimeout(() => el.remove(), options.duration || 4000);
  }

  /* ---------------- Global error handling ---------------- */
  function reportError(err) {
    console.error("[ux.js] unexpected error:", err);
    const now = Date.now();
    if (now - lastErrorAt < ERROR_THROTTLE_MS) return;
    lastErrorAt = now;
    toast("เกิดข้อผิดพลาดบางส่วนในการแสดงผล — ลองรีเฟรชหน้า หากยังพบปัญหาโปรดแจ้งศูนย์รายได้", {
      tone: "error", icon: "bi-exclamation-octagon", duration: 7000
    });
  }

  window.addEventListener("error", (evt) => {
    if (evt && (evt.error || evt.message)) reportError(evt.error || evt.message);
  });
  window.addEventListener("unhandledrejection", (evt) => reportError(evt && evt.reason));

  /* ---------------- Online / offline ---------------- */
  function updateOnline() {
    let banner = document.getElementById("offlineBanner");
    if (navigator.onLine !== false) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "offlineBanner";
      banner.className = "offline-banner";
      banner.setAttribute("role", "status");
      banner.innerHTML = `<i class="bi bi-wifi-off" aria-hidden="true"></i> ออฟไลน์ — ข้อมูลที่โหลดแล้วยังดูได้ แต่ฟอนต์ ไอคอน และกราฟอาจไม่แสดง`;
      document.body.appendChild(banner);
    }
  }

  window.addEventListener("offline", updateOnline);
  window.addEventListener("online", () => {
    updateOnline();
    toast("กลับมาออนไลน์แล้ว", { tone: "ok", icon: "bi-wifi" });
  });

  /* ---------------- Back to top ---------------- */
  function initBackToTop() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "back-to-top";
    btn.setAttribute("aria-label", "กลับขึ้นด้านบน");
    btn.innerHTML = `<i class="bi bi-arrow-up" aria-hidden="true"></i>`;
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const main = document.getElementById("main");
      if (main) main.focus({ preventScroll: true });
    });
    document.body.appendChild(btn);

    const update = () => btn.classList.toggle("is-visible", window.scrollY > 700);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("hashchange", () => setTimeout(update, 0));
    update();
  }

  /* ---------------- Copy link / retry ---------------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* fall back below */ }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }

  document.addEventListener("click", async (evt) => {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target) return;

    const copyBtn = target.closest("[data-copy-link]");
    if (copyBtn) {
      evt.preventDefault();
      const hash = copyBtn.getAttribute("data-copy-link");
      const url = hash ? `${location.origin}${location.pathname}${hash}` : location.href;
      const ok = await copyText(url);
      toast(ok ? "คัดลอกลิงก์แล้ว" : `คัดลอกไม่สำเร็จ — ${url}`, {
        tone: ok ? "ok" : "error", icon: ok ? "bi-link-45deg" : "bi-exclamation-triangle", duration: ok ? 2500 : 8000
      });
      return;
    }

    if (target.closest("[data-retry-load]")) {
      evt.preventDefault();
      location.reload();
    }
  });

  onReady(() => {
    initBackToTop();
    updateOnline();
  });

  App.ux = { toast, copyText };
})();
