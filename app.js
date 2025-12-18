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
    url.searchParams.get("branch") ||
    url.searchParams.get("room") || // توافق مع النسخ السابقة
    localStorage.getItem("tq_branch") ||
    "صحار";
  localStorage.setItem("tq_branch", b);
  return b;
}


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
    ref.once((d)=>{ if(!d || !d.settings) ref.put(defaults()); });
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
    const b = sel.value;
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
$("#branchValue").value = b;
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

    function renderStaffList(obj){
      const list = $("#staffList");
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_").sort() : [];
      list.innerHTML = keys.length ? keys.map(u=>`
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12);margin-bottom:8px">
          <div style="font-weight:900">${esc(u)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="warn" data-rename="${esc(u)}">تغيير الاسم</button>
            <button class="danger" data-del="${esc(u)}">حذف</button>
          </div>
        </div>`).join("") : `<div style="text-align:center;color:rgba(11,34,48,.70);font-weight:800;padding:10px">لا يوجد موظفون</div>`;

      list.querySelectorAll("[data-del]").forEach(btn=>{
        btn.onclick = async ()=>{
          const adminPin = ($("#adminPin").value||"").trim();
          if(!(await requireAdmin(adminPin)).ok){ say("رقم المدير غير صحيح"); return; }
          const u = btn.getAttribute("data-del");
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
            ref.get("staffUsers").get(nu).put({ pinHash: data.pinHash || "", ts: Date.now() });
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
      say(chk.ok ? "رقم المدير صحيح ✅ (محفوظ)" : "رقم المدير غير صحيح");
    };

    $("#resetAdminPin").onclick = async ()=>{
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

    $("#resetAll").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير النظام بالكامل؟")) return;
      ref.put(defaults());
      say("تم تصفير النظام ✅");
    };
  }

  // ========= Staff =========
  async function initStaff(){
    const b = branch();
    const gun = makeGun();
    const ref = refFor(gun, b);
    ensure(ref);

    

    wireBranchSelect();
$("#branchValue").value = b;
    listenConn(gun, $("#conn"), ref);

    const say = (t)=>{ const msg=$("#msg"); if(msg) msg.textContent=t; };

    ref.get("settings").on((s)=>{ if(s?.instituteName) $("#instName").textContent = s.instituteName; });

    const userSel = $("#username");
    ref.get("staffUsers").on((obj)=>{
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_").sort() : [];
      const cur = userSel.value;
      userSel.innerHTML = `<option value="">اختر المستخدم…</option>` + keys.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");
      if(keys.includes(cur)) userSel.value = cur;
    });

    ref.get("current").on((c)=>{ if(c) $("#currentNum").textContent = c.number ?? "--"; });

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
      return u;
    }

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
      const username = await requireStaff();
      if(!username) return;

      const num = ($("#ticketNum").value || "").trim();
      const gender = $("#gender").value;
      if(!num){ say("أدخل رقم المتدرب"); return; }
      if(!gender){ say("اختر (رجال/نساء)"); return; }

      const settings = await new Promise(res=> ref.get("settings").once(res));
      const limit = Math.max(3, Math.min(60, parseInt(settings?.historyLimit || 15,10)));

      const prev = await new Promise(res=> ref.get("current").once(res));
      const now = Date.now();

      if(prev && prev.number && prev.number !== "--" && prev.gender){
        const bucketPrev = (prev.gender==="women") ? "women" : "men";
        ref.get("history").get(bucketPrev).get(String(now-1)).put({ number: prev.number, staff: prev.staff || "", ts: now-1 });
        ref.get("history").get(bucketPrev).once((obj)=>{
          if(!obj) return;
          const keys = Object.keys(obj).filter(k=>k!=="_").sort();
          const extra = keys.length - limit;
          if(extra > 0){
            for(let i=0;i<extra;i++) ref.get("history").get(bucketPrev).get(keys[i]).put(null);
          }
        });
      }

      ref.get("current").put({ number:num, gender, staff: username, ts: now });
      say("تم النداء ✅");
    };
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

    function renderList(obj, target){
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_").sort((a,b)=>Number(b)-Number(a)) : [];
      const nums = keys.map(k => obj[k]?.number).filter(Boolean);
      target.innerHTML = nums.map(n=>`<div class="tile">${esc(n)}</div>`).join("") ||
        `<div style="grid-column:1/-1;text-align:center;color:rgba(11,34,48,.70);font-weight:900;padding:10px">—</div>`;
    }
    ref.get("history").get("men").on((h)=> renderList(h, $("#menList")));
    ref.get("history").get("women").on((h)=> renderList(h, $("#womenList")));
  }

  window.TQ = { initAdmin, initStaff, initDisplay };
})();