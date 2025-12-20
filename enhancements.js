/* Safe Enhancements (no changes to app.js) */
(() => {
  const $ = (sel, root=document) => root.querySelector(sel);

  // Read branch same way as main app: URL ?branch=XXX or localStorage 'tq_branch'
  function getBranch(){
    try{
      const u = new URL(location.href);
      const b = (u.searchParams.get("branch") || "").trim();
      if(b) { localStorage.setItem("tq_branch", b); return b; }
    }catch(e){}
    return (localStorage.getItem("tq_branch") || "SOHAR").trim() || "SOHAR";
  }

  // Peers (same spirit as main app). If one fails, others may work.
  const PEERS = [
    "https://gun-manhattan.herokuapp.com/gun",
    "https://test.era.eco/gun"
  ];

  // Local fallback cache (works even when offline / peers down, but only on same device)
  const LS_KEY = (b)=>`tq_results_cache_${b}`;
  function loadCache(b){
    try{ return JSON.parse(localStorage.getItem(LS_KEY(b)) || "{}"); }catch(e){ return {}; }
  }
  function saveCache(b, cache){
    try{ localStorage.setItem(LS_KEY(b), JSON.stringify(cache)); }catch(e){}
  }

  const branch = getBranch();
  let cache = loadCache(branch);

  // Color helpers
  function applyClass(el, res){
    if(!el) return;
    el.classList.remove("pass","fail","absent");
    if(res === "pass") el.classList.add("pass");
    else if(res === "fail") el.classList.add("fail");
    else if(res === "absent") el.classList.add("absent");
  }

  function updateTiles(){
    const lists = [$("#menList"), $("#womenList")].filter(Boolean);
    for(const list of lists){
      const tiles = list.querySelectorAll(".tile");
      tiles.forEach(tile=>{
        const num = (tile.querySelector(".tileNum")?.textContent || "").trim();
        if(!num) return;
        const res = cache[num];
        applyClass(tile, res);
      });
    }
  }

  // Keep current card colored even if display doesn't pick it up (fallback)
  function updateCurrentCard(){
    const num = ($("#curNumber")?.textContent || "").trim();
    if(!num) return;
    const res = cache[num];
    const card = document.querySelector(".bigNumberCard");
    // Only apply if not already colored by main app
    if(card && !card.classList.contains("pass") && !card.classList.contains("fail") && !card.classList.contains("absent")){
      applyClass(card, res);
    }
  }

  // Hook into staff result buttons to update cache immediately (even if peers down)
  function hookStaffButtons(){
    const passBtn = $("#passBtn"), failBtn = $("#failBtn"), absentBtn = $("#absentBtn");
    if(!passBtn && !failBtn && !absentBtn) return;
    const getSelectedNum = () => {
      const sel = $("#gradeNum");
      const v = (sel?.value || "").trim();
      if(v) return v;
      return ($("#currentNum")?.textContent || "").trim();
    };
    const wrap = (btn, res) => {
      if(!btn) return;
      const old = btn.onclick;
      btn.onclick = (ev) => {
        const n = getSelectedNum();
        if(n){
          cache[n] = res;
          saveCache(branch, cache);
          // Update local UI immediately
          applyClass($("#lastNumCard") || document.querySelector(".bigNumberCard"), res);
        }
        try{ if(typeof old === "function") old.call(btn, ev); }catch(e){}
        // Give main app a moment, then repaint lists
        setTimeout(() => { updateTiles(); updateCurrentCard(); }, 250);
      };
    };
    wrap(passBtn, "pass");
    wrap(failBtn, "fail");
    wrap(absentBtn, "absent");
  }

  // Live sync from Gun if available (best effort)
  function hookGun(){
    if(typeof window.Gun !== "function") return;
    try{
      const gun = Gun({ peers: PEERS, localStorage: true, radisk: true });
      const ref = gun.get("traffic_queue_clean").get(branch);

      // Sync results map
      ref.get("results").map().on((val, key)=>{
        if(!key || key === "_") return;
        if(!val){ delete cache[key]; saveCache(branch, cache); updateTiles(); updateCurrentCard(); return; }
        const res = val.result;
        if(res === "pass" || res === "fail" || res === "absent"){
          cache[key] = res;
          saveCache(branch, cache);
          updateTiles();
          updateCurrentCard();
        }
      });

      // Sync current result too (in case results node not filled)
      ref.get("current").on((c)=>{
        const num = String(c?.number || "").trim();
        const res = c?.result;
        if(num && (res==="pass" || res==="fail" || res==="absent")){
          cache[num] = res;
          saveCache(branch, cache);
          updateTiles();
          updateCurrentCard();
        }
      });
    }catch(e){
      // ignore
    }
  }

  // Initial paint + observers
  function boot(){
    hookStaffButtons();
    hookGun();
    updateTiles();
    updateCurrentCard();

    // Observe list changes (numbers added/removed)
    const obsTargets = [$("#menList"), $("#womenList")].filter(Boolean);
    const mo = new MutationObserver(()=>{ updateTiles(); updateCurrentCard(); });
    obsTargets.forEach(t=> mo.observe(t, { childList:true, subtree:true }));
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();