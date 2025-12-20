/* Traffic Queue Clean (client-only) */
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  async function sha256(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function beep(kind="men"){
    try{
      const ctx = beep._ctx || (beep._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const now = ctx.currentTime;
      const play = (f, t0, dur, gain=0.32, type="sine")=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0+dur+0.02);
      };
      play(kind==="women"?920:660, now, 0.24, 0.34, "sine");
      play(kind==="women"?1180:740, now+0.28, 0.18, 0.28, "triangle");
    }catch(e){}
  }

  // "الفرع" هو نفسه مفتاح البيانات
  function branch(){
  const url = new URL(location.href);
  const b =
    (url.searchParams.get("branch") || url.searchParams.get("room") || localStorage.getItem("tq_branch") || "SOHAR")
      .toUpperCase();
  localStorage.setItem("tq_branch", b);
  return b;
}

const BRANCH_NAME = {
  "SOHAR":"Sohar",
  "MUSCAT":"Muscat",
  "NIZWA":"Nizwa",
  "IBRI":"Ibri",
  "IBRA":"Ibra",
  "SUR":"Sur",
  "HAIMA":"Haima",
  "SALALAH":"Salalah",
  "BURAIMI":"Buraimi",
  "MUSANDAM":"Musandam",
  "RUSTAQ":"Rustaq"
};
const branchLabel = (code)=> BRANCH_NAME[code] || code;


  function makeGun(){
    const peers = ["https://gun-manhattan.herokuapp.com/gun","https://try.axe.eco/gun","https://test.era.eco/gun"];
    return Gun({ peers });
  }

  function refFor(gun, b){ return gun.get("traffic_queue_clean").get(b); }

  function defaults(){
    return {
      settings:{ historyLimit:15, instituteName:"معهد السلامة المرورية", tickerText:"يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح" },
      current:{ number:"--", gender:"", staff:"", ts:0 },
      note:{ text:"", staff:"", ts:0 },
      history:{ men:{}, women:{} },
      centerImage:{ dataUrl:"", name:"", ts:0 },
      auth:{ adminHash:"" },
      staffUsers:{}
    };
  }

  function ensure(ref){
    ref.once((d)=>{ if(!d || !d.settings) ref.put(defaults());
// مسح السجلات بالكامل (رجال/نساء) + الحالي + النتيجة
ref.get("historyMen").put([]);
ref.get("historyWomen").put([]);
ref.get("current").put({ number:"", gender:"", at:0, by:"", result:"", resultAt:0, resultBy:"" });
ref.get("results").put({}); });
  }

  function setConn(el, ok){
    if(!el) return;
    el.textContent = ok ? "متصل ✅" : "غير متصل…";
    el.style.color = ok ? "#0b7a2b" : "#8a4b00";
  }

  function listenConn(gun, el, ref){
    let ok = false;
    setInterval(()=>setConn(el, ok), 1500);
    if(ref){
      ref.once(()=>{ ok = true; });
      ref.on(()=>{ ok = true; });
    }
    gun.on("hi", ()=>{ ok = true; });
    gun.on("bye", ()=>{ ok = false; });
  }

  function wireBranchSelect(){
  const sel = $("#branchSelect");
  if(!sel) return;
  const cur = branch();
  try{ sel.value = cur; }catch(e){}
  sel.addEventListener("change", ()=>{
    const b = (sel.value || "SOHAR").trim().toUpperCase();
    localStorage.setItem("tq_branch", b);
    const u = new URL(location.href);
    u.searchParams.set("branch", b);
    u.searchParams.delete("room");
    location.href = u.toString();
  });
}

