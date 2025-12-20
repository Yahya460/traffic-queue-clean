/* Enhancements (safe add-on; does not touch login/PIN logic) */
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  function branch(){
    try{
      const url = new URL(location.href);
      const b = (url.searchParams.get("branch") || url.searchParams.get("room") || localStorage.getItem("tq_branch") || "SOHAR").toUpperCase();
      localStorage.setItem("tq_branch", b);
      return b;
    }catch(e){ return (localStorage.getItem("tq_branch") || "SOHAR").toUpperCase(); }
  }

  function makeGun(){
    if(typeof Gun === "undefined") return null;
    const peers = ["https://gun-manhattan.herokuapp.com/gun","https://try.axe.eco/gun","https://test.era.eco/gun"];
    return Gun({ peers });
  }

  function refFor(gun, b){ return gun.get("traffic_queue_clean").get(b); }

  function isToday(ts){
    try{
      const d = new Date(ts);
      const n = new Date();
      return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
    }catch(e){ return false; }
  }

  function applyResultClass(el, kind){
    if(!el) return;
    el.classList.remove("pass","fail","absent");
    if(kind==="pass") el.classList.add("pass");
    else if(kind==="fail") el.classList.add("fail");
    else if(kind==="absent") el.classList.add("absent");
  }

  function wireDisplayTiles(ref){
    const watchers = new Map(); // num -> true
    function attachForContainer(container){
      if(!container) return;
      const tiles = container.querySelectorAll(".tile");
      tiles.forEach(tile=>{
        const numEl = tile.querySelector(".tileNum");
        const num = (numEl ? numEl.textContent : "").trim();
        if(!num) return;
        if(watchers.has(num)) return;
        watchers.set(num, true);
        ref.get("results").get(String(num)).on((r)=>{
          applyResultClass(tile, r && r.result);
        });
      });
    }

    const men = $("#menList");
    const women = $("#womenList");
    // Initial attach
    attachForContainer(men); attachForContainer(women);

    // Observe for re-renders
    const obs = new MutationObserver(()=>{ attachForContainer(men); attachForContainer(women); });
    if(men) obs.observe(men, { childList:true, subtree:true });
    if(women) obs.observe(women, { childList:true, subtree:true });
  }

  function ensureAdminStatsUI(){
    const anchor = $("#resetCallsBranch");
    if(!anchor) return null;

    // Avoid duplicates
    if($("#tqStatsWrap")) return $("#tqStatsWrap");

    // Insert after the buttons row that contains resetCallsBranch
    const btnRow = anchor.closest(".btns") || anchor.parentElement;
    const wrap = document.createElement("div");
    wrap.id = "tqStatsWrap";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `
      <div class="pill" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <span class="pill" style="background:rgba(255,255,255,.7)">الإجمالي: <b id="st_total">0</b></span>
          <span class="pill" style="background:rgba(255,255,255,.7)">رجال: <b id="st_men">0</b></span>
          <span class="pill" style="background:rgba(255,255,255,.7)">نساء: <b id="st_women">0</b></span>
          <span class="pill" style="background:rgba(255,255,255,.7)">نجاح: <b id="st_pass">0</b></span>
          <span class="pill" style="background:rgba(255,255,255,.7)">رسوب: <b id="st_fail">0</b></span>
          <span class="pill" style="background:rgba(255,255,255,.7)">غياب: <b id="st_absent">0</b></span>
        </div>
        <button class="danger" id="resetStatsBtn" title="يصفّر الإحصائيات فقط">تصفير الإحصائيات</button>
      </div>
      <small class="help" style="margin-top:6px;display:block">الإحصائيات تخص اليوم الحالي والفرع الحالي فقط.</small>
    `;
    if(btnRow && btnRow.parentElement){
      btnRow.parentElement.insertBefore(wrap, btnRow.nextSibling);
    }else{
      anchor.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
  }

  function wireAdminStats(ref){
    const wrap = ensureAdminStatsUI();
    if(!wrap) return;

    let resetTs = 0;
    const latest = {}; // num -> {result, gender, ts}

    function render(){
      let total=0, men=0, women=0, pass=0, fail=0, absent=0;
      for(const k of Object.keys(latest)){
        const r = latest[k];
        if(!r || !r.ts) continue;
        if(r.ts < resetTs) continue;
        if(!isToday(r.ts)) continue;
        total += 1;
        if((r.gender||"")==="men") men += 1;
        else if((r.gender||"")==="women") women += 1;
        if(r.result==="pass") pass += 1;
        else if(r.result==="fail") fail += 1;
        else if(r.result==="absent") absent += 1;
      }
      const set = (id, v)=>{ const el=$("#"+id); if(el) el.textContent=String(v); };
      set("st_total", total);
      set("st_men", men);
      set("st_women", women);
      set("st_pass", pass);
      set("st_fail", fail);
      set("st_absent", absent);
    }

    ref.get("statsResetTs").on((v)=>{
      if(typeof v === "number") resetTs = v;
      else if(v && typeof v.ts === "number") resetTs = v.ts;
      render();
    });

    ref.get("results").map().on((val, key)=>{
      if(!key || key === "_") return;
      if(!val){
        delete latest[key];
      }else{
        // keep only essential fields
        latest[key] = {
          result: val.result,
          gender: val.gender,
          ts: val.ts || val.resultAt || val.time || 0
        };
      }
      render();
    });

    const btn = $("#resetStatsBtn");
    if(btn){
      btn.onclick = ()=>{
        if(!confirm("تأكيد: تصفير الإحصائيات لليوم الحالي؟")) return;
        ref.get("statsResetTs").put(Date.now());
      };
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    const gun = makeGun();
    if(!gun) return;
    const b = branch();
    const ref = refFor(gun, b);

    // Display page: color tiles by results
    if($("#menList") && $("#womenList")){
      wireDisplayTiles(ref);
    }

    // Admin page: stats UI
    if($("#saveAdminPin") && $("#resetCallsBranch")){
      wireAdminStats(ref);
    }
  });
})();
