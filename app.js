/* app.js — Traffic Queue Clean (Branch-based) — FIXED
   Works with: display.html / staff.html / admin.html
   Storage: GUN (public peers) + branch namespace
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad2 = (n) => String(n).padStart(2, "0");
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  async function sha256(text) {
    const enc = new TextEncoder().encode(String(text));
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function safeJSON(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
  }

  function say(txt) {
    const el = $("#msg");
    if (!el) return;
    el.textContent = txt;
    el.classList.remove("ok", "bad");
    if (/✅|تم|جاهز|حفظ/.test(txt)) el.classList.add("ok");
    if (/خطأ|غير صحيح|فشل|أدخل/.test(txt)) el.classList.add("bad");
  }

  // ---------- GUN init ----------
  function makeGun() {
    // Public relays (best effort)
    const peers = [
      "https://gun-manhattan.herokuapp.com/gun",
      "https://try.axe.eco/gun",
      "https://test.era.eco/gun",
    ];
    return Gun({ peers });
  }

  const gun = makeGun();

  // Root namespace per app
  function appRoot() {
    return gun.get("traffic_queue_clean");
  }

  // Branch namespace
  function branchRoot(branch) {
    return appRoot().get(String(branch || "SOHAR").toUpperCase());
  }

  // ---------- Defaults ----------
  const DEFAULT_TICKER =
    "يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح";

  const defaults = () => ({
    settings: {
      instituteName: "معهد السلامة المرورية",
      historyLimit: 15,
      tickerText: DEFAULT_TICKER,
      autoDailyReset: false,
      lastResetDate: "",
    },
    auth: { adminHash: "" },         // sha256(pin)
    staffUsers: {},                  // username -> sha256(pin)
    current: { number: "--", gender: "", staff: "", ts: 0 },
    history: { men: [], women: [] }, // arrays
    note: { text: "", staff: "", ts: 0 },
    centerImage: { dataUrl: "", name: "", ts: 0 },
    chat: [],                        // {from,text,ts}
    stats: { date: todayKey(), men: 0, women: 0, total: 0 },
  });

  // ---------- Branch selection ----------
  function getBranchFromURL() {
    const u = new URL(location.href);
    return (u.searchParams.get("branch") || "").trim();
  }

  function getBranch() {
    const fromUrl = getBranchFromURL();
    if (fromUrl) return fromUrl.toUpperCase();
    const saved = (localStorage.getItem("tq_branch") || "").trim();
    return (saved || "SOHAR").toUpperCase();
  }

  function setBranch(branch) {
    const b = String(branch || "SOHAR").toUpperCase();
    localStorage.setItem("tq_branch", b);
    // Keep URL consistent (without breaking other params)
    const u = new URL(location.href);
    u.searchParams.set("branch", b);
    history.replaceState(null, "", u.toString());
    return b;
  }

  // ---------- Data I/O ----------
  function getNode(b) {
    return branchRoot(b);
  }

  function ensureBase(b) {
    const ref = getNode(b);
    const def = defaults();
    // Ensure essential nodes exist (idempotent)
    ref.get("settings").once((v) => { if (!v) ref.get("settings").put(def.settings); });
    ref.get("auth").once((v) => { if (!v) ref.get("auth").put(def.auth); });
    ref.get("staffUsers").once((v) => { if (!v) ref.get("staffUsers").put(def.staffUsers); });
    ref.get("current").once((v) => { if (!v) ref.get("current").put(def.current); });
    ref.get("history").once((v) => { if (!v) ref.get("history").put(def.history); });
    ref.get("note").once((v) => { if (!v) ref.get("note").put(def.note); });
    ref.get("centerImage").once((v) => { if (!v) ref.get("centerImage").put(def.centerImage); });
    ref.get("chat").once((v) => { if (!v) ref.get("chat").put(def.chat); });
    ref.get("stats").once((v) => { if (!v) ref.get("stats").put(def.stats); });
    return ref;
  }

  // ---------- Auth ----------
  async function setAdminIfEmpty(branch, pin) {
    const ref = getNode(branch);
    const hash = await sha256(pin);

    return await new Promise((resolve) => {
      ref.get("auth").once((auth) => {
        const adminHash = (auth && auth.adminHash) ? String(auth.adminHash) : "";
        if (!adminHash) {
          ref.get("auth").put({ adminHash: hash });
          resolve({ ok: true, first: true });
        } else {
          resolve({ ok: true, first: false });
        }
      });
    });
  }

  async function requireAdmin(branch, pin) {
    const ref = getNode(branch);
    const hash = await sha256(pin);

    return await new Promise((resolve) => {
      ref.get("auth").once((auth) => {
        const adminHash = (auth && auth.adminHash) ? String(auth.adminHash) : "";
        if (!adminHash) return resolve({ ok: false, error: "NO_ADMIN_SET" });
        resolve({ ok: adminHash === hash });
      });
    });
  }

  async function requireStaff(branch, username, pin) {
    const ref = getNode(branch);
    const u = String(username || "").trim();
    if (!u) return { ok: false };

    const hash = await sha256(pin);

    return await new Promise((resolve) => {
      ref.get("staffUsers").once((users) => {
        users = users || {};
        const saved = users[u];
        resolve({ ok: !!saved && String(saved) === hash });
      });
    });
  }

  // ---------- Resets / Stats ----------
  function resetCalls(ref, which /* men|women|both */) {
    if (which === "men" || which === "both") ref.get("history").put({ men: [] });
    if (which === "women" || which === "both") ref.get("history").put({ women: [] });
  }

  function resetCurrent(ref) {
    ref.get("current").put({ number: "--", gender: "", staff: "", ts: Date.now() });
  }

  function resetStats(ref) {
    ref.get("stats").put({ date: todayKey(), men: 0, women: 0, total: 0 });
  }

  function applyDailyAutoReset(branch) {
    const ref = getNode(branch);
    ref.get("settings").once((s) => {
      s = s || {};
      const enabled = !!s.autoDailyReset;
      if (!enabled) return;

      const last = String(s.lastResetDate || "");
      const today = todayKey();
      if (last === today) return;

      // Perform reset for this branch
      resetCalls(ref, "both");
      resetCurrent(ref);
      resetStats(ref);

      // Save last reset date
      ref.get("settings").put({ lastResetDate: today });
    });
  }

  // ---------- UI render helpers ----------
  function renderHistoryList(container, arr, max, boxMode = true) {
    if (!container) return;
    container.innerHTML = "";
    const list = (Array.isArray(arr) ? arr : []).slice(-max).reverse();
    for (const item of list) {
      const n = (typeof item === "object" && item) ? item.number : item;
      const div = document.createElement("div");
      div.className = boxMode ? "numBox" : "row";
      div.textContent = String(n);
      container.appendChild(div);
    }
  }

  function setConn(ok) {
    const el = $("#conn");
    if (!el) return;
    el.textContent = ok ? "الحالة: متصل ✅" : "الحالة: غير متصل...";
  }

  // ---------- Display ----------
  function initDisplay() {
    const branch = getBranch();
    setBranch(branch);
    const ref = ensureBase(branch);

    setConn(true);
    applyDailyAutoReset(branch);

    // Live updates
    ref.get("settings").on((s) => {
      s = s || {};
      const inst = $("#instName");
      if (inst) inst.textContent = s.instituteName || "معهد السلامة المرورية";
      const ticker = $("#tickerText");
      if (ticker) ticker.textContent = s.tickerText || DEFAULT_TICKER;
    });

    ref.get("current").on((c) => {
      c = c || {};
      const n = $("#curNumber");
      if (n) n.textContent = c.number || "--";
      const g = $("#genderLabel");
      if (g) {
        g.textContent = c.gender === "women" ? "نساء" : (c.gender === "men" ? "رجال" : "");
      }
      const lc = $("#lastCall");
      if (lc) {
        if (c.ts) {
          const d = new Date(c.ts);
          lc.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
        } else lc.textContent = "";
      }
    });

    ref.get("note").on((n) => {
      n = n || {};
      const noteSpan = $("#noteSpan");
      if (noteSpan) noteSpan.textContent = n.text || "";
    });

    ref.get("history").on((h) => {
      h = h || {};
      ref.get("settings").once((s) => {
        const limit = Math.max(3, Math.min(60, parseInt((s && s.historyLimit) || "15", 10)));
        renderHistoryList($("#menList"), h.men || [], limit, true);
        renderHistoryList($("#womenList"), h.women || [], limit, true);
      });
    });

    ref.get("centerImage").on((img) => {
      img = img || {};
      const wrap = $("#centerImgWrap");
      const el = $("#centerImg");
      if (!el || !wrap) return;
      if (img.dataUrl) {
        el.src = img.dataUrl;
        wrap.style.display = "block";
      } else {
        wrap.style.display = "none";
      }
    });
  }

  // ---------- Staff ----------
  function initStaff() {
    const branch = getBranch();
    setBranch(branch);
    const ref = ensureBase(branch);

    setConn(true);
    applyDailyAutoReset(branch);

    // Branch UI
    const branchSelect = $("#branchSelect");
    const branchValue = $("#branchValue");
    if (branchValue) branchValue.textContent = branch;

    if (branchSelect) {
      // If the HTML already contains options, keep them. Ensure current selection.
      [...branchSelect.options].forEach((o) => {
        if (o.value && o.value.toUpperCase() === branch) branchSelect.value = o.value;
      });
    }

    $("#setBranch") && ($("#setBranch").onclick = () => {
      const b = (branchSelect && branchSelect.value) ? branchSelect.value : "SOHAR";
      const nb = setBranch(b);
      location.href = new URL(location.href).toString(); // reload to apply
      return nb;
    });

    // Populate staff usernames
    const userSel = $("#username");
    const userPin = $("#userPin");
    ref.get("staffUsers").on((users) => {
      users = users || {};
      if (!userSel) return;
      const current = userSel.value;
      userSel.innerHTML = `<option value="">اختر…</option>`;
      Object.keys(users).sort().forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u; opt.textContent = u;
        userSel.appendChild(opt);
      });
      if (current && users[current]) userSel.value = current;
    });

    // Current preview
    ref.get("current").on((c) => {
      c = c || {};
      const el = $("#currentNum");
      if (el) el.textContent = c.number || "--";
    });

    // Call logic
    async function doCall(number, gender) {
      const username = userSel ? userSel.value : "";
      const pin = userPin ? userPin.value : "";
      if (!username || !pin) { say("أدخل اسم المستخدم + الرقم"); return; }

      const ok = await requireStaff(branch, username, pin);
      if (!ok.ok) { say("لا توجد صلاحية / الرقم غير صحيح"); return; }

      const num = String(number || "").trim();
      if (!/^\d+$/.test(num)) { say("أدخل رقم صحيح"); return; }
      if (gender !== "men" && gender !== "women") { say("اختر النوع"); return; }

      const now = Date.now();
      // Update current
      ref.get("current").put({ number: num, gender, staff: username, ts: now });

      // Update history (append)
      ref.get("history").once((h) => {
        h = h || { men: [], women: [] };
        const s = h[gender] || [];
        s.push({ number: num, staff: username, ts: now });
        ref.get("history").put({ [gender]: s });
      });

      // Update stats
      ref.get("stats").once((st) => {
        st = st || { date: todayKey(), men: 0, women: 0, total: 0 };
        const tk = todayKey();
        if (st.date !== tk) st = { date: tk, men: 0, women: 0, total: 0 };
        if (gender === "men") st.men += 1;
        if (gender === "women") st.women += 1;
        st.total = (st.men || 0) + (st.women || 0);
        ref.get("stats").put(st);
      });

      say("تم النداء ✅");
    }

    $("#callNext") && ($("#callNext").onclick = async () => {
      const num = $("#ticketNum") ? $("#ticketNum").value : "";
      const gender = $("#gender") ? $("#gender").value : "";
      await doCall(num, gender);
    });

    // Optional: "طلب التالي" يمكن تخليه فقط يرسل تنبيه/رسالة للمدير
    $("#requestNext") && ($("#requestNext").onclick = async () => {
      const username = userSel ? userSel.value : "";
      const pin = userPin ? userPin.value : "";
      if (!username || !pin) { say("أدخل اسم المستخدم + الرقم"); return; }
      const ok = await requireStaff(branch, username, pin);
      if (!ok.ok) { say("لا توجد صلاحية / الرقم غير صحيح"); return; }

      const now = Date.now();
      // Put a short note to admin chat
      const msg = { from: username, text: "طلب التالي", ts: now };
      ref.get("chat").once((arr) => {
        arr = Array.isArray(arr) ? arr : [];
        arr.push(msg);
        ref.get("chat").put(arr);
      });
      say("تم الإرسال ✅");
    });

    // Chat (Staff -> Admin)
    function renderChat(listEl, arr) {
      if (!listEl) return;
      listEl.innerHTML = "";
      arr = Array.isArray(arr) ? arr : [];
      const last = arr.slice(-30);
      for (const m of last) {
        const row = document.createElement("div");
        row.className = "chatRow";
        const who = document.createElement("div");
        who.className = "chatWho";
        who.textContent = m.from || "—";
        const txt = document.createElement("div");
        txt.className = "chatTxt";
        txt.textContent = m.text || "";
        row.appendChild(who); row.appendChild(txt);
        listEl.appendChild(row);
      }
      listEl.scrollTop = listEl.scrollHeight;
    }

    const chatList = $("#chatListStaff");
    ref.get("chat").on((arr) => renderChat(chatList, arr));

    $("#sendChatStaff") && ($("#sendChatStaff").onclick = async () => {
      const username = userSel ? userSel.value : "";
      const pin = userPin ? userPin.value : "";
      if (!username || !pin) { say("أدخل اسم المستخدم + الرقم"); return; }
      const ok = await requireStaff(branch, username, pin);
      if (!ok.ok) { say("لا توجد صلاحية / الرقم غير صحيح"); return; }

      const text = ($("#chatTextStaff")?.value || "").trim();
      if (!text) { say("اكتب رسالة"); return; }

      const msg = { from: username, text, ts: Date.now() };
      ref.get("chat").once((arr) => {
        arr = Array.isArray(arr) ? arr : [];
        arr.push(msg);
        ref.get("chat").put(arr);
      });

      $("#chatTextStaff").value = "";
      say("تم الإرسال ✅");
    });

    $("#clearChatStaff") && ($("#clearChatStaff").onclick = async () => {
      const username = userSel ? userSel.value : "";
      const pin = userPin ? userPin.value : "";
      if (!username || !pin) { say("أدخل اسم المستخدم + الرقم"); return; }
      const ok = await requireStaff(branch, username, pin);
      if (!ok.ok) { say("لا توجد صلاحية / الرقم غير صحيح"); return; }
      // staff can clear their view only? We'll not clear global chat here.
      say("تم");
    });
  }

  // ---------- Admin ----------
  function initAdmin() {
    const branch = getBranch();
    setBranch(branch);
    const ref = ensureBase(branch);

    setConn(true);
    applyDailyAutoReset(branch);

    // Branch UI
    const branchValue = $("#branchValue");
    if (branchValue) branchValue.textContent = branch;

    const branchSelect = $("#branchSelect");
    if (branchSelect) {
      [...branchSelect.options].forEach((o) => {
        if (o.value && o.value.toUpperCase() === branch) branchSelect.value = o.value;
      });
    }

    $("#setBranch") && ($("#setBranch").onclick = () => {
      const b = (branchSelect && branchSelect.value) ? branchSelect.value : "SOHAR";
      setBranch(b);
      location.href = new URL(location.href).toString(); // reload
    });

    // Load settings into inputs
    ref.get("settings").on((s) => {
      s = s || {};
      if ($("#instituteName")) $("#instituteName").value = s.instituteName || "معهد السلامة المرورية";
      if ($("#historyLimit")) $("#historyLimit").value = String(s.historyLimit ?? 15);
      if ($("#tickerText")) $("#tickerText").value = s.tickerText || DEFAULT_TICKER;
      if ($("#autoDailyReset")) $("#autoDailyReset").checked = !!s.autoDailyReset;
    });

    // Stats display
    ref.get("stats").on((st) => {
      st = st || { date: todayKey(), men: 0, women: 0, total: 0 };
      if ($("#statsDate")) $("#statsDate").textContent = st.date || todayKey();
      if ($("#statsMen")) $("#statsMen").textContent = String(st.men ?? 0);
      if ($("#statsWomen")) $("#statsWomen").textContent = String(st.women ?? 0);
      if ($("#statsTotal")) $("#statsTotal").textContent = String(st.total ?? ((st.men || 0) + (st.women || 0)));
    });

    // Admin note
    ref.get("note").on((n) => {
      n = n || {};
      if ($("#adminNote")) $("#adminNote").value = n.text || "";
    });

    // Staff list render
    const staffList = $("#staffList");
    function renderStaff(users) {
      if (!staffList) return;
      users = users || {};
      const names = Object.keys(users).sort();
      staffList.innerHTML = "";
      if (!names.length) {
        staffList.innerHTML = `<div class="help">لا يوجد موظفين بعد.</div>`;
        return;
      }
      for (const u of names) {
        const row = document.createElement("div");
        row.className = "staffRow";
        row.innerHTML = `
          <div class="staffName">${u}</div>
          <button class="danger small">حذف</button>
        `;
        row.querySelector("button").onclick = async () => {
          const pin = ($("#adminPin")?.value || "").trim();
          if (pin.length < 4) { say("أدخل رقم المدير"); return; }
          const first = await setAdminIfEmpty(branch, pin);
          if (first.ok && first.first) { say("تم تعيين رقم المدير ✅ اضغط الحذف مرة أخرى"); return; }
          const ok = await requireAdmin(branch, pin);
          if (!ok.ok) { say("رقم المدير غير صحيح"); return; }

          ref.get("staffUsers").once((cur) => {
            cur = cur || {};
            delete cur[u];
            ref.get("staffUsers").put(cur);
          });
          say("تم حذف الموظف ✅");
        };
        staffList.appendChild(row);
      }
    }
    ref.get("staffUsers").on(renderStaff);

    // Save settings
    $("#saveSettings") && ($("#saveSettings").onclick = async () => {
      const pin = ($("#adminPin")?.value || "").trim();
      if (pin.length < 4) { say("أدخل رقم المدير"); return; }

      const first = await setAdminIfEmpty(branch, pin);
      if (first.ok && first.first) { say("تم تعيين رقم المدير ✅ اضغط حفظ الإعدادات مرة أخرى"); return; }

      const ok = await requireAdmin(branch, pin);
      if (!ok.ok) { say("رقم المدير غير صحيح"); return; }

      const inst = ($("#instituteName")?.value || "").trim() || "معهد السلامة المرورية";
      const lim = Math.max(3, Math.min(60, parseInt(($("#historyLimit")?.value || "15"), 10)));
      const tick = ($("#tickerText")?.value || "").trim() || DEFAULT_TICKER;
      const auto = !!($("#autoDailyReset") && $("#autoDailyReset").checked);

      ref.get("settings").put({
        instituteName: inst,
        historyLimit: lim,
        tickerText: tick,
        autoDailyReset: auto,
      });

      say("تم حفظ الإعدادات ✅");
    });

    // Save admin note
    $("#saveAdminNote") && ($("#saveAdminNote").onclick = async () => {
      const pin = ($("#adminPin")?.value || "").trim();
      if (pin.length < 4) { say("أدخل رقم المدير"); return; }

      const first = await setAdminIfEmpty(branch, pin);
      if (first.ok && first.first) { say("تم تعيين رقم المدير ✅ اضغط حفظ الملاحظة مرة أخرى"); return; }

      const ok = await requireAdmin(branch, pin);
      if (!ok.ok) { say("رقم المدير غير صحيح"); return; }

      ref.get("note").put({
        text: ($("#adminNote")?.value || "").trim(),
        staff: "المدير",
        ts: Date.now(),
      });

      say("تم حفظ الملاحظة ✅");
    });

    // Add staff
    $("#addStaff") && ($("#addStaff").onclick = async () => {
      const pin = ($("#adminPin")?.value || "").trim();
      if (pin.length < 4) { say("أدخل رقم المدير"); return; }

      const first = await setAdminIfEmpty(branch, pin);
      if (first.ok && first.first) { say("تم تعيين رقم المدير ✅ اضغط إضافة موظف مرة أخرى"); return; }

      const ok = await requireAdmin(branch, pin);
      if (!ok.ok) { say("رقم المدير غير صحيح"); return; }

      const username = ($("#newUsername")?.value || "").trim();
      const userPin = ($("#newUserPin")?.value || "").trim();
      if (!username || userPin.length < 4) { say("أدخل اسم الموظف + رقم (4 أرقام أو أكثر)"); return; }

      const hash = await sha256(userPin);
      ref.get("staffUsers").once((cur) => {
        cur = cur || {};
        cur[username] = hash;
        ref.get("staffUsers").put(cur);
      });

      $("#newUsername").value = "";
      $("#newUserPin").value = "";
      say("تمت إضافة الموظف ✅");
    });

    // Reset buttons (branch scoped)
    async function adminGate() {
      const pin = ($("#adminPin")?.value || "").trim();
      if (pin.length < 4) { say("أدخل رقم المدير"); return { ok: false }; }

      const first = await setAdminIfEmpty(branch, pin);
      if (first.ok && first.first) { say("تم تعيين رقم المدير ✅ أعد المحاولة"); return { ok: false }; }

      const ok = await requireAdmin(branch, pin);
      if (!ok.ok) { say("رقم المدير غير صحيح"); return { ok: false }; }
      return { ok: true };
    }

    $("#resetCallsMen") && ($("#resetCallsMen").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("تصفير نداءات الرجال لهذا الفرع؟")) return;
      resetCalls(ref, "men");
      say("تم تصفير الرجال ✅");
    });

    $("#resetCallsWomen") && ($("#resetCallsWomen").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("تصفير نداءات النساء لهذا الفرع؟")) return;
      resetCalls(ref, "women");
      say("تم تصفير النساء ✅");
    });

    $("#resetCallsBranch") && ($("#resetCallsBranch").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("تصفير نداءات الرجال والنساء لهذا الفرع؟")) return;
      resetCalls(ref, "both");
      say("تم تصفير النداءات ✅");
    });

    $("#resetAll") && ($("#resetAll").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("تصفير النداءات + الرقم الحالي + الإحصائيات لهذا الفرع؟")) return;
      resetCalls(ref, "both");
      resetCurrent(ref);
      resetStats(ref);
      ref.get("settings").put({ lastResetDate: todayKey() }); // prevents double auto reset
      say("تم التصفير الكامل ✅");
    });

    // Center image upload (optional)
    $("#imgFile") && ($("#imgFile").onchange = async (e) => {
      const g = await adminGate(); if (!g.ok) return;
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        ref.get("centerImage").put({ dataUrl: reader.result, name: file.name, ts: Date.now() });
        say("تم رفع الصورة ✅");
      };
      reader.readAsDataURL(file);
    });

    $("#clearImage") && ($("#clearImage").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("حذف الصورة من شاشة العرض؟")) return;
      ref.get("centerImage").put({ dataUrl: "", name: "", ts: Date.now() });
      say("تم حذف الصورة ✅");
    });

    // Chat (Admin <-> Staff)
    function renderChat(listEl, arr) {
      if (!listEl) return;
      listEl.innerHTML = "";
      arr = Array.isArray(arr) ? arr : [];
      const last = arr.slice(-50);
      for (const m of last) {
        const row = document.createElement("div");
        row.className = "chatRow";
        row.innerHTML = `<div class="chatWho">${m.from || "—"}</div><div class="chatTxt"></div>`;
        row.querySelector(".chatTxt").textContent = m.text || "";
        listEl.appendChild(row);
      }
      listEl.scrollTop = listEl.scrollHeight;
    }
    const chatList = $("#chatListAdmin");
    ref.get("chat").on((arr) => renderChat(chatList, arr));

    $("#sendChatAdmin") && ($("#sendChatAdmin").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      const text = ($("#chatTextAdmin")?.value || "").trim();
      if (!text) { say("اكتب رسالة"); return; }
      const msg = { from: "المدير", text, ts: Date.now() };
      ref.get("chat").once((arr) => {
        arr = Array.isArray(arr) ? arr : [];
        arr.push(msg);
        ref.get("chat").put(arr);
      });
      $("#chatTextAdmin").value = "";
      say("تم الإرسال ✅");
    });

    $("#clearChatAdmin") && ($("#clearChatAdmin").onclick = async () => {
      const g = await adminGate(); if (!g.ok) return;
      if (!confirm("مسح الدردشة لهذا الفرع؟")) return;
      ref.get("chat").put([]);
      say("تم مسح الدردشة ✅");
    });

    // Auto reset ticker (every minute)
    setInterval(() => applyDailyAutoReset(branch), 60 * 1000);
  }

  // ---------- Boot: detect page ----------
  function boot() {
    // Run based on unique IDs
    if ($("#curNumber") && $("#menList") && $("#womenList")) return initDisplay();
    if ($("#callNext") && $("#ticketNum") && $("#gender")) return initStaff();
    if ($("#saveSettings") && $("#adminPin")) return initAdmin();
  }

  // Expose init functions if HTML calls them directly
  window.initDisplay = initDisplay;
  window.initStaff = initStaff;
  window.initAdmin = initAdmin;

  document.addEventListener("DOMContentLoaded", boot);
})();