function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ========= Admin =========
  async function initAdmin(){
    const b = branch();
    const gun = makeGun();
    const ref = refFor(gun, b);
    ensure(ref);

    

    wireBranchSelect();
const bs=$("#branchSelect"); if(bs) bs.value=b;
    listenConn(gun, $("#conn"), ref);

    const say = (t)=>{ const msg=$("#msg"); if(msg) msg.textContent=t; };

    ref.get("settings").on((s)=>{
      if(!s) return;
      $("#instituteName").value = s.instituteName || "";
      $("#historyLimit").value = s.historyLimit || 15;
      $("#tickerText").value = s.tickerText || "";
    });

    ref.get("note").on((n)=>{ if(n) $("#adminNote").value = n.text || ""; });

    ref.get("centerImage").on((img)=>{
      const holder = $("#imgHolder");
      const name = $("#imgName");
      if(img?.dataUrl){
        holder.innerHTML = `<img alt="center" src="${img.dataUrl}">`;
        name.textContent = img.name ? `الصورة: ${img.name}` : "الصورة مفعّلة";
      }else{
        holder.innerHTML = `<div style="text-align:center;color:rgba(11,34,48,.70);font-weight:800;padding:10px">لا توجد صورة مرفوعة</div>`;
        name.textContent = "";
      }
    });

    const getAdminHash = ()=> new Promise(res=> ref.get("auth").get("adminHash").once(res));
    const setAdminIfEmpty = async (pin)=>{
      const stored = await getAdminHash();
      if(!stored){
        ref.get("auth").get("adminHash").put(await sha256(pin));
        return {ok:true, first:true};
      }
      return {ok:false, first:false};
    };
    const requireAdmin = async (pin)=>{
      const stored = await getAdminHash();
      if(!stored) return {ok:false, reason:"EMPTY"};
      const h = await sha256(pin);
      return {ok: h===stored, reason: h===stored ? "OK":"BAD"};
    };

    // Chat
    initChatAdmin(ref, requireAdmin);


    function renderStaffList(obj){
      const list = $("#staffList");
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_" && obj[k]).sort() : [];
      list.innerHTML = keys.length ? keys.map(u=>`
        <div class="staffRow" style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12);margin-bottom:8px">
          <div style="font-weight:900">${esc(u)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div style="display:flex;gap:6px;align-items:center;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12)">
              <span style="font-weight:900;color:rgba(11,34,48,.85)">من</span>
              <input data-from="${encodeURIComponent(u)}" type="number" inputmode="numeric" style="width:92px;padding:6px 8px;border-radius:10px;border:1px solid rgba(0,0,0,.18)" />
              <span style="font-weight:900;color:rgba(11,34,48,.85)">إلى</span>
              <input data-to="${encodeURIComponent(u)}" type="number" inputmode="numeric" style="width:92px;padding:6px 8px;border-radius:10px;border:1px solid rgba(0,0,0,.18)" />
              <button class="btn mini" data-save-range="${encodeURIComponent(u)}">حفظ</button>
              <button class="btn mini" data-reset-next="${encodeURIComponent(u)}">تصفير التالي</button>
            </div>
            <button class="warn" data-rename="${encodeURIComponent(u)}">تغيير الاسم</button>
            <button class="danger" data-del="${encodeURIComponent(u)}">حذف</button>
          </div>
        </div>`).join("") : `<div style="text-align:center;color:rgba(11,34,48,.70);font-weight:800;padding:10px">لا يوجد موظفون</div>`
      // تعبئة نطاقات الموظفين (من/إلى)
      list.querySelectorAll('[data-from]').forEach(inp=>{
        const uEnc = inp.getAttribute('data-from');
        const u = decodeURIComponent(uEnc);
        const d = (obj && obj[u]) ? obj[u] : {};
        inp.value = (d.rangeFrom ?? "");
      });
      list.querySelectorAll('[data-to]').forEach(inp=>{
        const uEnc = inp.getAttribute('data-to');
        const u = decodeURIComponent(uEnc);
        const d = (obj && obj[u]) ? obj[u] : {};
        inp.value = (d.rangeTo ?? "");
      });
;

      list.querySelectorAll("[data-save-range]").forEach(btn=>{
  btn.onclick = async ()=>{
    const adminPin = ($("#adminPin").value||"").trim();
    if(!(await requireAdmin(adminPin)).ok){ say("رقم المدير غير صحيح"); return; }
    const uEnc = btn.getAttribute("data-save-range");
          const u = decodeURIComponent(uEnc);
    const fEl = list.querySelector(`[data-from="${uEnc}"]`);
    const tEl = list.querySelector(`[data-to="${uEnc}"]`);
    const from = parseInt((fEl?.value||"").trim(),10);
    const to = parseInt((tEl?.value||"").trim(),10);
    if(!Number.isFinite(from) || !Number.isFinite(to) || from>to){
      say("أدخل نطاق صحيح (من أقل أو يساوي إلى)");
      return;
    }
    ref.get("staffUsers").get(u).put({ rangeFrom: from, rangeTo: to, nextNumber: from, ts: Date.now() });
    say("تم حفظ النطاق ✅");
  };
});

list.querySelectorAll("[data-reset-next]").forEach(btn=>{
  btn.onclick = async ()=>{
    const adminPin = ($("#adminPin").value||"").trim();
    if(!(await requireAdmin(adminPin)).ok){ say("رقم المدير غير صحيح"); return; }
    const uEnc = btn.getAttribute("data-reset-next");
          const u = decodeURIComponent(uEnc);
    // أعد التالي إلى "من"
    ref.get("staffUsers").get(u).once((d)=>{
      const from = parseInt(d?.rangeFrom,10);
      if(!Number.isFinite(from)){ say("حدد نطاق (من/إلى) أولاً"); return; }
      ref.get("staffUsers").get(u).put({ nextNumber: from, ts: Date.now() });
      say("تم تصفير التالي ✅");
    });
  };
});

list.querySelectorAll("[data-del]").forEach(btn=>{
        btn.onclick = async ()=>{
          const adminPin = ($("#adminPin").value||"").trim();
          if(!(await requireAdmin(adminPin)).ok){ say("رقم المدير غير صحيح"); return; }
          const uEnc = btn.getAttribute("data-del");
        const u = decodeURIComponent(uEnc);
          if(!confirm(`حذف الموظف: ${u} ؟`)) return;
          ref.get("staffUsers").get(u).put(null);
          say("تم حذف الموظف ✅");
        };
      });
      list.querySelectorAll("[data-rename]").forEach(btn=>{
        btn.onclick = async ()=>{
          const adminPin = ($("#adminPin").value||"").trim();
          if(!(await requireAdmin(adminPin)).ok){ say("رقم المدير غير صحيح"); return; }
          const oldU = btn.getAttribute("data-rename");
          const newU = prompt("اكتب اسم المستخدم الجديد:", oldU);
          if(!newU) return;
          const nu = newU.trim();
          if(!nu || nu===oldU) return;
          ref.get("staffUsers").get(oldU).once((data)=>{
            if(!data) return;
            ref.get("staffUsers").get(nu).put({ pinHash: data.pinHash || "", rangeFrom: data.rangeFrom ?? "", rangeTo: data.rangeTo ?? "", nextNumber: data.nextNumber ?? "", ts: Date.now() });
            ref.get("staffUsers").get(oldU).put(null);
            say("تم تغيير اسم المستخدم ✅");
          });
        };
      });
    }
    ref.get("staffUsers").on(renderStaffList);

    $("#setBranch").onclick = ()=>{
  const sel = $("#branchSelect") || $("#branchValue");
  const nb = ((sel && sel.value) ? sel.value : "صحار").trim();
  localStorage.setItem("tq_branch", nb);
  const u = new URL(location.href);
  u.searchParams.set("branch", nb);
  u.searchParams.delete("room");
  location.href = u.toString();
};

    $("#saveAdminPin").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("رقم المدير لا يقل عن 4 أرقام"); return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم حفظ رقم المدير لأول مرة ✅"); return; }
      const chk = await requireAdmin(pin);
      if(chk.ok){
        const priv = document.querySelector("#adminPrivate");
        if(priv) priv.classList.remove("isLocked");
      }
      say(chk.ok ? "رقم المدير صحيح ✅ (تم فتح الخصوصية)" : "رقم المدير غير صحيح");
    };

    const unlockPrivate = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(!pin) return;
      const chk = await requireAdmin(pin);
      if(chk.ok){
        const priv = document.querySelector("#adminPrivate");
        if(priv) priv.classList.remove("isLocked");
      }
    };
    $("#adminPin").addEventListener("change", unlockPrivate);
    $("#adminPin").addEventListener("keyup", (e)=>{ if(e.key==="Enter") unlockPrivate(); });

    $("#resetAdminPin").onclick = async ()=>{
  const code = prompt("أدخل كود إعادة التعيين:");
  if(code !== "95359513"){ say("الكود غير صحيح"); return; }
  if(!confirm("هل تريد إعادة تعيين رقم المدير؟")) return;
  ref.get("auth").get("adminHash").put("");
  $("#adminPin").value = "";
  say("تم مسح رقم المدير ✅ أدخل رقم جديد ثم اضغط (حفظ رقم المدير)");
};


    $("#saveSettings").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم تعيين رقم المدير ✅ اضغط حفظ الإعدادات مرة أخرى"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("settings").put({
        instituteName: ($("#instituteName").value || "").trim() || "معهد السلامة المرورية",
        historyLimit: Math.max(3, Math.min(60, parseInt($("#historyLimit").value || "15",10))),
        tickerText: ($("#tickerText").value || "").trim() || "يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح"
      });
      say("تم حفظ الإعدادات ✅");
    };

    $("#saveAdminNote").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("note").put({ text: ($("#adminNote").value || "").trim(), staff:"المدير", ts: Date.now() });
      say("تم حفظ الملاحظة ✅");
    };

    $("#addStaff").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم تعيين رقم المدير ✅ أعد المحاولة لإضافة موظف"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      const u = ($("#newUsername").value || "").trim();
      const sp = ($("#newUserPin").value || "").trim();
      if(!u){ say("اكتب اسم مستخدم للموظف"); return; }
      if(sp.length < 4){ say("رقم الموظف لا يقل عن 4 أرقام"); return; }
      ref.get("staffUsers").get(u).put({ pinHash: await sha256(sp), ts: Date.now() });
      $("#newUsername").value=""; $("#newUserPin").value="";
      say("تمت إضافة الموظف ✅");
    };

    $("#imgFile").addEventListener("change", async (e)=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); e.target.value=""; return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم تعيين رقم المدير ✅ أعد رفع الصورة"); e.target.value=""; return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); e.target.value=""; return; }
      const file = e.target.files && e.target.files[0]; if(!file) return;
      const dataUrl = await new Promise((res, rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
      ref.get("centerImage").put({ dataUrl, name:file.name, ts: Date.now() });
      say("تم رفع الصورة ✅");
      e.target.value="";
    });

    $("#clearImage").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("centerImage").put({ dataUrl:"", name:"", ts: Date.now() });
      say("تم حذف الصورة ✅");
    };

    $("#clearHistory").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("history").put({ men:{}, women:{} });
      say("تم مسح سجل الأرقام ✅");
    };


    // تصفير النداءات (رجال/نساء) + خيار تصفير الرقم الحالي — للفرع الحالي فقط
    const clearBucket = (bucket)=> new Promise((resolve)=>{
      ref.get("history").get(bucket).once((obj)=>{
        try{
          if(obj){
            Object.keys(obj).filter(k=>k!=="_").forEach(k=>{
              ref.get("history").get(bucket).get(k).put(null);
            });
          }
        }finally{
          resolve(true);
        }
      });
    });

    const resetCurrent = ()=>{
      ref.get("current").put({ number:"--", gender:"", staff:"", ts:0, result:"", resultAt:0, resultBy:"" });
    };

    $("#resetCallsMen").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير نداءات الرجال لهذا الفرع؟")) return;
      await clearBucket("men");
      say("تم تصفير نداءات الرجال ✅");
    };

    $("#resetCallsWomen").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير نداءات النساء لهذا الفرع؟")) return;
      await clearBucket("women");
      say("تم تصفير نداءات النساء ✅");
    };

    $("#resetCallsBranch").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير (رجال + نساء) + الرقم الحالي لهذا الفرع؟")) return;
      await clearBucket("men");
      await clearBucket("women");
      resetCurrent();
      say("تم تصفير النداءات والرقم الحالي ✅");
    };

    $("#resetAll").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير النظام بالكامل؟")) return;
      ref.put(defaults());
