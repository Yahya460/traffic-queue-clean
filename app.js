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
      const play = (f, t0, dur, gain=0.18, type="sine")=>{
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0+dur+0.02);
      };
      play(kind==="women"?880:660, now, 0.22, 0.18, "sine");
      play(kind==="women"?990:740, now+0.26, 0.16, 0.14, "triangle");
    }catch(e){}
  }

  function room(){
    const url = new URL(location.href);
    const r = url.searchParams.get("room") || localStorage.getItem("tq_room") || "sohar-demo";
    localStorage.setItem("tq_room", r);
    return r;
  }

  function makeGun(){
    const peers = [
      "https://gun-manhattan.herokuapp.com/gun",
      "https://try.axe.eco/gun",
      "https://test.era.eco/gun"
    ];
    return Gun({ peers });
  }

  function refFor(gun, r){
    return gun.get("traffic_queue_clean").get(r);
  }

  function defaults(){
    return {
      settings: { historyLimit: 15, instituteName: "معهد السلامة المرورية - صحار", tickerText: "يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح" },
      current: { number: "--", gender: "", staff: "", ts: 0 },
      note: { text: "", staff: "", ts: 0 },
      history: { men: {}, women: {} },
      centerImage: { dataUrl: "", name: "", ts: 0 },
      auth: { adminHash: "", staffHash: "" },
      brand: { logoDataUrl: "" }
    };
  }

  function ensure(ref){
    ref.once((d)=>{
      if(!d || !d.settings) ref.put(defaults());
    });
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

  function esc(s){
    return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // ========= Admin =========
  async function initAdmin(){
    const r = room();
    const gun = makeGun();
    const ref = refFor(gun, r);
    ensure(ref);

    $("#roomValue").value = r;
    listenConn(gun, $("#conn"), ref);

    const msg = $("#msg");
    const say = (t)=>{ if(msg) msg.textContent = t; };

    ref.get("settings").on((s)=>{
      if(!s) return;
      $("#instituteName").value = s.instituteName || "";
      $("#historyLimit").value = s.historyLimit || 15;
      $("#tickerText").value = s.tickerText || "";
    });

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

    $("#setRoom").onclick = ()=>{
      const nr = ($("#roomValue").value || "sohar-demo").trim();
      const u = new URL(location.href);
      u.searchParams.set("room", nr);
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
      if(pin.length < 4){ say("أدخل رقم المدير ثم اضغط حفظ رقم المدير"); return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم تعيين رقم المدير ✅ اضغط حفظ الإعدادات مرة أخرى"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }

      const instituteName = ($("#instituteName").value || "").trim() || "معهد السلامة المرورية - صحار";
      const historyLimit = Math.max(3, Math.min(60, parseInt($("#historyLimit").value || "15",10)));
      const tickerText = ($("#tickerText").value || "").trim() || "يرجى الالتزام بالهدوء وانتظار دوركم، مع تمنياتنا لكم بالتوفيق والنجاح";
      ref.get("settings").put({ instituteName, historyLimit, tickerText });
      say("تم حفظ الإعدادات ✅");
    };

    $("#setStaffPin").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      const chk = await requireAdmin(pin);
      if(!chk.ok && chk.reason==="EMPTY"){
        const first = await setAdminIfEmpty(pin);
        if(first.ok){ say("تم تعيين رقم المدير ✅ أعد المحاولة لحفظ رقم الموظف"); return; }
      }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }

      const sp = ($("#staffPin").value || "").trim();
      if(sp.length < 4){ say("اختر رقم للموظف لا يقل عن 4 أرقام"); return; }
      ref.get("auth").get("staffHash").put(await sha256(sp));
      say("تم حفظ رقم الموظف ✅");
    };

    $("#clearHistory").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("history").put({ men:{}, women:{} });
      say("تم مسح سجل الأرقام ✅");
    };

    $("#clearNote").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("note").put({ text:"", staff:"", ts: Date.now() });
      say("تم مسح الملاحظة ✅");
    };

    $("#clearImage").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      ref.get("centerImage").put({ dataUrl:"", name:"", ts: Date.now() });
      say("تم حذف الصورة ✅");
    };

    $("#resetAll").onclick = async ()=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); return; }
      if(!confirm("أكيد تريد تصفير النظام بالكامل؟")) return;
      ref.put(defaults());
      say("تم تصفير النظام ✅");
    };

    $("#imgFile").addEventListener("change", async (e)=>{
      const pin = ($("#adminPin").value || "").trim();
      if(pin.length < 4){ say("أدخل رقم المدير"); e.target.value=""; return; }
      const first = await setAdminIfEmpty(pin);
      if(first.ok && first.first){ say("تم تعيين رقم المدير ✅ أعد رفع الصورة"); e.target.value=""; return; }
      if(!(await requireAdmin(pin)).ok){ say("رقم المدير غير صحيح"); e.target.value=""; return; }

      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const dataUrl = await new Promise((res, rej)=>{
        const fr = new FileReader();
        fr.onload = ()=>res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      ref.get("centerImage").put({ dataUrl, name:file.name, ts: Date.now() });
      say("تم رفع الصورة ✅");
      e.target.value = "";
    });
  }

  // ========= Staff =========
  async function initStaff(){
    const r = room();
    const gun = makeGun();
    const ref = refFor(gun, r);
    ensure(ref);

    $("#roomValue").value = r;
    listenConn(gun, $("#conn"), ref);

    const msg = $("#msg");
    const say = (t)=>{ if(msg) msg.textContent = t; };

    ref.get("settings").on((s)=>{
      if(s?.instituteName) $("#instName").textContent = s.instituteName;
    });

    // local preview
    ref.get("current").on((c)=>{
      if(!c) return;
      $("#currentNum").textContent = c.number ?? "--";
    });

    let lastCallTs = 0;
    ref.get("current").on((c)=>{
      if(!c) return;
      if(c.ts && c.ts !== lastCallTs){
        lastCallTs = c.ts;
        if(c.gender) beep(c.gender);
      }
    });

    async function requireStaff(){
      const pin = ($("#staffPin").value || "").trim();
      if(!pin){ say("أدخل رقم الموظف"); return false; }
      const stored = await new Promise(res=> ref.get("auth").get("staffHash").once(res));
      if(!stored){ say("لم يتم تعيين رقم موظف بعد (من المدير)"); return false; }
      const h = await sha256(pin);
      if(h !== stored){ say("رقم الموظف غير صحيح"); return false; }
      return true;
    }

    $("#setRoom").onclick = ()=>{
      const nr = ($("#roomValue").value || "sohar-demo").trim();
      const u = new URL(location.href);
      u.searchParams.set("room", nr);
      location.href = u.toString();
    };

    $("#callNext").onclick = async ()=>{
      if(!(await requireStaff())) return;
      const num = ($("#ticketNum").value || "").trim();
      const gender = $("#gender").value;
      const staffName = ($("#staffName").value || "").trim() || "موظف";
      if(!num){ say("أدخل رقم المتدرب"); return; }
      if(!gender){ say("اختر (رجال/نساء)"); return; }

      const settings = await new Promise(res=> ref.get("settings").once(res));
      const limit = Math.max(3, Math.min(60, parseInt(settings?.historyLimit || 15,10)));

      const now = Date.now();
      ref.get("current").put({ number:num, gender, staff:staffName, ts: now });

      const bucket = (gender==="women") ? "women" : "men";
      ref.get("history").get(bucket).get(String(now)).put({ number:num, staff:staffName, ts: now });

      ref.get("history").get(bucket).once((obj)=>{
        if(!obj) return;
        const keys = Object.keys(obj).filter(k=>k!=="_").sort();
        const extra = keys.length - limit;
        if(extra > 0){
          for(let i=0;i<extra;i++){
            ref.get("history").get(bucket).get(keys[i]).put(null);
          }
        }
      });

      say("تم النداء ✅");
    };

    $("#sendNote").onclick = async ()=>{
      if(!(await requireStaff())) return;
      const staffName = ($("#staffName").value || "").trim() || "موظف";
      const text = ($("#noteText").value || "").trim();
      ref.get("note").put({ text, staff:staffName, ts: Date.now() });
      say("تم إرسال الملاحظة ✅");
    };

    $("#clearNote").onclick = async ()=>{
      if(!(await requireStaff())) return;
      ref.get("note").put({ text:"", staff:(($("#staffName").value||"").trim()||"موظف"), ts: Date.now() });
      $("#noteText").value = "";
      say("تم مسح الملاحظة ✅");
    };
  }

  // ========= Display =========
  async function initDisplay(){
    const r = room();
    const gun = makeGun();
    const ref = refFor(gun, r);
    ensure(ref);

    $("#roomLabel").textContent = `الغرفة: ${r}`;
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
      if(img?.dataUrl){
        holder.src = img.dataUrl;
        wrap.style.display = "block";
      }else{
        holder.src = "";
        wrap.style.display = "none";
      }
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