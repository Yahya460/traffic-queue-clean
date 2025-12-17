/* Traffic Queue (Clean) - client-only realtime via GUN (public relays)
   Note: This is convenience-auth (PIN) for internal use; not a hardened security system.
*/
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  const ICONS = {
    link: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 20 6v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    users: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    tv: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 21h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 3l4 5 4-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    wrench: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4l-5.3 5.3a2 2 0 1 0 2.8 2.8l5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-2.8-2.8 3-3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    image: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="8" r="1.5" fill="currentColor"/></svg>`
  };

  function toast(el, msg, kind=""){
    if(!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(()=> el.style.opacity="0.85", 2400);
  }

  async function sha256(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const bytes = Array.from(new Uint8Array(buf));
    return bytes.map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  function beep(kind="men"){
    // WebAudio simple tone patterns (no external files)
    try{
      const ctx = beep._ctx || (beep._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = (kind==="women") ? 880 : 660;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now+0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(now);
      o.stop(now+0.24);

      // second short chirp
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type="triangle";
      o2.frequency.value = (kind==="women") ? 990 : 740;
      g2.gain.setValueAtTime(0.0001, now+0.26);
      g2.gain.exponentialRampToValueAtTime(0.14, now+0.28);
      g2.gain.exponentialRampToValueAtTime(0.0001, now+0.40);
      o2.connect(g2); g2.connect(ctx.destination);
      o2.start(now+0.26);
      o2.stop(now+0.42);
    }catch(e){}
  }

  function parseRoom(){
    const url = new URL(location.href);
    const room = url.searchParams.get("room") || localStorage.getItem("tq_room") || "sohar-demo";
    localStorage.setItem("tq_room", room);
    return room;
  }

  function makeGun(){
    // Use multiple public relays for better chance of connection.
    // For best reliability, host your own "relay peer" later.
    const peers = [
      "https://gun-manhattan.herokuapp.com/gun",
      "https://try.axe.eco/gun",
      "https://test.era.eco/gun"
    ];
    return Gun({ peers });
  }

  function stateRef(gun, room){
    return gun.get("traffic_queue_clean").get(room);
  }

  function defaults(){
    return {
      settings: { historyLimit: 15, instituteName: "معهد السلامة المرورية - صحار" },
      current: { number: "--", gender: "", staff: "", ts: 0 },
      note: { text: "", staff: "", ts: 0 },
      history: { men: {}, women: {} },
      centerImage: { dataUrl: "", name: "", ts: 0 },
      auth: { adminHash: "", staffHash: "" }
    };
  }

  async function ensureDefaults(ref){
    ref.once((d)=>{
      if(!d || !d.settings){
        ref.put(defaults());
      }
    });
  }

  function setConn(el, ok){
    if(!el) return;
    el.textContent = ok ? "متصل ✅" : "غير متصل…";
    el.style.color = ok ? "rgba(74,222,128,.95)" : "rgba(251,191,36,.95)";
  }

  function listenConn(gun, el){
    // crude indicator: when we receive any update, we call it connected
    let ok = false;
    const tick = () => setConn(el, ok);
    setInterval(tick, 2000);
    gun.on("hi", ()=>{ ok=true; });
    gun.on("bye", ()=>{ ok=false; });
    gun.on("out", ()=>{ /* keep */ });
  }

  // =============== Admin page ===============
  async function initAdmin(){
    const room = parseRoom();
    const gun = makeGun();
    const ref = stateRef(gun, room);
    await ensureDefaults(ref);

    $("#roomValue").value = room;

    const connEl = $("#conn");
    listenConn(gun, connEl);

    // icons
    $("#ic-link").innerHTML = ICONS.link;
    $("#ic-shield").innerHTML = ICONS.shield;
    $("#ic-wrench").innerHTML = ICONS.wrench;
    $("#ic-image").innerHTML = ICONS.image;

    const msg = $("#msg");

    // render settings
    ref.get("settings").on((s)=>{
      if(!s) return;
      $("#instituteName").value = s.instituteName || "";
      $("#historyLimit").value = s.historyLimit || 15;
    });

    // image preview
    ref.get("centerImage").on((img)=>{
      const holder = $("#imgHolder");
      const name = $("#imgName");
      if(img && img.dataUrl){
        holder.innerHTML = `<img alt="center" src="${img.dataUrl}">`;
        name.textContent = img.name ? `الصورة: ${img.name}` : "الصورة مفعّلة";
      }else{
        holder.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,.6);text-align:center">لا توجد صورة مرفوعة</div>`;
        name.textContent = "";
      }
    });

    async function requireAdmin(){
      const pin = $("#adminPin").value.trim();
      if(!pin) return false;
      const stored = await new Promise(res=> ref.get("auth").get("adminHash").once(res));
      if(!stored){
        // first time: set it
        const h = await sha256(pin);
        ref.get("auth").get("adminHash").put(h);
        toast(msg, "تم تعيين رقم سري المدير لأول مرة ✅", "good");
        return true;
      }
      const h = await sha256(pin);
      if(h !== stored){
        toast(msg, "رقم المدير غير صحيح", "bad");
        return false;
      }
      return true;
    }

    $("#setRoom").onclick = () => {
      const newRoom = $("#roomValue").value.trim() || "sohar-demo";
      const url = new URL(location.href);
      url.searchParams.set("room", newRoom);
      location.href = url.toString();
    };

    $("#saveSettings").onclick = async () => {
      if(!(await requireAdmin())) return;
      const instituteName = $("#instituteName").value.trim() || "معهد السلامة المرورية - صحار";
      const historyLimit = Math.max(3, Math.min(60, parseInt($("#historyLimit").value || "15",10)));
      ref.get("settings").put({ instituteName, historyLimit });
      toast(msg, "تم حفظ الإعدادات ✅", "good");
    };

    $("#setStaffPin").onclick = async () => {
      if(!(await requireAdmin())) return;
      const staffPin = $("#staffPin").value.trim();
      if(staffPin.length < 4){
        toast(msg, "اختر رقم للموظف لا يقل عن 4 أرقام", "warn");
        return;
      }
      ref.get("auth").get("staffHash").put(await sha256(staffPin));
      toast(msg, "تم تعيين رقم سري للموظف ✅", "good");
    };

    $("#resetAll").onclick = async () => {
      if(!(await requireAdmin())) return;
      if(!confirm("أكيد تريد تصفير النظام بالكامل؟")) return;
      ref.put(defaults());
      toast(msg, "تم تصفير النظام ✅", "good");
    };

    $("#clearHistory").onclick = async () => {
      if(!(await requireAdmin())) return;
      ref.get("history").put({ men:{}, women:{} });
      toast(msg, "تم مسح سجل الأرقام ✅", "good");
    };

    $("#clearNote").onclick = async () => {
      if(!(await requireAdmin())) return;
      ref.get("note").put({ text:"", staff:"", ts:Date.now() });
      toast(msg, "تم مسح الملاحظة ✅", "good");
    };

    $("#clearImage").onclick = async () => {
      if(!(await requireAdmin())) return;
      ref.get("centerImage").put({ dataUrl:"", name:"", ts:Date.now() });
      toast(msg, "تم حذف الصورة ✅", "good");
    };

    $("#imgFile").addEventListener("change", async (e)=>{
      if(!(await requireAdmin())) return;
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      if(file.size > 700_000){
        toast(msg, "حجم الصورة كبير. يفضّل أقل من 700KB", "warn");
      }
      const dataUrl = await new Promise((res, rej)=>{
        const fr = new FileReader();
        fr.onload = ()=>res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      ref.get("centerImage").put({ dataUrl, name:file.name, ts:Date.now() });
      toast(msg, "تم رفع الصورة لشاشة العرض ✅", "good");
      e.target.value = "";
    });
  }

  // =============== Staff page ===============
  async function initStaff(){
    const room = parseRoom();
    const gun = makeGun();
    const ref = stateRef(gun, room);
    await ensureDefaults(ref);

    $("#roomValue").value = room;

    const connEl = $("#conn");
    listenConn(gun, connEl);

    $("#ic-users").innerHTML = ICONS.users;
    $("#ic-shield").innerHTML = ICONS.shield;
    $("#ic-wrench").innerHTML = ICONS.wrench;

    const msg = $("#msg");

    // Show current state
    ref.get("settings").on((s)=>{
      if(s?.instituteName) $("#instName").textContent = s.instituteName;
    });

    ref.get("current").on((c)=>{
      if(!c) return;
      $("#currentNum").textContent = c.number ?? "--";
      $("#currentMeta").textContent = c.ts ? `آخر نداء: ${new Date(c.ts).toLocaleString("ar-OM")}` : "—";
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
      const pin = $("#staffPin").value.trim();
      if(!pin) { toast(msg,"أدخل رقم الموظف","warn"); return false; }
      const stored = await new Promise(res=> ref.get("auth").get("staffHash").once(res));
      if(!stored){
        toast(msg, "لم يتم تعيين رقم موظف بعد. اطلب من المدير.", "warn");
        return false;
      }
      const h = await sha256(pin);
      if(h !== stored){
        toast(msg, "رقم الموظف غير صحيح", "bad");
        return false;
      }
      return true;
    }

    $("#setRoom").onclick = () => {
      const newRoom = $("#roomValue").value.trim() || "sohar-demo";
      const url = new URL(location.href);
      url.searchParams.set("room", newRoom);
      location.href = url.toString();
    };

    $("#callNext").onclick = async () => {
      if(!(await requireStaff())) return;
      const num = $("#ticketNum").value.trim();
      const gender = $("#gender").value;
      const staffName = $("#staffName").value.trim() || "موظف";
      if(!num){ toast(msg,"أدخل رقم العميل/المتدرب","warn"); return; }
      if(!gender){ toast(msg,"اختر (رجال/نساء)","warn"); return; }

      // read history limit
      const settings = await new Promise(res=> ref.get("settings").once(res));
      const limit = Math.max(3, Math.min(60, parseInt(settings?.historyLimit || 15,10)));

      // update current
      const now = Date.now();
      ref.get("current").put({ number:num, gender, staff:staffName, ts: now });

      // append to gender list with timestamp key
      const bucket = (gender==="women") ? "women" : "men";
      ref.get("history").get(bucket).get(String(now)).put({ number:num, staff:staffName, ts: now });

      // trim: fetch keys and remove oldest beyond limit
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

      toast(msg, "تم النداء ✅", "good");
    };

    $("#sendNote").onclick = async () => {
      if(!(await requireStaff())) return;
      const staffName = $("#staffName").value.trim() || "موظف";
      const text = $("#noteText").value.trim();
      ref.get("note").put({ text, staff:staffName, ts: Date.now() });
      toast(msg, "تم إرسال الملاحظة ✅", "good");
    };

    $("#clearNote").onclick = async () => {
      if(!(await requireStaff())) return;
      ref.get("note").put({ text:"", staff:$("#staffName").value.trim()||"موظف", ts: Date.now() });
      $("#noteText").value = "";
      toast(msg, "تم مسح الملاحظة ✅", "good");
    };

    $("#prev").onclick = async () => {
      if(!(await requireStaff())) return;
      // move to previous from combined history (latest excluding current)
      const hMen = await new Promise(res=> ref.get("history").get("men").once(res));
      const hWomen = await new Promise(res=> ref.get("history").get("women").once(res));
      const all = [];
      for(const [bucket,obj] of [["men",hMen],["women",hWomen]]){
        if(!obj) continue;
        Object.keys(obj).filter(k=>k!=="_").forEach(k=>{
          const v = obj[k];
          if(v && v.number) all.push({ ts: Number(k), gender: bucket==="women"?"women":"men", number: v.number, staff: v.staff||"" });
        });
      }
      all.sort((a,b)=>b.ts-a.ts);
      if(all.length < 2){ toast(msg,"لا يوجد سجل كافٍ للرجوع","warn"); return; }
      const prev = all[1];
      ref.get("current").put({ number: prev.number, gender: prev.gender, staff: prev.staff || ($("#staffName").value.trim()||"موظف"), ts: Date.now() });
      toast(msg,"تم الرجوع للعميل السابق ✅","good");
    };
  }

  // =============== Display page ===============
  async function initDisplay(){
    const room = parseRoom();
    const gun = makeGun();
    const ref = stateRef(gun, room);
    await ensureDefaults(ref);

    $("#roomLabel").textContent = `الغرفة: ${room}`;

    const connEl = $("#conn");
    listenConn(gun, connEl);

    $("#ic-tv").innerHTML = ICONS.tv;

    // institute name
    ref.get("settings").on((s)=>{
      if(s?.instituteName) $("#instName").textContent = s.instituteName;
      $("#limitLabel").textContent = `آخر ${s?.historyLimit || 15} نداء`;
    });

    // current call
    let lastTs = 0;
    ref.get("current").on((c)=>{
      if(!c) return;
      $("#curNumber").textContent = c.number ?? "--";
      $("#curMeta").textContent = c.staff ? `تم النداء بواسطة: ${c.staff}` : "—";
      if(c.ts && c.ts !== lastTs){
        lastTs = c.ts;
        if(c.gender) beep(c.gender);
      }
    });

    // note marquee
    ref.get("note").on((n)=>{
      const span = $("#noteSpan");
      const txt = (n?.text || "").trim();
      if(!txt){
        span.textContent = "—";
        span.style.opacity = ".45";
      }else{
        span.textContent = txt;
        span.style.opacity = "1";
      }
    });

    // center image
    ref.get("centerImage").on((img)=>{
      const holder = $("#imgHolder");
      if(img?.dataUrl){
        holder.innerHTML = `<img alt="center" src="${img.dataUrl}">`;
      }else{
        holder.innerHTML = `<div style="padding:14px;color:rgba(255,255,255,.6);text-align:center">لا توجد صورة</div>`;
      }
    });

    function renderList(obj, target){
      if(!target) return;
      const keys = obj ? Object.keys(obj).filter(k=>k!=="_").sort((a,b)=>Number(b)-Number(a)) : [];
      const numbers = keys.map(k => obj[k]?.number).filter(Boolean);
      target.innerHTML = numbers.map(n=>`<div class="tile">${escapeHtml(n)}</div>`).join("") || `<div style="grid-column:1/-1;color:rgba(255,255,255,.55);text-align:center;padding:10px">لا يوجد</div>`;
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    ref.get("history").get("men").on((h)=> renderList(h, $("#menList")));
    ref.get("history").get("women").on((h)=> renderList(h, $("#womenList")));
  }

  // =============== Boot ===============
  window.TQ = { initAdmin, initStaff, initDisplay };
})();