// مسح السجلات بالكامل (رجال/نساء) + الحالي + النتيجة
ref.get("historyMen").put([]);
ref.get("historyWomen").put([]);
ref.get("current").put({ number:"", gender:"", at:0, by:"", result:"", resultAt:0, resultBy:"" });
ref.get("results").put({});
      say("تم تصفير النظام ✅");
    };
  }

  // ========= Staff =========
  async function initStaff(){
    function parseOverrideRange(){
      const raw = ($('#staffRangeOverride')?.value || '').trim();
      if(!raw) return null;
      const m = raw.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if(!m) return null;
      const from = parseInt(m[1],10), to = parseInt(m[2],10);
      if(!Number.isFinite(from) || !Number.isFinite(to) || from>to) return null;
      return {from,to};
    }

    const b = branch();
    const gun = makeGun();
    const ref = refFor(gun, b);
    ensure(ref);

    

    wireBranchSelect();
const bs=$("#branchSelect"); if(bs) bs.value=b;
    listenConn(gun, $("#conn"), ref);

    const say = (t)=>{ const msg=$("#msg"); if(msg) msg.textContent=t; };

    ref.get("settings").on((s)=>{ if(s?.instituteName) $("#instName").textContent = s.instituteName; });

    const userSel = $("#username");
    ref.get("staffUsers").on((obj)=>{
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_" && obj[k]).sort() : [];
      const cur = userSel.value;
      userSel.innerHTML = `<option value="">اختر المستخدم…</option>` + keys.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");
      if(keys.includes(cur)) userSel.value = cur;
    });

    ref.get("current").on((c)=>{
      if(c) $("#currentNum").textContent = c.number ?? "--";
      // تلوين إطار "آخر رقم" حسب النتيجة (ناجح/راسب/غياب)
      const card = $("#lastNumCard") || document.querySelector(".bigNumberCard");
      if(card){
        card.classList.remove("pass","fail","absent");
        const r = (c && (c.result || c.lastResult)) ? String(c.result || c.lastResult) : "";
        if(r === "pass") card.classList.add("pass");
        else if(r === "fail") card.classList.add("fail");
        else if(r === "absent") card.classList.add("absent");
      }

      // Auto-fill "رقم التلميذ للنتيجة" بآخر رقم تم نداؤه (مع إمكانية تعديله)
      const rn = $("#resultNum");
      if(rn && c && (c.number!==undefined && c.number!==null)){
        const newVal = String(c.number);
        const autoFlag = rn.dataset.auto === "1";
        if(!rn.value || autoFlag){
          rn.value = newVal;
          rn.dataset.auto = "1";
          rn.dataset.lastAuto = newVal;
        }
      }
    });
    // إذا المستخدم عدّل الحقل يدويًا، لا نرجعه تلقائيًا إلا إذا فرّغه
    const rn = $("#resultNum");
    if(rn){
      rn.addEventListener("input", ()=>{
        if(!rn.value){
          rn.dataset.auto = "1";
          rn.dataset.lastAuto = "";
        } else {
          // إذا غيّر القيمة عن آخر قيمة تعبّأت تلقائيًا اعتبره تعديل يدوي
          const lastAuto = rn.dataset.lastAuto || "";
          rn.dataset.auto = (rn.value === lastAuto) ? "1" : "0";
        }
      });
    }

    let lastCallTs = 0;
    ref.get("current").on((c)=>{
      if(!c) return;
      if(c.ts && c.ts !== lastCallTs){
        lastCallTs = c.ts;
        if(c.gender) beep(c.gender);
      }
    });

    async function requireStaff(){
  const u = (userSel.value || "").trim();
  if(!u){ say("اختر اسم المستخدم"); return null; }
  const pin = ($("#userPin").value || "").trim();
  if(!pin){ say("أدخل رقم الموظف"); return null; }
  const data = await new Promise(res=> ref.get("staffUsers").get(u).once(res));
  if(!data || !data.pinHash){ say("هذا المستخدم غير موجود"); return null; }
  if(await sha256(pin) !== data.pinHash){ say("رقم الموظف غير صحيح"); return null; }
  return { u, data };
}

    // Chat
    initChatStaff(ref, async ()=>{ const r = await requireStaff(); return r ? r.u : null; });


    $("#setBranch").onclick = ()=>{
  const sel = $("#branchSelect") || $("#branchValue");
  const nb = ((sel && sel.value) ? sel.value : "صحار").trim();
  localStorage.setItem("tq_branch", nb);
  const u = new URL(location.href);
  u.searchParams.set("branch", nb);
  u.searchParams.delete("room");
  location.href = u.toString();
};

    $("#callNext").onclick = async ()=>{
      const auth = await requireStaff();
      if(!auth) return;
      const username = auth.u;
      const staffData = auth.data || {};

      const num = ($("#ticketNum").value || "").trim();
      const gender = $("#gender").value;
      if(!num){ say("أدخل رقم المتدرب"); return; }
      if(!gender){ say("اختر (رجال/نساء)"); return; }

      // تقييد النطاق (من/إلى) إن وُجد
      const ov = parseOverrideRange();
      const n = parseInt(num, 10);
      const rf = ov ? ov.from : staffData?.rangeFrom;
      const rt = ov ? ov.to : staffData?.rangeTo;
      if(rf !== undefined && rf !== null && rt !== undefined && rt !== null && rf !== "" && rt !== ""){
        const from = parseInt(rf,10), to = parseInt(rt,10);
        if(!Number.isFinite(n) || n < from || n > to){
          say(`هذا الموظف مسموح له بالأرقام من ${from} إلى ${to} فقط`);
          return;
        }
      }

      const settings = await new Promise(res=> ref.get("settings").once(res));
  const limit = Math.max(3, Math.min(60, parseInt(settings?.historyLimit || 15,10)));

  const prev = await new Promise(res=> ref.get("current").once(res));
  const now = Date.now();

  // 1) نقل الرقم السابق (الذي كان "حالي") إلى العمود المناسب بعد نداء رقم جديد
  if(prev && prev.number && prev.number !== "--" && (prev.gender === "men" || prev.gender === "women")){
    const bucketPrev = (prev.gender === "women") ? "women" : "men";
    const key = String(now); // مفتاح واضح
    ref.get("history").get(bucketPrev).get(key).put({ number: prev.number, staff: prev.staff || "", ts: now });

    // تقليم السجل بعد لحظات لضمان وصول البيانات
    setTimeout(()=>{
      ref.get("history").get(bucketPrev).once((obj)=>{
        if(!obj) return;
        const keys = Object.keys(obj).filter(k=>k!=="_").sort((a,b)=>Number(a)-Number(b));
        const extra = keys.length - limit;
        if(extra > 0){
          for(let i=0;i<extra;i++){
            ref.get("history").get(bucketPrev).get(keys[i]).put(null);
          }
        }
      });
    }, 250);
  }

  // 2) تحديث الرقم الحالي
  ref.get("current").put({number:num, gender, staff: username, ts: now, result: "", resultAt: 0, resultBy: ""});
  // تحديث "التالي" للموظف إذا كان ضمن نطاقه
      const ov2 = parseOverrideRange();
      const rf2 = ov2 ? ov2.from : staffData?.rangeFrom;
      const rt2 = ov2 ? ov2.to : staffData?.rangeTo;
      if(rf2 !== undefined && rf2 !== null && rt2 !== undefined && rt2 !== null && rf2 !== "" && rt2 !== ""){
        const from2 = parseInt(rf2,10), to2 = parseInt(rt2,10);
        const nextNow = Number.isFinite(parseInt(staffData?.nextNumber,10)) ? parseInt(staffData.nextNumber,10) : from2;
        if(Number.isFinite(n) && n >= from2 && n <= to2){
          // إذا الموظف نادى الرقم المتوقع، قدّم التالي
          if(n === nextNow){
            const nn = Math.min(to2+1, nextNow+1);
            ref.get("staffUsers").get(username).put({ nextNumber: nn, ts: Date.now() });
          }
        }
      }

      say("تم النداء ✅");
};

$("#requestNext").onclick = async ()=>{
  const auth = await requireStaff();
  if(!auth) return;
  const staffData = auth.data || {};
  const ov = parseOverrideRange();
  const rf = ov ? ov.from : staffData?.rangeFrom;
  const rt = ov ? ov.to : staffData?.rangeTo;

  if(rf === undefined || rf === null || rt === undefined || rt === null || rf === "" || rt === ""){
    say("لا يوجد نطاق مخصص لهذا الموظف. حدده من لوحة المدير.");
    return;
  }
  const from = parseInt(rf,10), to = parseInt(rt,10);
  let nextNow = Number.isFinite(parseInt(staffData?.nextNumber,10)) ? parseInt(staffData.nextNumber,10) : from;
  if(nextNow < from) nextNow = from;
  if(nextNow > to){
    say("انتهى نطاقك المحدد ✅");
    return;
  }

  $("#ticketNum").value = String(nextNow);

  // لازم اختيار الجنس قبل النداء
  const gender = $("#gender").value;
  if(!gender){
    say(`تم اختيار التالي: ${nextNow} ✅ اختر (رجال/نساء) ثم اضغط طلب التالي مرة ثانية أو اضغط نداء`);
    return;
  }

  // نداء تلقائي
  $("#callNext").click();
};

    // ========= نتيجة آخر رقم (ناجح/راسب/غياب) =========
    async function setLastResult(kind){
      const auth = await requireStaff();
      if(!auth) return;
      const nowCur = await new Promise(res=> ref.get("current").once(res));
      const curNum = (nowCur && (nowCur.number ?? nowCur.num)) ? String(nowCur.number ?? nowCur.num) : "--";
      if(!curNum || curNum==="--"){
        say("لا يوجد رقم حالي لتسجيل النتيجة");
        return;
      }
      // تحديث نتيجة الرقم الحالي فقط
      ref.get("current").put({ result: kind, resultAt: Date.now(), resultBy: auth.u || "" });
      say(kind==="pass" ? "تم تسجيل: ناجح ✅" : (kind==="fail" ? "تم تسجيل: راسب ✅" : "تم تسجيل: غياب ✅"));
    }

    const pb = $("#passBtn");
    const fb = $("#failBtn");
    const ab = $("#absentBtn");

    if(pb) pb.onclick = ()=> setLastResult("pass");
    if(fb) fb.onclick = ()=> setLastResult("fail");
    if(ab) ab.onclick = ()=> setLastResult("absent");


  }

  // ========= Display =========
  async function initDisplay(){
    const b = branch();
    const gun = makeGun();
    const ref = refFor(gun, b);
    ensure(ref);

    

    wireBranchSelect();
$("#branchLabel").textContent = `الفرع: ${b}`;
    listenConn(gun, $("#conn"), ref);

    ref.get("settings").on((s)=>{
      if(s?.instituteName) $("#instName").textContent = s.instituteName;
      $("#tickerText").textContent = s?.tickerText || "يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح";
    });

    let lastTs = 0;
    ref.get("current").on((c)=>{
      if(!c) return;
      $("#curNumber").textContent = c.number ?? "--";
      $("#genderLabel").textContent = c.gender === "women" ? "نساء" : (c.gender === "men" ? "رجال" : "");
      const card = document.querySelector(".bigNumberCard");
      if(card){
        card.classList.remove("pass","fail","absent");
        if(c.result==="pass") card.classList.add("pass");
        else if(c.result==="fail") card.classList.add("fail");
        else if(c.result==="absent") card.classList.add("absent");
      }
      const numKey = String(c.number||"").trim();
      if(numKey){
        ref.get("results").get(numKey).once((r)=>{
          const card2 = document.querySelector(".bigNumberCard");
          if(!card2) return;
          if(card2.classList.contains("pass") || card2.classList.contains("fail")) return;
          if(r?.result==="pass") card2.classList.add("pass");
          else if(r?.result==="fail") card2.classList.add("fail");
        });
      }
      $("#lastCall").textContent = c.ts ? `آخر نداء: ${new Date(c.ts).toLocaleTimeString('ar-OM',{hour:'2-digit',minute:'2-digit'})}` : "";
      if(c.ts && c.ts !== lastTs){
        lastTs = c.ts;
        if(c.gender) beep(c.gender);
      }
    });

    ref.get("note").on((n)=>{
      const span = $("#noteSpan");
      const txt = (n?.text || "").trim();
      span.textContent = txt || "—";
      span.style.opacity = txt ? "1" : ".55";
    });

    ref.get("centerImage").on((img)=>{
      const holder = $("#centerImg");
      const wrap = $("#centerImgWrap");
      if(img?.dataUrl){ holder.src = img.dataUrl; wrap.style.display="block"; }
      else { holder.src=""; wrap.style.display="none"; }
    });
// قراءة السجل بطريقة map().on لضمان وصول العناصر الفرعية (بدون مشاكل مزامنة)
function makeBucketRenderer(bucket, target){
  const store = {};
  ref.get("history").get(bucket).map().on((val, key)=>{
    if(!key || key === "_") return;
    if(!val || val === null){
      delete store[key];
    }else{
      store[key] = val;
    }
    const keys = Object.keys(store).sort((a,b)=>Number(b)-Number(a));

    const items = keys.map(k => store[k]).filter(Boolean).map(it=>{
      const num = it.number;
      const ts  = it.ts || 0;
      return { num, ts };
    }).filter(x=>x.num);

    target.innerHTML = items.map(x=>{
      const t = x.ts ? formatTime(x.ts) : "";
      return `<div class="tile"><div class="tileNum">${esc(x.num)}</div><div class="tileTime">${esc(t)}</div></div>`;
    }).join("") ||
      `<div style="grid-column:1/-1;text-align:center;color:rgba(11,34,48,.70);font-weight:900;padding:10px">—</div>`;
  });
}
makeBucketRenderer("men", $("#menList"));
makeBucketRenderer("women", $("#womenList"));  }

  // ========= Chat (Admin <-> Staff) =========
function formatTime(ts){
  try{
    return new Date(ts).toLocaleTimeString('ar-OM',{hour:'2-digit',minute:'2-digit'});
  }catch(e){ return ""; }
}

function renderChat(listEl, msgs){
  if(!listEl) return;
  const items = msgs.slice(-60); // آخر 60 رسالة
  listEl.innerHTML = items.map(m=>{
    const who = m.from || "";
    const role = m.role || "";
    const t = m.ts ? formatTime(m.ts) : "";
    const text = (m.text || "").trim();
    const cls = role === "admin" ? "chat admin" : "chat staff";
    return `
      <div class="${cls}">
        <div class="chatMeta">${esc(who)} • ${t}</div>
        <div class="chatText">${esc(text)}</div>
      </div>`;
  }).join("") || `<div style="text-align:center;color:rgba(11,34,48,.70);font-weight:900;padding:10px">لا توجد رسائل</div>`;
  listEl.scrollTop = listEl.scrollHeight;
}

function wireChat(ref, listEl){
  const msgs = [];
  // Gun set: chat/messages/*
  ref.get("chat").get("messages").map().on((data, key)=>{
    if(!data || !data.text) return;
    const msg = { id:key, from:data.from||"", role:data.role||"", text:data.text||"", ts:data.ts||0 };
    const idx = msgs.findIndex(x=>x.id===key);
    if(idx>=0) msgs[idx]=msg; else msgs.push(msg);
    msgs.sort((a,b)=> (a.ts||0)-(b.ts||0));
    renderChat(listEl, msgs);
  });
}

async function initChatAdmin(ref, requireAdminFn){
  const listEl = $("#chatListAdmin");
  const selEl  = $("#chatUserSelect");
  if(!listEl || !selEl) return;

  // populate staff list into dropdown
  ref.get("staffUsers").on((obj)=>{
    const keys = obj ? Object.keys(obj).filter(k=>k!=="_" && obj[k]).sort() : [];
    const cur = selEl.value || "";
    selEl.innerHTML = `<option value="">اختر موظف…</option>` + keys.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");
    if(keys.includes(cur)) selEl.value = cur;
  });

  let currentUser = "";
  let off = null;

  function attach(user){
    currentUser = user;
    listEl.innerHTML = `<div style="text-align:center;color:rgba(11,34,48,.70);font-weight:900;padding:10px">${user? "جاري تحميل الرسائل…" : "اختر موظف لعرض الدردشة"}</div>`;
    // simple detach by reloading map listeners: Gun doesn't provide strong off; we use a flag
    const token = Date.now();
    off = token;
    const msgs = [];
    const path = ref.get("chat").get("private").get(user).get("messages");
    path.map().on((data, key)=>{
      if(off !== token) return;
      if(!data || !data.text) return;
      const msg = { id:key, from:data.from||"", role:data.role||"", text:data.text||"", ts:data.ts||0 };
      const idx = msgs.findIndex(x=>x.id===key);
      if(idx>=0) msgs[idx]=msg; else msgs.push(msg);
      msgs.sort((a,b)=> (a.ts||0)-(b.ts||0));
      renderChat(listEl, msgs);
    });
  }

  selEl.addEventListener("change", ()=>{
    const u = (selEl.value || "").trim();
    if(!u) return attach("");
    attach(u);
  });

  // send
  $("#sendChatAdmin").onclick = async ()=>{
    const pin = ($("#adminPin").value || "").trim();
    if(pin.length < 4) return;
    const ok = await requireAdminFn(pin);
    if(!ok.ok) return;
    const u = (selEl.value || "").trim();
    if(!u) return;
    const txtEl = $("#chatTextAdmin");
    const text = (txtEl.value || "").trim();
    if(!text) return;
    ref.get("chat").get("private").get(u).get("messages").set({ from:"المدير", role:"admin", text, ts: Date.now() });
    txtEl.value = "";
  };

  $("#clearChatAdmin").onclick = async ()=>{
    const pin = ($("#adminPin").value || "").trim();
    if(pin.length < 4) return;
    const ok = await requireAdminFn(pin);
    if(!ok.ok) return;
    const u = (selEl.value || "").trim();
    if(!u) return;
    if(!confirm(`مسح الدردشة مع ${u} ؟`)) return;
    const path = ref.get("chat").get("private").get(u).get("messages");
    // حذف فعلي: Gun يحتاج put(null) لكل رسالة داخل الـ set
    path.map().once((data, key)=>{
      if(!key || key === "_" ) return;
      path.get(key).put(null);
    });
    // تحديث الواجهة بعد قليل
    setTimeout(()=> attach(u), 350);
  };

  attach("");
}

async function initChatStaff(ref, requireStaffFn){
  const listEl = $("#chatListStaff");
  if(!listEl) return;

  let token = 0;

  async function attach(){
    const username = await requireStaffFn();
    if(!username) return null;
    token = Date.now();
    const my = token;
    const msgs = [];
    const path = ref.get("chat").get("private").get(username).get("messages");
    path.map().on((data, key)=>{
      if(token !== my) return;
      if(!data || !data.text) return;
      const msg = { id:key, from:data.from||"", role:data.role||"", text:data.text||"", ts:data.ts||0 };
      const idx = msgs.findIndex(x=>x.id===key);
      if(idx>=0) msgs[idx]=msg; else msgs.push(msg);
      msgs.sort((a,b)=> (a.ts||0)-(b.ts||0));
      renderChat(listEl, msgs);
    });
    return username;
  }

  // attach when user selected / pin provided
  const tryAttach = async ()=>{
    const u = (document.querySelector("#username")?.value || "").trim();
    const p = (document.querySelector("#userPin")?.value || "").trim();
    if(u && p) await attach();
  };
  document.querySelector("#username")?.addEventListener("change", tryAttach);
  document.querySelector("#userPin")?.addEventListener("input", ()=>{
    if((document.querySelector("#userPin")?.value || "").trim().length >= 4) tryAttach();
  });

  $("#clearChatStaff").onclick = async ()=>{
  const username = await requireStaffFn();
  if(!username) return;
  if(!confirm("مسح الدردشة بينك وبين المدير لهذا الفرع؟")) return;
  ref.get("chat").get("private").get(username).put({ messages: {} });
  setTimeout(()=> location.reload(), 250);
};

$("#sendChatStaff").onclick = async ()=>{

    const username = await requireStaffFn();
    if(!username) return;
    // ensure listener attached
    await attach();
    const txtEl = $("#chatTextStaff");
    const text = (txtEl.value || "").trim();
    if(!text) return;
    ref.get("chat").get("private").get(username).get("messages").set({ from: username, role:"staff", text, ts: Date.now() });
    txtEl.value = "";
  };
}

window.TQ = { initAdmin, initStaff, initDisplay };
})();