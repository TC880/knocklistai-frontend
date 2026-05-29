import { useState, useEffect, useRef, useCallback } from "react";

const API = import.meta.env?.VITE_API_URL || "https://knocklistai-backend-production.up.railway.app";
const ADMIN_PIN = "solar2026";

const MONTHS = (() => {
  const opts = []; const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      val: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      lbl: d.toLocaleString('default',{month:'long',year:'numeric'})
    });
  }
  return opts;
})();

const PROPERTY_TYPES = ["Single Family Residential","Condo / Townhouse","Multi-Family","Mobile / Manufactured","Any"];
const COUNTS = [25,50,75,100,125,150,200,250,300,400,500,750,1000,"Custom"];
const OUTCOMES = [
  {key:"No Answer",        emoji:"🚪", color:"#7A8FA6"},
  {key:"Not Interested",   emoji:"✋", color:"#C0392B"},
  {key:"Callback",         emoji:"📞", color:"#F5A623"},
  {key:"Appointment Set",  emoji:"⭐", color:"#27AE60"},
  {key:"Already Has Solar",emoji:"☀️", color:"#2471A3"},
  {key:"Come Back Later",  emoji:"🔄", color:"#8E44AD"},
];
const TIER_WINDOWS = [
  {id:"t1",key:"T1",range:"0–3 mo", months:3,  defaultColor:"#E67E22",defaultBg:"#FFF3E0",defaultName:"Tier 1"},
  {id:"t2",key:"T2",range:"3–6 mo", months:6,  defaultColor:"#C0392B",defaultBg:"#FFEBEE",defaultName:"Tier 2"},
  {id:"t3",key:"T3",range:"6–9 mo", months:9,  defaultColor:"#D4AC0D",defaultBg:"#FFFDE7",defaultName:"Tier 3"},
  {id:"t4",key:"T4",range:"9–12 mo",months:12, defaultColor:"#2471A3",defaultBg:"#E3F2FD",defaultName:"Tier 4"},
];
const TIER_COLORS = [
  {fg:"#E67E22",bg:"#FFF3E0"},{fg:"#C0392B",bg:"#FFEBEE"},{fg:"#D4AC0D",bg:"#FFFDE7"},
  {fg:"#2471A3",bg:"#E3F2FD"},{fg:"#27AE60",bg:"#E8F5E9"},{fg:"#8E44AD",bg:"#F3E5F5"},
  {fg:"#16A085",bg:"#E0F2F1"},{fg:"#D35400",bg:"#FBE9E7"},
];
const defaultTiers = () => TIER_WINDOWS.map((w,i)=>({
  ...w,name:w.defaultName,color:TIER_COLORS[i].fg,bg:TIER_COLORS[i].bg,enabled:true,
}));

// ── Tier recalc from sale date string ─────────────────────────────────
const recalcTierKey = (saleDateStr, activeTiers) => {
  if (!saleDateStr || saleDateStr==="N/A") return "UNTIERED";
  const p = saleDateStr.split("/");
  if (p.length!==3) return "UNTIERED";
  const saleDate = new Date(parseInt(p[2]), parseInt(p[0])-1, parseInt(p[1]));
  const monthsAgo = (new Date() - saleDate)/(1000*60*60*24*30.44);
  for (const t of activeTiers.filter(t=>t.enabled)) {
    if (monthsAgo <= t.months) return t.key;
  }
  return "UNTIERED";
};

// ── Helpers ────────────────────────────────────────────────────────────
const post = async (url, form) => {
  const fd = new FormData();
  Object.entries(form).forEach(([k,v]) => fd.append(k, String(v)));
  const r = await fetch(API+url,{method:"POST",body:fd});
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail||"Request failed");
  return d;
};
const get = async (url) => {
  const r = await fetch(API+url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail||"Request failed");
  return d;
};
const dlFile = (b64,name,mime) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],{type:mime}));
  a.download=name; a.click();
};
const navUrl = (addr, pref) => pref==="waze"
  ? `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;

const TierBadge = ({name,color}) => (
  <span style={{background:color+"22",border:`1px solid ${color}55`,borderRadius:4,
    padding:"2px 8px",fontSize:11,fontWeight:700,color,whiteSpace:"nowrap"}}>{name}</span>
);
const StatusBadge = ({status}) => {
  const c = status==="ready"
    ? {bg:"#0D2B1A",border:"#27AE60",color:"#27AE60",label:"✓ Ready"}
    : {bg:"#1A1400",border:"#F5A623",color:"#F5A623",label:"⏳ Pending"};
  return <span style={{background:c.bg,border:`1px solid ${c.border}`,color:c.color,
    borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.label}</span>;
};

// ── Map View Component ──────────────────────────────────────────────
function MapView({stops, tiers, currentStopNum, navPref, openEdit}) {
  const mapRef    = useRef(null);
  const mapObjRef = useRef(null);

  const tierColor = (k) => tiers.find(t=>t.key===k)?.color || "#7A8FA6";

  const loadLeaflet = (cb) => {
    if (window.L) { cb(); return; }
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = cb;
      document.head.appendChild(script);
    } else {
      const check = setInterval(() => { if (window.L) { clearInterval(check); cb(); }}, 100);
    }
  };

  useEffect(() => {
    const withCoords = stops.filter(s => s.lat && s.lon);
    if (!withCoords.length) return;

    loadLeaflet(() => {
      if (mapObjRef.current) {
        mapObjRef.current.remove();
        mapObjRef.current = null;
      }
      if (!mapRef.current) return;
      const L = window.L;
      const avgLat = withCoords.reduce((a,s)=>a+s.lat,0)/withCoords.length;
      const avgLon = withCoords.reduce((a,s)=>a+s.lon,0)/withCoords.length;
      const map = L.map(mapRef.current, {zoomControl:true}).setView([avgLat,avgLon],13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:"© OpenStreetMap", maxZoom:19
      }).addTo(map);
      mapObjRef.current = map;

      // Draw route line through all stops in order
      const pending = withCoords.filter(s=>s.status!=="complete");
      if (pending.length > 1) {
        const latlngs = pending.map(s=>[s.lat,s.lon]);
        L.polyline(latlngs, {color:"#27AE60",weight:2,opacity:0.5,dashArray:"6,8"}).addTo(map);
      }

      // Plot each stop
      withCoords.forEach(s => {
        const isDone    = s.status === "complete";
        const isCurrent = s.stop_num === currentStopNum;
        const color     = isDone ? "#555" : tierColor(s.tier_key);
        const radius    = isCurrent ? 13 : 8;

        const marker = L.circleMarker([s.lat,s.lon], {
          radius, fillColor:color,
          color: isCurrent ? "white" : "rgba(255,255,255,0.4)",
          weight: isCurrent ? 3 : 1,
          fillOpacity: isDone ? 0.4 : 0.9
        }).addTo(map);

        const wazeUrl   = "https://waze.com/ul?q=" + encodeURIComponent(s.full_address) + "&navigate=yes";
        const googleUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(s.full_address) + "&travelmode=driving";
        const navLink   = navPref === "waze" ? wazeUrl : googleUrl;
        const navLabel  = navPref === "waze" ? "Waze" : "Google Maps";

        const popupHtml = '<div style="font-family:system-ui;min-width:190px;padding:2px">'
          + '<div style="font-weight:800;font-size:13px;margin-bottom:3px">Stop #' + s.stop_num + '</div>'
          + '<div style="font-size:12px;margin-bottom:2px">' + s.address + '</div>'
          + '<div style="font-size:11px;color:#888;margin-bottom:8px">' + s.owner + ' &bull; ' + s.sale_date + '</div>'
          + '<a href="' + navLink + '" target="_blank" '
          + 'style="display:block;background:#1565C0;color:white;border-radius:6px;padding:7px;'
          + 'text-align:center;text-decoration:none;font-size:12px;font-weight:700;margin-bottom:6px">'
          + 'Navigate with ' + navLabel + '</a>'
          + (isDone ? '<div style="font-size:11px;color:#27AE60;font-weight:700;text-align:center">✓ ' + (s.outcome||"Complete") + '</div>' : '')
          + '</div>';

        marker.bindPopup(popupHtml);
      });

      // Fit map to all stops
      if (withCoords.length > 1) {
        map.fitBounds(L.latLngBounds(withCoords.map(s=>[s.lat,s.lon])), {padding:[30,30]});
      }
    });

    return () => {
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
    };
  }, [stops.length, currentStopNum]);

  const stopsWithCoords = stops.filter(s=>s.lat&&s.lon);

  if (!stopsWithCoords.length) return (
    <div style={{background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:12,
      padding:32,textAlign:"center",color:"#4A6075"}}>
      No coordinate data — generate a new route to see the map.
    </div>
  );

  return (
    <div>
      <div ref={mapRef} style={{height:440,borderRadius:12,overflow:"hidden",
        border:"1px solid #1E2D3D",background:"#0D1520"}}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
        {tiers.filter(t=>t.enabled).map(t=>(
          <div key={t.key} style={{display:"flex",alignItems:"center",gap:5,
            background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:20,padding:"3px 10px"}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:t.color}}/>
            <span style={{fontSize:11,color:"white",fontWeight:600}}>{t.name}</span>
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:5,
          background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:20,padding:"3px 10px"}}>
          <div style={{width:22,height:3,background:"#27AE60",opacity:0.5,borderRadius:2,
            borderTop:"2px dashed #27AE60"}}/>
          <span style={{fontSize:11,color:"#7A8FA6"}}>Route</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,
          background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:20,padding:"3px 10px"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:"#555"}}/>
          <span style={{fontSize:11,color:"#7A8FA6"}}>Done</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// APP ROOT
// ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen]  = useState("login");
  const [repName, setRepName] = useState("");
  const [repId,   setRepId]   = useState("");
  const [pin,     setPin]     = useState("");
  const [loginErr,setLoginErr]= useState("");
  const [loginTab,setLoginTab]= useState("rep");

  const loginRep = () => {
    if (!repName.trim()){setLoginErr("Enter your name");return;}
    setRepId(repName.trim().toLowerCase().replace(/\s+/g,"_"));
    setScreen("rep"); setLoginErr("");
  };
  const loginAdmin = () => {
    if (pin!==ADMIN_PIN){setLoginErr("Wrong PIN");return;}
    setScreen("admin"); setLoginErr("");
  };

  if (screen==="login") return (
    <div style={{minHeight:"100vh",background:"#080E14",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"system-ui,sans-serif",padding:"20px"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,background:"linear-gradient(135deg,#F5A623,#E8820C)",
            borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:30,margin:"0 auto 14px"}}>☀️</div>
          <div style={{fontSize:26,fontWeight:800,color:"white",letterSpacing:"-0.5px"}}>
            KnockList<span style={{color:"#F5A623"}}>AI</span></div>
          <div style={{fontSize:13,color:"#4A6075",marginTop:5}}>Solar door-knock routes, instantly</div>
        </div>
        <div style={{display:"flex",background:"#0D1520",borderRadius:12,padding:4,
          marginBottom:16,border:"1px solid #1E2D3D"}}>
          {[["rep","Sales Rep"],["admin","Admin"]].map(([t,l])=>(
            <button key={t} onClick={()=>setLoginTab(t)} style={{flex:1,padding:"10px 0",
              background:loginTab===t?"#1E2D3D":"transparent",border:"none",borderRadius:9,
              color:loginTab===t?"white":"#4A6075",fontSize:14,fontWeight:600,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:16,padding:24}}>
          {loginTab==="rep"?(<>
            <label style={{fontSize:11,fontWeight:600,color:"#F5A623",letterSpacing:"1px",
              textTransform:"uppercase",display:"block",marginBottom:8}}>Your Name</label>
            <input value={repName} onChange={e=>setRepName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&loginRep()} placeholder="e.g. Justin Torres"
              style={{width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:10,
                color:"white",padding:"14px 16px",fontSize:16,outline:"none",
                boxSizing:"border-box",marginBottom:14}}/>
            <button onClick={loginRep} style={{width:"100%",
              background:"linear-gradient(135deg,#F5A623,#E8820C)",border:"none",
              borderRadius:12,color:"#0A0A0A",fontWeight:800,fontSize:16,
              padding:"14px 0",cursor:"pointer"}}>Sign In →</button>
          </>):(<>
            <label style={{fontSize:11,fontWeight:600,color:"#F5A623",letterSpacing:"1px",
              textTransform:"uppercase",display:"block",marginBottom:8}}>Admin PIN</label>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&loginAdmin()} placeholder="Enter PIN"
              style={{width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:10,
                color:"white",padding:"14px 16px",fontSize:16,outline:"none",
                boxSizing:"border-box",marginBottom:14}}/>
            <button onClick={loginAdmin} style={{width:"100%",
              background:"linear-gradient(135deg,#1B4F2E,#27AE60)",border:"none",
              borderRadius:12,color:"white",fontWeight:800,fontSize:16,
              padding:"14px 0",cursor:"pointer"}}>Admin Access →</button>
          </>)}
          {loginErr&&<div style={{marginTop:10,fontSize:13,color:"#FF6B6B",textAlign:"center"}}>{loginErr}</div>}
        </div>
      </div>
    </div>
  );

  if (screen==="rep")   return <RepDashboard   repId={repId} repName={repName} onLogout={()=>{setScreen("login");setPin("");}} />;
  if (screen==="admin") return <AdminDashboard onLogout={()=>{setScreen("login");setPin("");}} />;
}

// ══════════════════════════════════════════════════════════════════════
// REP DASHBOARD — mobile-first with bottom tab bar
// ══════════════════════════════════════════════════════════════════════
function RepDashboard({repId,repName,onLogout}) {
  const [tab,       setTab]      = useState("request");
  const [requests,  setRequests] = useState([]);
  const [routes,    setRoutes]   = useState([]);
  const [driveRoute,setDriveRoute]=useState(null);
  const [loading,   setLoading]  = useState(false);
  const [msg,       setMsg]      = useState("");

  // Request form
  const [zips,      setZips]     = useState("");
  const [dateFrom,  setDateFrom] = useState("");
  const [dateTo,    setDateTo]   = useState("");
  const [priceMin,  setPriceMin] = useState("");
  const [priceMax,  setPriceMax] = useState("");
  const [ownerOcc,  setOwnerOcc] = useState("Any");
  const [propType,  setPropType] = useState("Single Family Residential");
  const [homeCount, setHomeCount]= useState(100);
  const [customCnt, setCustomCnt]= useState("");
  const [startAddr, setStartAddr]= useState("");
  const [note,      setNote]     = useState("");
  const [reqErr,    setReqErr]   = useState("");

  // Generate form
  const [selReq,    setSelReq]   = useState(null);
  const [homeBase,  setHomeBase] = useState("");
  const [genCount,  setGenCount] = useState(100);
  const [customGen, setCustomGen]= useState("");
  const [tiers,     setTiers]    = useState(defaultTiers());
  const [quickFilter,setQuickFilter]=useState("all");
  const [preserveOrder,setPreserveOrder]=useState(false);
  const [label,     setLabel]    = useState("");
  const [genResult, setGenResult]= useState(null);
  const [genErr,    setGenErr]   = useState("");

  const loadRequests = async () => {
    try { const d=await get(`/rep/${repId}/requests`); setRequests(d.requests); } catch{}
  };
  const loadRoutes = async () => {
    try { const d=await get(`/rep/${repId}/routes`); setRoutes(d.routes); } catch{}
  };
  const loadDriveRoute = async (id) => {
    try { const d=await get(`/route/${id}`); setDriveRoute(d); } catch{}
  };

  useEffect(()=>{ loadRequests(); loadRoutes(); },[]);
  useEffect(()=>{
    if(tab==="requests"||tab==="generate") loadRequests();
    if(tab==="drive") loadRoutes();
  },[tab]);

  const readyReqs = requests.filter(r=>r.status==="ready");

  const submitRequest = async () => {
    const zl=zips.trim().split(/[\n,]+/).map(z=>z.trim()).filter(z=>z.length>0);
    if(!zl.length){setReqErr("Enter at least one location (ZIP, city, or county)");return;}
    const cnt=homeCount==="Custom"?customCnt||100:homeCount;
    setLoading(true);setReqErr("");
    try {
      const d=await post("/rep/request",{
        rep_id:repId,rep_name:repName,zips:zl.join(","),
        sale_date_from:dateFrom,sale_date_to:dateTo,
        price_min:priceMin,price_max:priceMax,
        owner_occupied:ownerOcc,property_type:propType,
        home_count:String(cnt),start_address:startAddr,note
      });
      setMsg(`✓ Request #${d.request_id} submitted`);
      setZips("");setNote("");setStartAddr("");setDateFrom("");setDateTo("");
      setPriceMin("");setPriceMax("");setOwnerOcc("Any");
      setPropType("Single Family Residential");setHomeCount(100);setCustomCnt("");
      await loadRequests(); setTab("requests");
    } catch(e){setReqErr(e.message);}
    finally{setLoading(false);}
  };

  const generate = async () => {
    if(!selReq){setGenErr("Select a fulfilled request first");return;}
    const activeTiers=tiers.filter(t=>t.enabled);
    if(!activeTiers.length){setGenErr("Enable at least one tier");return;}
    const cnt=genCount==="Custom"?(parseInt(customGen)||100):genCount;
    const tierConfig=JSON.stringify(activeTiers.map(t=>({
      key:t.key,name:t.name,color:t.color,bg:t.bg,range:t.range
    })));
    // Apply quick filter to date range
    let dfrom="", dto="";
    if(quickFilter!=="all"){
      const now=new Date();
      const m={last1:1,last3:3,last6:6,last9:9}[quickFilter]||0;
      if(m){
        const from=new Date(now.getFullYear(),now.getMonth()-m,1);
        dfrom=`${from.getFullYear()}-${String(from.getMonth()+1).padStart(2,'0')}-01`;
        dto=now.toISOString().split("T")[0];
      }
    }
    setLoading(true);setGenErr("");setGenResult(null);
    try {
      const d=await post("/rep/generate",{
        request_id:selReq.id,home_base:homeBase||selReq.filters?.start_address||"",
        price_max:800000,home_count:cnt,
        t1_months:3,t2_months:6,t3_months:9,t4_months:12,
        tier_config:tierConfig,date_from:dfrom,date_to:dto,
        label:label||`${repName} — ${new Date().toLocaleDateString()}`,
        preserve_order:String(preserveOrder),
      });
      setGenResult(d);
    } catch(e){setGenErr(e.message);}
    finally{setLoading(false);}
  };

  const C = {bg:"#080E14",card:"#0D1520",border:"#1E2D3D",sun:"#F5A623",green:"#27AE60"};
  const card={background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18};
  const lbl={fontSize:11,fontWeight:600,color:C.sun,letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:8};
  const inp={width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:10,
    color:"white",padding:"12px 14px",fontSize:15,outline:"none",boxSizing:"border-box"};

  const TABS=[
    {id:"request",  icon:"📋", label:"Request"},
    {id:"requests", icon:"📥", label:"Requests", badge:readyReqs.length},
    {id:"generate", icon:"⚡", label:"Generate"},
    {id:"drive",    icon:"🚗", label:"Drive",    green:true},
  ];

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",
      color:"white",paddingBottom:80}}>

      {/* Header */}
      <div style={{background:"#0A1118",borderBottom:`1px solid ${C.border}`,
        padding:"0 16px",height:52,display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#F5A623,#E8820C)",
            borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>☀️</div>
          <span style={{fontWeight:800,fontSize:15}}>KnockList<span style={{color:C.sun}}>AI</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:"#7A8FA6"}}>👤 {repName}</span>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2A3D50",
            borderRadius:8,color:"#7A8FA6",fontSize:12,padding:"5px 10px",cursor:"pointer"}}>
            Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"16px 14px"}}>

        {/* ── REQUEST ── */}
        {tab==="request" && (
          <div style={{display:"grid",gap:14}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:800,margin:0}}>Request Data</h2>
              <p style={{color:"#4A6075",fontSize:13,margin:"5px 0 0"}}>
                Your admin pulls this exact data and uploads it to your portal.
              </p>
            </div>
            {msg&&<div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:10,
              padding:"12px 16px",fontSize:14,color:"#27AE60"}}>{msg}</div>}

            <div style={card}>
              <span style={lbl}>Location</span>
              <textarea value={zips} onChange={e=>setZips(e.target.value)}
                placeholder={"ZIP codes: 33596, 33511
Towns: Valrico, Brandon, Riverview
Counties: Hillsborough County
Or mix: 33596, Brandon, Valrico"}
                style={{...inp,height:100,resize:"none",lineHeight:1.6,fontFamily:"inherit"}}/>
              <p style={{margin:"6px 0 0",fontSize:12,color:"#4A6075"}}>
                Enter any combination of ZIP codes, city names, or county names
              </p>
            </div>

            <div style={card}>
              <span style={lbl}>Sale Date Range</span>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:6,fontWeight:600}}>FROM</span>
                  <select value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                    style={{...inp,cursor:"pointer"}}>
                    <option value="">No limit</option>
                    {MONTHS.map(m=><option key={m.val} value={m.val}>{m.lbl}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:6,fontWeight:600}}>TO</span>
                  <select value={dateTo} onChange={e=>setDateTo(e.target.value)}
                    style={{...inp,cursor:"pointer"}}>
                    <option value="">No limit</option>
                    {MONTHS.map(m=><option key={m.val} value={m.val}>{m.lbl}</option>)}
                  </select>
                </div>
              </div>
              {dateFrom&&dateTo&&(
                <div style={{marginTop:10,background:"#0D2B1A",border:"1px solid #1A3A2A",
                  borderRadius:8,padding:"8px 12px",fontSize:13,color:"#27AE60"}}>
                  ✓ {MONTHS.find(m=>m.val===dateFrom)?.lbl} → {MONTHS.find(m=>m.val===dateTo)?.lbl}
                </div>
              )}
            </div>

            <div style={card}>
              <span style={lbl}>Sale Price Range</span>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:6,fontWeight:600}}>MIN</span>
                  <input value={priceMin?("$"+Number(priceMin.replace(/\D/g,"")||0).toLocaleString()):""}
                    onChange={e=>setPriceMin(e.target.value.replace(/\D/g,""))}
                    placeholder="e.g. $200,000" style={inp}/>
                </div>
                <div>
                  <span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:6,fontWeight:600}}>MAX</span>
                  <input value={priceMax?("$"+Number(priceMax.replace(/\D/g,"")||0).toLocaleString()):""}
                    onChange={e=>setPriceMax(e.target.value.replace(/\D/g,""))}
                    placeholder="e.g. $800,000" style={inp}/>
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={card}>
                <span style={lbl}>Owner Occupied</span>
                {["Yes","No","Any"].map(o=>(
                  <button key={o} onClick={()=>setOwnerOcc(o)}
                    style={{display:"block",width:"100%",padding:"12px 14px",borderRadius:10,
                      textAlign:"left",marginBottom:8,
                      border:`2px solid ${ownerOcc===o?"#F5A623":"#2A3D50"}`,
                      background:ownerOcc===o?"#3A2800":"transparent",
                      color:ownerOcc===o?"#F5A623":"#7A8FA6",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                    {o==="Yes"?"✓ Owner Occ.":o==="No"?"✗ Non-Owner":"— Any"}
                  </button>
                ))}
              </div>
              <div style={card}>
                <span style={lbl}>Property Type</span>
                {PROPERTY_TYPES.map(p=>(
                  <button key={p} onClick={()=>setPropType(p)}
                    style={{display:"block",width:"100%",padding:"10px 12px",borderRadius:10,
                      textAlign:"left",marginBottom:8,
                      border:`2px solid ${propType===p?"#F5A623":"#2A3D50"}`,
                      background:propType===p?"#3A2800":"transparent",
                      color:propType===p?"#F5A623":"#7A8FA6",fontSize:12,fontWeight:600,cursor:"pointer"}}>{p}</button>
                ))}
              </div>
            </div>

            <div style={card}>
              <span style={lbl}>Records Needed</span>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                {COUNTS.map(c=>(
                  <button key={c} onClick={()=>{setHomeCount(c);if(c!=="Custom")setCustomCnt("");}}
                    style={{padding:"10px 16px",borderRadius:10,
                      border:`2px solid ${homeCount===c?"#F5A623":"#2A3D50"}`,
                      background:homeCount===c?"#3A2800":"transparent",
                      color:homeCount===c?"#F5A623":"#7A8FA6",fontSize:14,fontWeight:600,cursor:"pointer"}}>{c}</button>
                ))}
              </div>
              {homeCount==="Custom"&&<input type="number" value={customCnt}
                onChange={e=>setCustomCnt(e.target.value)} placeholder="Enter number..."
                style={{...inp,width:200}}/>}
            </div>

            <div style={card}>
              <span style={lbl}>Your Starting Address</span>
              <input value={startAddr} onChange={e=>setStartAddr(e.target.value)}
                placeholder="e.g. 2003 River Crossing Dr, Valrico, FL 33596" style={inp}/>
              <p style={{margin:"8px 0 0",fontSize:12,color:"#4A6075"}}>
                Route will be optimized closest-to-closest from here
              </p>
            </div>

            <div style={card}>
              <span style={lbl}>Notes for Admin (optional)</span>
              <input value={note} onChange={e=>setNote(e.target.value)}
                placeholder="e.g. Focus Tier 2, need by Tuesday" style={inp}/>
            </div>

            {reqErr&&<div style={{background:"#2B0A0A",border:"1px solid #C0392B",
              borderRadius:10,padding:"12px 16px",fontSize:14,color:"#FF6B6B"}}>{reqErr}</div>}

            <button onClick={submitRequest} disabled={loading}
              style={{background:loading?"#2A3D50":"linear-gradient(135deg,#F5A623,#E8820C)",
                border:"none",borderRadius:14,color:"#0A0A0A",fontWeight:800,
                fontSize:16,padding:"16px 0",cursor:loading?"default":"pointer"}}>
              {loading?"Submitting…":"📤  Submit Data Request"}
            </button>
          </div>
        )}

        {/* ── MY REQUESTS ── */}
        {tab==="requests" && (
          <div style={{display:"grid",gap:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <h2 style={{fontSize:22,fontWeight:800,margin:0}}>My Requests</h2>
                <p style={{color:"#4A6075",fontSize:13,margin:"5px 0 0"}}>
                  {readyReqs.length>0?`${readyReqs.length} ready — go to Generate`:"Waiting for admin to upload"}
                </p>
              </div>
              <button onClick={loadRequests} style={{background:"#1E2D3D",border:"none",
                borderRadius:10,color:"#7A8FA6",fontSize:14,padding:"10px 16px",cursor:"pointer"}}>↻</button>
            </div>
            {requests.length===0?(
              <div style={{...card,textAlign:"center",padding:40,color:"#4A6075"}}>
                No requests yet. Go to Request to get started.
              </div>
            ):requests.map(req=>(
              <div key={req.id} style={card}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"monospace",fontSize:12,color:"#4A6075",
                        background:"#1E2D3D",padding:"3px 8px",borderRadius:5}}>#{req.id}</span>
                      <StatusBadge status={req.status}/>
                    </div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>
                      ZIPs: {req.zips.join(", ")}
                    </div>
                    <div style={{fontSize:12,color:"#4A6075"}}>
                      {req.created}{req.fulfilled&&<> · {req.row_count?.toLocaleString()} homes loaded</>}
                    </div>
                    {req.note&&<div style={{fontSize:13,color:"#7A8FA6",marginTop:4,fontStyle:"italic"}}>"{req.note}"</div>}
                  </div>
                  {req.status==="ready"&&(
                    <button onClick={()=>{
                      setSelReq(req);
                      if(req.filters?.start_address) setHomeBase(req.filters.start_address);
                      setTab("generate");
                    }} style={{background:"linear-gradient(135deg,#27AE60,#1E8449)",border:"none",
                      borderRadius:10,color:"white",fontWeight:700,fontSize:13,
                      padding:"10px 16px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                      Generate →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── GENERATE ── */}
        {tab==="generate" && (
          <div style={{display:"grid",gap:14}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:800,margin:0}}>Generate List</h2>
              <p style={{color:"#4A6075",fontSize:13,margin:"5px 0 0"}}>
                Configure tiers, set count, generate your routed list.
              </p>
            </div>

            {/* Select request */}
            <div style={card}>
              <span style={lbl}>Select Data</span>
              {readyReqs.length===0?(
                <div style={{fontSize:14,color:"#4A6075"}}>No fulfilled requests yet.</div>
              ):readyReqs.map(req=>(
                <div key={req.id} onClick={()=>{
                  setSelReq(selReq?.id===req.id?null:req);
                  if(selReq?.id!==req.id&&req.filters?.start_address) setHomeBase(req.filters.start_address);
                }} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                  background:selReq?.id===req.id?"#0D2B1A":"#080E14",
                  border:`2px solid ${selReq?.id===req.id?"#27AE60":"#2A3D50"}`,
                  borderRadius:12,cursor:"pointer",marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>ZIPs: {req.zips.join(", ")}</div>
                    <div style={{fontSize:12,color:"#4A6075",marginTop:2}}>
                      {req.row_count?.toLocaleString()||"—"} homes · {req.fulfilled}
                    </div>
                  </div>
                  <div style={{width:22,height:22,borderRadius:"50%",
                    background:selReq?.id===req.id?"#27AE60":"transparent",
                    border:`2.5px solid ${selReq?.id===req.id?"#27AE60":"#2A3D50"}`,flexShrink:0}}/>
                </div>
              ))}
            </div>

            {selReq&&(<>
              {/* Quick date filter */}
              <div style={card}>
                <span style={lbl}>⚡ Move-In Window Filter</span>
                <p style={{fontSize:12,color:"#4A6075",marginBottom:12}}>
                  Toggle to instantly focus on a specific time window. Route rebuilds automatically.
                </p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[["all","All dates"],["last1","Last month"],["last3","1–3 months"],
                    ["last6","3–6 months"],["last9","6–9 months"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setQuickFilter(k)}
                      style={{padding:"10px 14px",borderRadius:20,fontSize:13,fontWeight:600,cursor:"pointer",
                        border:`2px solid ${quickFilter===k?"#C0392B":"#2A3D50"}`,
                        background:quickFilter===k?"#2B0A0A":"transparent",
                        color:quickFilter===k?"#C0392B":"#7A8FA6"}}>{l}</button>
                  ))}
                </div>
                {quickFilter!=="all"&&(
                  <div style={{marginTop:10,background:"#0D2B1A",border:"1px solid #1A3A2A",
                    borderRadius:8,padding:"8px 12px",fontSize:13,color:"#27AE60"}}>
                    ✓ Route will only include homes from this window
                  </div>
                )}
              </div>

              {/* Route order toggle */}
              <div style={card}>
                <span style={lbl}>🗺 Route Order</span>
                <p style={{fontSize:12,color:"#4A6075",marginBottom:12}}>
                  If your data was already sorted in a specific order (like an EZ Route export), keep it.
                  Otherwise let KnockListAI build the most efficient route.
                </p>
                <div style={{display:"flex",background:"#0A1118",borderRadius:10,padding:4,
                  border:"1px solid #1E2D3D"}}>
                  {[[false,"⚡ Auto-Optimize (recommended)"],[true,"📋 Keep Uploaded Order"]].map(([val,lbl2])=>(
                    <button key={String(val)} onClick={()=>setPreserveOrder(val)}
                      style={{flex:1,padding:"12px 8px",background:preserveOrder===val?"#1E2D3D":"transparent",
                        border:"none",borderRadius:8,color:preserveOrder===val?"white":"#4A6075",
                        fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"center"}}>{lbl2}</button>
                  ))}
                </div>
                {preserveOrder&&(
                  <div style={{marginTop:10,background:"#0D2B1A",border:"1px solid #1A3A2A",
                    borderRadius:8,padding:"8px 12px",fontSize:13,color:"#27AE60"}}>
                    ✓ Stops will follow the order from your uploaded file
                  </div>
                )}
              </div>

              <div style={card}>
                <span style={lbl}>List Name</span>
                <input value={label} onChange={e=>setLabel(e.target.value)}
                  placeholder={`${repName} — ${new Date().toLocaleDateString()}`} style={inp}/>
              </div>

              <div style={card}>
                <span style={lbl}>Number of Homes</span>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                  {COUNTS.map(c=>(
                    <button key={c} onClick={()=>{setGenCount(c);if(c!=="Custom")setCustomGen("");}}
                      style={{padding:"10px 14px",borderRadius:10,
                        border:`2px solid ${genCount===c?"#F5A623":"#2A3D50"}`,
                        background:genCount===c?"#3A2800":"transparent",
                        color:genCount===c?"#F5A623":"#7A8FA6",fontSize:13,fontWeight:600,cursor:"pointer"}}>{c}</button>
                  ))}
                </div>
                {genCount==="Custom"&&<input type="number" value={customGen}
                  onChange={e=>setCustomGen(e.target.value)} placeholder="Enter number..."
                  style={{...inp,width:200}}/>}
              </div>

              <div style={card}>
                <span style={lbl}>Starting Address</span>
                <input value={homeBase} onChange={e=>setHomeBase(e.target.value)} style={inp}/>
                <p style={{margin:"8px 0 0",fontSize:12,color:"#4A6075"}}>
                  Route built closest-to-closest from here
                </p>
              </div>

              {/* Tier builder */}
              <div style={card}>
                <span style={lbl}>Lead Tiers</span>
                <p style={{fontSize:12,color:"#4A6075",marginBottom:14}}>
                  Tiers auto-update daily — a home moves from Tier 1 to Tier 2 automatically as time passes.
                  Toggle on/off, rename, click color circle to change.
                </p>
                <div style={{display:"grid",gap:10}}>
                  {TIER_WINDOWS.map((win,i) => {
                    const t=tiers[i];
                    return (
                      <div key={win.id} style={{background:t.enabled?"#080E14":"#060A0F",
                        border:`2px solid ${t.enabled?t.color:"#1E2D3D"}`,
                        borderRadius:12,padding:"12px 14px",opacity:t.enabled?1:0.5}}>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div onClick={()=>{const n=[...tiers];n[i]={...n[i],enabled:!n[i].enabled};setTiers(n);}}
                            style={{width:40,height:22,borderRadius:11,cursor:"pointer",flexShrink:0,
                              background:t.enabled?"#27AE60":"#2A3D50",position:"relative"}}>
                            <div style={{position:"absolute",top:3,left:t.enabled?20:3,
                              width:16,height:16,borderRadius:"50%",background:"white",transition:"left 0.15s"}}/>
                          </div>
                          <div onClick={()=>{const n=[...tiers];const ci=TIER_COLORS.findIndex(c=>c.fg===t.color);
                            const ni=(ci+1)%TIER_COLORS.length;n[i]={...n[i],color:TIER_COLORS[ni].fg,bg:TIER_COLORS[ni].bg};setTiers(n);}}
                            style={{width:22,height:22,borderRadius:"50%",background:t.color,
                              cursor:"pointer",border:"2px solid rgba(255,255,255,0.3)",flexShrink:0}}
                            title="Click to change color"/>
                          <span style={{fontSize:12,fontWeight:700,color:t.enabled?t.color:"#4A6075",
                            minWidth:70}}>{win.range}</span>
                          <input value={t.name}
                            onChange={e=>{const n=[...tiers];n[i]={...n[i],name:e.target.value};setTiers(n);}}
                            disabled={!t.enabled}
                            style={{flex:1,background:"#0D1520",border:"1px solid #2A3D50",borderRadius:8,
                              color:"white",padding:"6px 10px",fontSize:14,outline:"none"}}/>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{background:"#060A0F",borderRadius:10,padding:"10px 14px",
                    border:"1px solid #1E2D3D",fontSize:13,color:"#4A6075"}}>
                    🔵 12+ months — included but unlabeled
                  </div>
                </div>
                {/* Live preview */}
                <div style={{marginTop:12,background:"#080E14",borderRadius:10,
                  padding:"10px 14px",border:"1px solid #2A3D50"}}>
                  <span style={{fontSize:11,color:"#4A6075",marginRight:8}}>Preview:</span>
                  {tiers.filter(t=>t.enabled).map(t=>(
                    <span key={t.id} style={{marginRight:8,fontSize:11,fontWeight:700,color:t.color,
                      background:t.color+"22",border:`1px solid ${t.color}44`,
                      borderRadius:4,padding:"2px 8px"}}>{t.name}</span>
                  ))}
                </div>
              </div>

              {genErr&&<div style={{background:"#2B0A0A",border:"1px solid #C0392B",
                borderRadius:10,padding:"12px 16px",fontSize:14,color:"#FF6B6B"}}>{genErr}</div>}

              {genResult?(
                <div style={{display:"grid",gap:12}}>
                  <div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:14,
                    padding:18,display:"flex",alignItems:"center",gap:14}}>
                    <div style={{width:44,height:44,background:"#27AE60",borderRadius:"50%",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>✓</div>
                    <div>
                      <div style={{fontWeight:800,fontSize:16}}>{genResult.label}</div>
                      <div style={{color:"#7A8FA6",fontSize:13,marginTop:2}}>
                        {genResult.total_stops} homes · {genResult.pages} pages
                      </div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <button onClick={()=>dlFile(genResult.pdf_b64,genResult.label+".pdf","application/pdf")}
                      style={{background:"#2B0A0A",border:"1px solid #C0392B",borderRadius:12,
                        padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:26,marginBottom:4}}>📄</div>
                      <div style={{fontWeight:700,fontSize:13,color:"#E74C3C"}}>PDF</div>
                      <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Print-ready</div>
                    </button>
                    <button onClick={()=>dlFile(genResult.csv_b64,genResult.label+".csv","text/csv")}
                      style={{background:"#0A2B16",border:"1px solid #27AE60",borderRadius:12,
                        padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:26,marginBottom:4}}>📊</div>
                      <div style={{fontWeight:700,fontSize:13,color:"#27AE60"}}>CSV</div>
                      <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Route planner</div>
                    </button>
                    <button onClick={()=>{
                      loadDriveRoute(genResult.route_id).then(()=>setTab("drive"));
                    }} style={{background:"#1A2800",border:"1px solid #7BC818",borderRadius:12,
                      padding:"16px 8px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:26,marginBottom:4}}>🚗</div>
                      <div style={{fontWeight:700,fontSize:13,color:"#7BC818"}}>Drive</div>
                      <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Start now</div>
                    </button>
                  </div>
                  <button onClick={()=>setGenResult(null)}
                    style={{background:"transparent",border:"1px solid #1E2D3D",borderRadius:12,
                      color:"#7A8FA6",fontSize:14,padding:"13px 0",cursor:"pointer",fontWeight:600}}>
                    ← Generate Another
                  </button>
                </div>
              ):(
                <button onClick={generate} disabled={loading}
                  style={{background:loading?"#2A3D50":"linear-gradient(135deg,#27AE60,#1E8449)",
                    border:"none",borderRadius:14,color:"white",fontWeight:800,
                    fontSize:16,padding:"16px 0",cursor:loading?"default":"pointer"}}>
                  {loading?"⏳  Building your route…":"⚡  Generate Knock List"}
                </button>
              )}
            </>)}
          </div>
        )}

        {/* ── DRIVE ── */}
        {tab==="drive" && (
          <DriveMode repId={repId} driveRoute={driveRoute} setDriveRoute={setDriveRoute}
            routes={routes} loadDriveRoute={loadDriveRoute}
            tiers={tiers} onBack={()=>setTab("generate")}/>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,
        background:"#0A1118",borderTop:`1px solid ${C.border}`,
        display:"flex",zIndex:200,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,background:"transparent",border:"none",
              padding:"10px 0 12px",cursor:"pointer",position:"relative",
              color:tab===t.id?(t.green?"#27AE60":"#F5A623"):"#4A6075"}}>
            <div style={{fontSize:22}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:600,marginTop:2}}>{t.label}</div>
            {t.badge>0&&(
              <div style={{position:"absolute",top:8,right:"calc(50% - 16px)",
                background:"#27AE60",color:"white",borderRadius:10,
                padding:"1px 5px",fontSize:9,fontWeight:700}}>{t.badge}</div>
            )}
            {tab===t.id&&(
              <div style={{position:"absolute",top:0,left:"20%",right:"20%",height:2,
                background:t.green?"#27AE60":"#F5A623",borderRadius:"0 0 2px 2px"}}/>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DRIVE MODE
// ══════════════════════════════════════════════════════════════════════
function DriveMode({repId,driveRoute,setDriveRoute,routes,loadDriveRoute,tiers,onBack}) {
  const [view,      setView]      = useState(driveRoute?"current":"list");
  const [outcome,   setOutcome]   = useState("");
  const [note,      setNote]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [navPref,   setNavPref]   = useState(()=>{
    try{return localStorage.getItem("navPref")||"waze";}catch{return "waze";}
  });
  const [editStop,  setEditStop]  = useState(null);
  const [editData,  setEditData]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [stops,     setStops]     = useState([]);

  const setNav=(p)=>{setNavPref(p);try{localStorage.setItem("navPref",p);}catch{}};

  // Recalculate tiers live every time Drive opens
  useEffect(() => {
    if (!driveRoute) return;
    setView("current");
    // Recalc tier for each stop based on today's date
    const recalced = (driveRoute.stops||[]).map(s => ({
      ...s,
      tier_key: recalcTierKey(s.sale_date, tiers),
    }));
    setStops(recalced);
  }, [driveRoute?.id]);

  const route       = driveRoute;
  const currentStop = stops.find(s=>s.stop_num===route?.current_stop) || stops.find(s=>s.status==="pending");
  const completed   = stops.filter(s=>s.status==="complete").length;
  const total       = stops.length;
  const pct         = total>0?Math.round(completed/total*100):0;

  const tierColor = (k) => tiers.find(t=>t.key===k)?.color || "#7A8FA6";
  const tierName  = (k) => tiers.find(t=>t.key===k)?.name  || k;

  const doComplete = async (selectedOutcome) => {
    const o=selectedOutcome||outcome;
    if (!o) return;
    setSubmitting(true);
    try {
      await post(`/route/${route.id}/stop/${currentStop.stop_num}/complete`,{outcome:o,note,phone});
      await loadDriveRoute(route.id);
      setOutcome("");setNote("");setPhone("");
    } catch(e){} finally{setSubmitting(false);}
  };

  const doSkip = async () => {
    setSubmitting(true);
    try {
      await post(`/route/${route.id}/stop/${currentStop.stop_num}/skip`,{note});
      await loadDriveRoute(route.id);
      setOutcome("");setNote("");setPhone("");
    } catch(e){} finally{setSubmitting(false);}
  };

  const openEdit=(s)=>{setEditStop(s);setEditData({outcome:s.outcome||"",note:s.note||"",phone:s.phone||""}); };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await post(`/route/${route.id}/stop/${editStop.stop_num}/update`,editData);
      await loadDriveRoute(route.id);
      setEditStop(null);
    } catch(e){} finally{setSaving(false);}
  };

  const C={bg:"#080E14",card:"#0D1520",border:"#1E2D3D"};
  const inp={width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:10,
    color:"white",padding:"12px 14px",fontSize:15,outline:"none",boxSizing:"border-box"};

  if (!route) return (
    <div style={{display:"grid",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:"#1E2D3D",border:"none",borderRadius:8,
          color:"#7A8FA6",fontSize:13,padding:"8px 14px",cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>Drive Mode</h2>
      </div>
      {routes.length===0?(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,
          padding:40,textAlign:"center",color:"#4A6075"}}>
          Generate a list first, then come back to drive it.
        </div>
      ):routes.map(r=>(
        <div key={r.id} onClick={()=>loadDriveRoute(r.id)}
          style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
            padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14}}>{r.label}</div>
            <div style={{fontSize:12,color:"#4A6075",marginTop:2}}>
              {r.completed}/{r.total} done · {r.pct}% · {r.created}
            </div>
          </div>
          <span style={{color:"#27AE60",fontWeight:700}}>Go →</span>
        </div>
      ))}
    </div>
  );

  const VIEWS=[["current","Current"],["list","All Stops"],["map","🗺 Map"],["history","History"]];

  return (
    <div style={{display:"grid",gap:10}}>
      {/* Progress */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",
            whiteSpace:"nowrap",maxWidth:"60%"}}>{route.label}</span>
          <span style={{fontSize:12,color:"#7A8FA6"}}>{completed}/{total} · {pct}%</span>
        </div>
        <div style={{height:6,background:"#1E2D3D",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,
            background:"linear-gradient(90deg,#27AE60,#7BC818)",transition:"width 0.4s"}}/>
        </div>
      </div>

      {/* Nav pref */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:12,color:"#4A6075",flexShrink:0}}>Nav:</span>
        <div style={{display:"flex",background:"#0A1118",borderRadius:8,padding:3,
          border:`1px solid ${C.border}`,flex:1}}>
          {[["waze","🚗 Waze"],["google","🗺 Google"]].map(([k,l])=>(
            <button key={k} onClick={()=>setNav(k)}
              style={{flex:1,padding:"8px 0",background:navPref===k?"#1E2D3D":"transparent",
                border:"none",borderRadius:6,color:navPref===k?"white":"#4A6075",
                fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>

      {/* View tabs */}
      <div style={{display:"flex",background:"#0A1118",borderRadius:10,padding:4,
        border:`1px solid ${C.border}`}}>
        {VIEWS.map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)}
            style={{flex:1,padding:"9px 0",background:view===v?"#1E2D3D":"transparent",
              border:"none",borderRadius:7,color:view===v?"white":"#4A6075",
              fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {/* ── CURRENT STOP ── */}
      {view==="current"&&currentStop&&(
        <div style={{display:"grid",gap:10}}>
          <div style={{background:C.card,border:`2px solid ${tierColor(currentStop.tier_key)}`,
            borderRadius:16,padding:18}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{background:"#1E2D3D",borderRadius:8,padding:"4px 12px",
                fontSize:13,fontWeight:700}}>Stop {currentStop.stop_num}</span>
              <TierBadge name={tierName(currentStop.tier_key)} color={tierColor(currentStop.tier_key)}/>
            </div>
            <div style={{fontSize:20,fontWeight:800,lineHeight:1.2,marginBottom:4}}>
              {currentStop.address}
            </div>
            <div style={{fontSize:14,color:"#7A8FA6",marginBottom:16}}>
              {currentStop.owner} · Moved in {currentStop.sale_date}
            </div>

            {/* Navigate */}
            <a href={navUrl(currentStop.full_address,navPref)} target="_blank" rel="noreferrer"
              style={{display:"block",background:"linear-gradient(135deg,#1565C0,#1976D2)",
                borderRadius:14,padding:"18px 0",textAlign:"center",textDecoration:"none",marginBottom:14}}>
              <div style={{fontSize:24,marginBottom:4}}>{navPref==="waze"?"🚗":"🗺️"}</div>
              <div style={{fontSize:15,fontWeight:800,color:"white"}}>
                Navigate with {navPref==="waze"?"Waze":"Google Maps"}
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:2}}>
                Tap → drive → come back and log outcome
              </div>
            </a>

            {/* Phone */}
            <input value={phone} onChange={e=>setPhone(e.target.value)}
              placeholder="📱 Phone number (optional)" type="tel"
              style={{...inp,marginBottom:12}}/>

            {/* Outcome buttons */}
            <div style={{fontSize:11,color:"#4A6075",textTransform:"uppercase",
              letterSpacing:"1px",marginBottom:10,fontWeight:600}}>Select outcome</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {OUTCOMES.map(({key,emoji,color})=>{
                const isSelected = outcome===key;
                return (
                  <button key={key} onClick={()=>setOutcome(isSelected?"":key)}
                    disabled={submitting}
                    style={{padding:"16px 8px",borderRadius:12,
                      border:`2px solid ${isSelected?color:color+"44"}`,
                      background:isSelected?`${color}35`:`${color}10`,
                      color:isSelected?"white":"#B0C4D4",
                      fontSize:14,fontWeight:700,cursor:"pointer",
                      textAlign:"center",
                      transform:isSelected?"scale(1.03)":"scale(1)",
                      transition:"all 0.15s",
                      boxShadow:isSelected?`0 0 12px ${color}55`:"none",
                      opacity:submitting?0.5:1}}>
                    <div style={{fontSize:24,marginBottom:4}}>{emoji}</div>
                    {key}
                    {isSelected&&<div style={{fontSize:10,marginTop:3,color:color}}>✓ Selected</div>}
                  </button>
                );
              })}
            </div>

            {/* Submit button — only active when outcome selected */}
            <button onClick={()=>doComplete()} disabled={!outcome||submitting}
              style={{width:"100%",marginBottom:12,
                background:outcome?"linear-gradient(135deg,#27AE60,#1E8449)":"#1E2D3D",
                border:"none",borderRadius:14,color:outcome?"white":"#4A6075",
                fontWeight:800,fontSize:16,padding:"16px 0",cursor:outcome?"pointer":"default",
                transition:"all 0.2s",
                boxShadow:outcome?"0 4px 20px rgba(39,174,96,0.35)":"none"}}>
              {submitting?"Saving...":outcome?("✓ Complete: "+outcome):"Select an outcome above"}
            </button>

            <input value={note} onChange={e=>setNote(e.target.value)}
              placeholder="Quick note (dog, Spanish, gate code...)"
              style={{...inp,marginBottom:12}}/>

            <button onClick={doSkip} disabled={submitting}
              style={{width:"100%",background:"transparent",border:"1px solid #2A3D50",
                borderRadius:12,color:"#7A8FA6",fontSize:14,padding:"13px 0",cursor:"pointer",fontWeight:600}}>
              Skip this stop →
            </button>
          </div>

          {/* Next up */}
          {stops.filter(s=>s.status==="pending"&&s.stop_num!==currentStop.stop_num).slice(0,2).map(s=>(
            <div key={s.stop_num} style={{background:C.card,border:`1px solid ${C.border}`,
              borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:11,fontWeight:700,color:"#4A6075",
                background:"#1E2D3D",borderRadius:6,padding:"3px 9px",flexShrink:0}}>
                Next #{s.stop_num}
              </span>
              <span style={{width:10,height:10,borderRadius:"50%",background:tierColor(s.tier_key),flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.address}</div>
                <div style={{fontSize:11,color:"#4A6075"}}>{s.owner}</div>
              </div>
            </div>
          ))}

          {completed===total&&total>0&&(
            <div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:14,
              padding:28,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:800,fontSize:18}}>Route Complete!</div>
              <div style={{color:"#7A8FA6",fontSize:14,marginTop:4}}>{completed} stops knocked today</div>
            </div>
          )}
        </div>
      )}

      {/* ── ALL STOPS ── */}
      {view==="list"&&(
        <div style={{display:"grid",gap:8}}>
          <div style={{fontSize:12,color:"#4A6075",marginBottom:4}}>
            {completed} done · {stops.filter(s=>s.status==="skipped").length} skipped · {stops.filter(s=>s.status==="pending").length} remaining
          </div>
          {stops.map(s=>{
            const isCurrent=s.stop_num===route.current_stop;
            const isDone=s.status==="complete";
            const isSkipped=s.status==="skipped";
            return (
              <div key={s.stop_num} onClick={()=>isDone&&openEdit(s)}
                style={{background:isCurrent?"#0D2B1A":isDone?"#0A1118":isSkipped?"#060A0F":C.card,
                  border:`1px solid ${isCurrent?"#27AE60":isDone?"#1E3D26":"#1E2D3D"}`,
                  borderRadius:12,padding:"12px 16px",cursor:isDone?"pointer":"default",
                  opacity:isSkipped?0.4:1}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:12,fontWeight:700,color:isCurrent?"#27AE60":"#4A6075",
                    background:"#1E2D3D",borderRadius:6,padding:"3px 9px",
                    flexShrink:0,minWidth:32,textAlign:"center"}}>{s.stop_num}</span>
                  <span style={{width:10,height:10,borderRadius:"50%",
                    background:tierColor(s.tier_key),flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap",
                      textDecoration:isDone?"line-through":"none",opacity:isDone?0.7:1}}>
                      {s.address}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:11,color:"#4A6075"}}>{s.owner}</span>
                      <span style={{fontSize:11,color:"#4A6075"}}>·</span>
                      <span style={{fontSize:11,color:"#7A8FA6"}}>📅 {s.sale_date}</span>
                      {isDone&&s.outcome&&<>
                        <span style={{fontSize:11,color:"#4A6075"}}>·</span>
                        <span style={{fontSize:11,fontWeight:700,
                          color:OUTCOMES.find(o=>o.key===s.outcome)?.color||"#27AE60"}}>
                          {s.outcome}
                        </span>
                      </>}
                    </div>
                  </div>
                  {isDone&&<span style={{fontSize:11,color:"#27AE60",fontWeight:700,flexShrink:0}}>✏️</span>}
                  {isCurrent&&<span style={{fontSize:11,color:"#27AE60",fontWeight:700}}>← NOW</span>}
                </div>
                {isDone&&s.phone&&<div style={{fontSize:11,color:"#4A6075",marginTop:4,paddingLeft:52}}>📱 {s.phone}</div>}
                {isDone&&s.note&&<div style={{fontSize:11,color:"#7A8FA6",marginTop:2,paddingLeft:52,fontStyle:"italic"}}>"{s.note}"</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MAP ── */}
      {view==="map"&&(
        <div>
          <p style={{fontSize:12,color:"#4A6075",marginBottom:10}}>
            Tap any pin to see stop details and navigate. Color = tier. Grey = completed.
          </p>
          <MapView
            stops={stops}
            tiers={tiers}
            currentStopNum={route.current_stop}
            navPref={navPref}
            openEdit={openEdit}
          />
        </div>
      )}

      {/* ── HISTORY ── */}
      {view==="history"&&(
        <div style={{display:"grid",gap:10}}>
          <p style={{fontSize:12,color:"#4A6075",margin:0}}>
            Tap any stop to edit disposition, phone number, or notes.
          </p>
          {stops.filter(s=>s.status==="complete").length===0?(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
              padding:32,textAlign:"center",color:"#4A6075"}}>
              No completed stops yet.
            </div>
          ):stops.filter(s=>s.status==="complete").map(s=>(
            <div key={s.stop_num} onClick={()=>openEdit(s)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                padding:"14px 16px",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:s.phone||s.note?6:0}}>
                <span style={{fontSize:11,background:"#1E2D3D",borderRadius:5,
                  padding:"2px 8px",color:"#4A6075",flexShrink:0}}>{s.stop_num}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.address}</div>
                  <div style={{fontSize:11,color:"#4A6075"}}>{s.owner}</div>
                </div>
                <div style={{flexShrink:0,textAlign:"right"}}>
                  <div style={{fontSize:12,fontWeight:700,
                    color:OUTCOMES.find(o=>o.key===s.outcome)?.color||"#7A8FA6"}}>
                    {s.outcome||"—"}
                  </div>
                  <div style={{fontSize:10,color:"#4A6075"}}>{s.completed_at}</div>
                </div>
                <span style={{color:"#4A6075",fontSize:14,flexShrink:0}}>✏️</span>
              </div>
              {s.phone&&<div style={{fontSize:12,color:"#7A8FA6",paddingLeft:44}}>📱 {s.phone}</div>}
              {s.note&&<div style={{fontSize:12,color:"#7A8FA6",paddingLeft:44,fontStyle:"italic"}}>"{s.note}"</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editStop&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,
          background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",zIndex:1000}}
          onClick={()=>setEditStop(null)}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:"100%",maxWidth:540,margin:"0 auto",background:"#0D1520",
              borderRadius:"20px 20px 0 0",padding:"20px 18px 36px",border:"1px solid #1E2D3D"}}>
            <div style={{width:44,height:5,background:"#2A3D50",borderRadius:3,margin:"0 auto 16px"}}/>
            <div style={{fontWeight:800,fontSize:16,marginBottom:3}}>{editStop.address}</div>
            <div style={{fontSize:13,color:"#7A8FA6",marginBottom:16}}>{editStop.owner}</div>

            <div style={{fontSize:11,color:"#F5A623",textTransform:"uppercase",
              letterSpacing:"1px",marginBottom:10,fontWeight:600}}>Disposition</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              {OUTCOMES.map(({key,emoji,color})=>(
                <button key={key} onClick={()=>setEditData(d=>({...d,outcome:key}))}
                  style={{padding:"12px 8px",borderRadius:12,
                    border:`2px solid ${editData.outcome===key?color:color+"44"}`,
                    background:editData.outcome===key?`${color}28`:`${color}0A`,
                    color:"white",fontSize:13,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                  <div style={{fontSize:20,marginBottom:2}}>{emoji}</div>{key}
                </button>
              ))}
            </div>

            <div style={{fontSize:11,color:"#F5A623",textTransform:"uppercase",
              letterSpacing:"1px",marginBottom:8,fontWeight:600}}>Phone Number</div>
            <input value={editData.phone||""} onChange={e=>setEditData(d=>({...d,phone:e.target.value}))}
              placeholder="Add phone number..." type="tel"
              style={{...inp,marginBottom:14}}/>

            <div style={{fontSize:11,color:"#F5A623",textTransform:"uppercase",
              letterSpacing:"1px",marginBottom:8,fontWeight:600}}>Notes</div>
            <textarea value={editData.note||""} onChange={e=>setEditData(d=>({...d,note:e.target.value}))}
              placeholder="Update notes..." rows={2}
              style={{...inp,resize:"none",marginBottom:16,fontFamily:"inherit"}}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12}}>
              <button onClick={()=>setEditStop(null)}
                style={{background:"transparent",border:"1px solid #2A3D50",borderRadius:12,
                  color:"#7A8FA6",fontSize:14,padding:"14px 0",cursor:"pointer"}}>Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                style={{background:"linear-gradient(135deg,#27AE60,#1E8449)",border:"none",
                  borderRadius:12,color:"white",fontSize:14,fontWeight:800,
                  padding:"14px 0",cursor:"pointer"}}>
                {saving?"Saving…":"Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════
function AdminDashboard({onLogout}) {
  const [requests, setRequests] = useState([]);
  const [routes,   setRoutes]   = useState([]);
  const [stats,    setStats]    = useState({});
  const [tab,      setTab]      = useState("requests");
  const [uploading,setUploading]= useState(null);
  const [msgs,     setMsgs]     = useState({});
  const fileRefs = useRef({});

  const load = async () => {
    try {
      const [dr,rr]=await Promise.all([get("/admin/requests"),get("/admin/routes")]);
      setRequests(dr.requests);setStats({total:dr.total,pending:dr.pending,ready:dr.ready});
      setRoutes(rr.routes);
    } catch{}
  };
  useEffect(()=>{load();const i=setInterval(load,10000);return()=>clearInterval(i);},[]);

  const fulfill=async(reqId,file)=>{
    // Detect .numbers files and show helpful message
    if(file.name.toLowerCase().endsWith('.numbers')){
      setMsgs(m=>({...m,[reqId]:"✗ Apple Numbers files can't be uploaded directly. Open the file in Numbers → File → Export To → CSV, then upload the CSV."}));
      return;
    }
    setUploading(reqId);
    const fd=new FormData();fd.append("file",file);
    try {
      const r=await fetch(`${API}/admin/fulfill/${reqId}`,{method:"POST",body:fd});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail);
      setMsgs(m=>({...m,[reqId]:`✓ ${d.rows.toLocaleString()} homes loaded`}));
      await load();
    } catch(e){setMsgs(m=>({...m,[reqId]:`✗ ${e.message}`}));}
    finally{setUploading(null);}
  };

  const pending  =requests.filter(r=>r.status==="pending");
  const fulfilled=requests.filter(r=>r.status==="ready");
  const C={bg:"#080E14",card:"#0D1520",border:"#1E2D3D"};
  const card={background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:18};

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",color:"white",paddingBottom:80}}>
      {/* Header */}
      <div style={{background:"#0A1118",borderBottom:`1px solid ${C.border}`,padding:"0 16px",
        height:52,display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,background:"linear-gradient(135deg,#F5A623,#E8820C)",
            borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>☀️</div>
          <span style={{fontWeight:800,fontSize:14}}>
            KnockList<span style={{color:"#F5A623"}}>AI</span>
            <span style={{fontSize:10,color:"#27AE60",marginLeft:8,fontWeight:600}}>ADMIN</span>
          </span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={load} style={{background:"#1E2D3D",border:"none",borderRadius:8,
            color:"#7A8FA6",fontSize:13,padding:"6px 12px",cursor:"pointer"}}>↻</button>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2A3D50",
            borderRadius:8,color:"#7A8FA6",fontSize:12,padding:"6px 12px",cursor:"pointer"}}>Sign out</button>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"16px 14px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {[["Requests",stats.total||0,"white"],["⏳ Pending",stats.pending||0,"#F5A623"],
            ["✓ Done",stats.ready||0,"#27AE60"],["🚗 Live",routes.length,"#4285F4"]].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",padding:14}}>
              <div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:10,color:"#4A6075",marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:"flex",background:"#0A1118",borderRadius:10,padding:4,
          border:`1px solid ${C.border}`,marginBottom:16}}>
          {[["requests","Data Requests"],["routes","Live Routes"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:"9px 0",background:tab===t?"#1E2D3D":"transparent",
                border:"none",borderRadius:7,color:tab===t?"white":"#4A6075",
                fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
          ))}
        </div>

        {tab==="requests"&&(<>
          <h3 style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#F5A623"}}>
            ⏳ Pending {pending.length>0&&`(${pending.length})`}
          </h3>
          {pending.length===0?(
            <div style={{...card,textAlign:"center",padding:32,color:"#4A6075",marginBottom:20}}>
              No pending requests right now.
            </div>
          ):(
            <div style={{display:"grid",gap:14,marginBottom:20}}>
              {pending.map(req=>(
                <div key={req.id} style={card}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontFamily:"monospace",fontSize:11,color:"#4A6075",
                          background:"#1E2D3D",padding:"2px 7px",borderRadius:4}}>#{req.id}</span>
                        <span style={{fontWeight:700,fontSize:15}}>{req.rep_name}</span>
                        <span style={{fontSize:10,color:"#F5A623",background:"#1A1400",
                          border:"1px solid #F5A623",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
                          ⏳ Pending
                        </span>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
                        {req.zips.map(z=>(
                          <span key={z} style={{background:"#1E2D3D",borderRadius:6,
                            padding:"3px 10px",fontSize:13,fontWeight:600,color:"#B0C4D4"}}>{z}</span>
                        ))}
                      </div>
                      <div style={{fontSize:12,color:"#4A6075"}}>{req.created}</div>
                      {req.note&&<div style={{fontSize:13,color:"#7A8FA6",marginTop:4,fontStyle:"italic"}}>"{req.note}"</div>}
                    </div>
                    <div style={{flexShrink:0,textAlign:"center"}}>
                      <input ref={el=>fileRefs.current[req.id]=el} type="file"
                        accept=".csv,.xlsx,.xls" style={{display:"none"}}
                        onChange={e=>e.target.files[0]&&fulfill(req.id,e.target.files[0])}/>
                      <button onClick={()=>fileRefs.current[req.id]?.click()}
                        disabled={uploading===req.id}
                        style={{background:uploading===req.id?"#2A3D50":"linear-gradient(135deg,#F5A623,#E8820C)",
                          border:"none",borderRadius:10,color:"#0A0A0A",fontWeight:800,fontSize:12,
                          padding:"10px 16px",cursor:uploading===req.id?"default":"pointer",
                          whiteSpace:"nowrap",display:"block",marginBottom:4}}>
                        {uploading===req.id?"Uploading…":"📤 Upload Export"}
                      </button>
                      <span style={{fontSize:10,color:"#4A6075"}}>
                        Pull {req.filters?.home_count||"100"} records
                      </span>
                    </div>
                  </div>
                  {/* Search criteria */}
                  <div style={{background:"#080E14",border:"1px solid #1A3A2A",borderRadius:10,padding:12}}>
                    <div style={{fontSize:10,fontWeight:600,color:"#27AE60",letterSpacing:"1px",
                      textTransform:"uppercase",marginBottom:8}}>🔍 Search Criteria</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {[
                        ["ZIPs",       req.zips.join(", ")],
                        ["Date From",  req.filters?.sale_date_from?MONTHS.find(m=>m.val===req.filters.sale_date_from)?.lbl||req.filters.sale_date_from:"Any"],
                        ["Date To",    req.filters?.sale_date_to?MONTHS.find(m=>m.val===req.filters.sale_date_to)?.lbl||req.filters.sale_date_to:"Any"],
                        ["Min Price",  req.filters?.price_min?"$"+Number(req.filters.price_min).toLocaleString():"Any"],
                        ["Max Price",  req.filters?.price_max?"$"+Number(req.filters.price_max).toLocaleString():"Any"],
                        ["Owner Occ.", req.filters?.owner_occupied||"Any"],
                        ["Type",       req.filters?.property_type||"Any"],
                        ["Records",    req.filters?.home_count||"100"],
                      ].map(([k,v])=>(
                        <div key={k} style={{background:"#0D1520",borderRadius:7,padding:"7px 8px",border:"1px solid #1E2D3D"}}>
                          <div style={{fontSize:8,color:"#4A6075",textTransform:"uppercase",letterSpacing:"1px",marginBottom:2}}>{k}</div>
                          <div style={{fontSize:11,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {msgs[req.id]&&(
                    <div style={{marginTop:10,fontSize:13,padding:"8px 12px",borderRadius:8,
                      background:msgs[req.id].startsWith("✓")?"#0D2B1A":"#2B0A0A",
                      border:`1px solid ${msgs[req.id].startsWith("✓")?"#27AE60":"#C0392B"}`,
                      color:msgs[req.id].startsWith("✓")?"#27AE60":"#FF6B6B"}}>
                      {msgs[req.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {fulfilled.length>0&&(<>
            <h3 style={{fontSize:14,fontWeight:700,marginBottom:12,color:"#27AE60"}}>
              ✓ Fulfilled ({fulfilled.length})
            </h3>
            <div style={{display:"grid",gap:8}}>
              {fulfilled.map(req=>(
                <div key={req.id} style={{...card,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontFamily:"monospace",fontSize:11,color:"#4A6075",
                        background:"#1E2D3D",padding:"2px 7px",borderRadius:4}}>#{req.id}</span>
                      <span style={{fontWeight:700,fontSize:14}}>{req.rep_name}</span>
                      <span style={{fontSize:10,color:"#27AE60",background:"#0D2B1A",
                        border:"1px solid #27AE60",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
                        ✓ Ready
                      </span>
                    </div>
                    <div style={{fontSize:12,color:"#7A8FA6"}}>
                      ZIPs: {req.zips.join(", ")} · {req.row_count?.toLocaleString()} homes · {req.fulfilled}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </>)}

        {tab==="routes"&&(
          <div style={{display:"grid",gap:12}}>
            <p style={{color:"#4A6075",fontSize:13,margin:"0 0 4px"}}>
              Live view of all active driving sessions.
            </p>
            {routes.length===0?(
              <div style={{...card,textAlign:"center",padding:32,color:"#4A6075"}}>
                No active routes. Reps appear here when driving.
              </div>
            ):routes.map(r=>(
              <div key={r.id} style={card}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                      <span style={{fontFamily:"monospace",fontSize:10,color:"#4A6075",
                        background:"#1E2D3D",padding:"2px 6px",borderRadius:4}}>#{r.id}</span>
                      <span style={{fontWeight:700,fontSize:14}}>{r.rep_name}</span>
                      <span style={{fontSize:11,color:"#27AE60",fontWeight:600}}>🟢 Active</span>
                    </div>
                    <div style={{fontSize:13,color:"#B0C4D4",marginBottom:8}}>{r.label}</div>
                    <div style={{height:6,background:"#1E2D3D",borderRadius:3,overflow:"hidden",maxWidth:300}}>
                      <div style={{height:"100%",width:`${r.pct}%`,
                        background:"linear-gradient(90deg,#27AE60,#7BC818)"}}/>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:28,fontWeight:800,color:"#27AE60"}}>{r.pct}%</div>
                    <div style={{fontSize:12,color:"#4A6075"}}>{r.completed}/{r.total}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom tab bar for admin */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#0A1118",
        borderTop:`1px solid ${C.border}`,display:"flex",zIndex:200}}>
        {[["requests","📋","Requests"],["routes","🚗","Live Routes"]].map(([t,icon,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,background:"transparent",border:"none",padding:"10px 0 12px",
              cursor:"pointer",color:tab===t?"#F5A623":"#4A6075",position:"relative"}}>
            <div style={{fontSize:22}}>{icon}</div>
            <div style={{fontSize:10,fontWeight:600,marginTop:2}}>{l}</div>
            {tab===t&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",
              height:2,background:"#F5A623",borderRadius:"0 0 2px 2px"}}/>}
          </button>
        ))}
      </div>
    </div>
  );
}    m=re.match(r'^(\d+)',str(addr)); hn=int(m.group(1)) if m else 500
    parts=str(addr).split(); sn=' '.join(p for p in parts[1:] if not p.startswith('#')) if len(parts)>1 else addr
    h=int(hashlib.md5(sn.upper().encode()).hexdigest(),16)
    la=((h>>32)&0xFFFFFFFF)/0xFFFFFFFF*0.022-0.011
    lo=(h&0xFFFFFFFF)/0xFFFFFFFF*0.028-0.014
    if (h>>64)&1: la+=(hn-2500)*0.000004
    else:         lo+=(hn-2500)*0.0000046
    return bl+la, bo+lo

def parse_home_base(addr):
    m=re.search(r'\b(\d{5})\b',addr)
    if m: return addr_coords(addr,int(m.group(1)))
    return 27.916,-82.263

def nn_route(df,slat,slon):
    lats=df['_lat'].values; lons=df['_lon'].values; n=len(lats)
    vis=[False]*n; order=[]; cl,co=slat,slon
    for _ in range(n):
        bi,bd=-1,float('inf')
        for i in range(n):
            if not vis[i]:
                d=(cl-lats[i])**2+(co-lons[i])**2
                if d<bd: bd=d; bi=i
        vis[bi]=True; order.append(bi); cl,co=lats[bi],lons[bi]
    return df.iloc[order].reset_index(drop=True)

def tier_fn(d,today,t1,t2,t3,t4):
    if pd.isna(d): return 'UNTIERED'
    mo=(today-d).days/30.44
    return 'T1' if mo<=t1 else 'T2' if mo<=t2 else 'T3' if mo<=t3 else 'T4' if mo<=t4 else 'UNTIERED'

def parse_propstream(content, filename):
    if filename.lower().endswith(('.xlsx','.xls')):
        df=pd.read_excel(io.BytesIO(content))
    else:
        for enc in ['utf-8','latin-1','cp1252']:
            try: df=pd.read_csv(io.BytesIO(content),encoding=enc,low_memory=False); break
            except UnicodeDecodeError: continue
    df.columns=df.columns.str.strip()

    # ── Flexible column mapping ─────────────────────────────────────────
    col_map={}
    for c in df.columns:
        cl=c.strip().lower()
        if cl in ['address','property address','street address','addr','location']:
            col_map.setdefault('Address',c)
        elif cl in ['zip','zip code','zipcode','postal code','zip_code','postcode']:
            col_map.setdefault('Zip',c)
        elif cl in ['last sale recording date','sale date','last sale date','sold date',
                    'close date','closing date','recording date','sale_date','notes']:
            col_map.setdefault('Last Sale Recording Date',c)
        elif cl in ['last sale amount','sale amount','sale price','sold price',
                    'last sale price','price','amount']:
            col_map.setdefault('Last Sale Amount',c)

    # Rename columns to standard names
    rename={}
    for std,orig in col_map.items():
        if orig!=std: rename[orig]=std
    if rename: df=df.rename(columns=rename)

    # Address is the only truly required column
    if 'Address' not in df.columns:
        addr_guess=[c for c in df.columns if 'addr' in c.lower() or 'street' in c.lower() or 'location' in c.lower()]
        if addr_guess: df=df.rename(columns={addr_guess[0]:'Address'})
        else: raise HTTPException(400,"Could not find an Address column. Make sure your file has a column named Address, Street Address, or Location.")

    # Fill missing required columns with defaults
    if 'Zip' not in df.columns:
        # Try to extract ZIP from address
        df['Zip']=df['Address'].str.extract(r'(\d{5})$').fillna(0)
    if 'Last Sale Recording Date' not in df.columns:
        df['Last Sale Recording Date']=None
    if 'Last Sale Amount' not in df.columns:
        df['Last Sale Amount']=0

    # Preserve original stop order if CSV has a stop number column
    stop_col = next((c for c in df.columns if c.strip().lower() in
        ['stop','stop #','stop#','stop_#','stop number','order id','order','#','num']), None)
    if stop_col:
        df['_original_order'] = pd.to_numeric(df[stop_col], errors='coerce').fillna(df.index+1)
    else:
        df['_original_order'] = df.index + 1

    df['Address']=df['Address'].fillna('').astype(str).str.strip()
    df=df[df['Address']!=''].reset_index(drop=True)
    df['_dk']=df['Address'].str.upper()+'|'+df['Zip'].astype(str)
    df=df.drop_duplicates(subset='_dk').reset_index(drop=True)
    df['_date']=pd.to_datetime(df['Last Sale Recording Date'],errors='coerce')
    df['_price']=pd.to_numeric(df['Last Sale Amount'],errors='coerce').fillna(0)
    df['Zip']=pd.to_numeric(df['Zip'],errors='coerce').fillna(33596).astype(int)

    # Owner name — try many column variations
    if 'Owner 1 First Name' in df.columns and 'Owner 1 Last Name' in df.columns:
        o1=(df['Owner 1 First Name'].fillna('')+' '+df['Owner 1 Last Name'].fillna('')).str.strip()
    elif 'Owner Name' in df.columns:
        o1=df['Owner Name'].fillna('')
    elif 'Homeowner Name' in df.columns:
        o1=df['Homeowner Name'].fillna('')
    elif 'Owner' in df.columns:
        o1=df['Owner'].fillna('')
    elif 'Name' in df.columns:
        o1=df['Name'].fillna('')
    else:
        o1=pd.Series(['']*len(df))
    df['Owner_Name']=o1
    df.loc[df['Owner_Name']=='','Owner_Name']=df.get('Mailing Care of Name',pd.Series(dtype=str)).fillna('Unknown')
    df.loc[df['Owner_Name']=='','Owner_Name']='Unknown'

    # City/State
    if 'City' not in df.columns:
        df['City']=df['Address'].str.extract(r',\s*([^,]+),\s*[A-Z]{2}').fillna('')
    if 'State' not in df.columns:
        df['State']='FL'

    df['_lat']=df.apply(lambda r:addr_coords(r['Address'],r['Zip'])[0],axis=1)
    df['_lon']=df.apply(lambda r:addr_coords(r['Address'],r['Zip'])[1],axis=1)
    return df

def build_pdf(df_r,label,home_base,tier_config,rh):
    INK=colors.HexColor('#1A1A1A'); CD=colors.HexColor('#1B4F2E'); CM=colors.HexColor('#27AE60')
    RA=colors.HexColor('#F7F7F7'); RL=colors.HexColor('#E0E0E0')
    SB=colors.HexColor('#757575'); NT=colors.HexColor('#FAFAFA'); NB=colors.HexColor('#D0D0D0')
    TC={}
    for t in tier_config:
        TC[t['key']]=(colors.HexColor(t['bg']),colors.HexColor(t['color']),t['name'])
    PW,PH=letter; LM=RM=36; TM=68; BM=34; FTR=16; W=PW-LM-RM
    CW=[27,60,58,162,114,115]; TP=math.ceil(len(df_r)/40)
    cities=df_r['City'].dropna().unique() if 'City' in df_r.columns else []
    cl=' / '.join(cities[:3]) if len(cities)<=3 else f"{cities[0]} + {len(cities)-1} more"
    def S(n,fn='Helvetica',fs=9,tx=INK,al=TA_LEFT,ld=None):
        return ParagraphStyle(n,fontName=fn,fontSize=fs,textColor=tx,alignment=al,
                              leading=ld or round(fs*1.2),spaceAfter=0,spaceBefore=0)
    sCH=S('ch','Helvetica-Bold',8,colors.white,TA_CENTER,10)
    sCL=S('cl','Helvetica-Bold',8,colors.white,TA_LEFT,10)
    sN=S('n','Helvetica-Bold',10,INK,TA_CENTER,12); sA=S('a','Helvetica-Bold',8,INK,TA_LEFT,10)
    sO=S('o','Helvetica',8,INK,TA_LEFT,10); sD=S('d','Helvetica',8,SB,TA_CENTER,10)
    sF=S('f','Helvetica',7,SB,TA_CENTER,9)
    def draw(c,doc):
        c.saveState(); by=PH-10-46
        c.setFillColor(CD); c.roundRect(LM,by,W,46,3,fill=1,stroke=0)
        c.setFillColor(CM); c.roundRect(LM,by,5,46,2,fill=1,stroke=0)
        c.setFillColor(colors.white); c.setFont('Helvetica-Bold',14)
        c.drawString(LM+14,by+28,label.upper())
        c.setFont('Helvetica',8.5); c.setFillColor(colors.HexColor('#A8D5B5'))
        c.drawString(LM+14,by+13,f"{len(df_r)} Stops  |  From: {home_base}  |  {datetime.now().strftime('%b %d, %Y')}")
        c.setFillColor(colors.white); c.setFont('Helvetica-Bold',9)
        c.drawRightString(LM+W-10,by+19,f'Page {doc.page} / {TP}')
        c.setStrokeColor(RL); c.setLineWidth(0.5); c.line(LM,BM+FTR-2,LM+W,BM+FTR-2)
        c.setFont('Helvetica',7); c.setFillColor(SB)
        c.drawString(LM,BM+4,'KnockListAI  —  Solar Knock Route')
        c.drawRightString(LM+W,BM+4,'Proximity-ordered from home base')
        c.restoreState()
    def legend():
        cells=[]
        for t in tier_config:
            bg=colors.HexColor(t['bg']); fg=colors.HexColor(t['color'])
            cnt=len(df_r[df_r['_tier_key']==t['key']]) if '_tier_key' in df_r.columns else 0
            s=ParagraphStyle('x',fontName='Helvetica-Bold',fontSize=8,textColor=fg,
                             alignment=TA_CENTER,leading=10,spaceAfter=0,spaceBefore=0)
            cells.append(Paragraph(f"{t['name']}  {t['range']}  ({cnt})",s))
        while len(cells)<4: cells.append(Paragraph('',S('e')))
        t=Table([cells],colWidths=[W/len(cells)]*len(cells),rowHeights=[20])
        style_cmds=[('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
                    ('LEFTPADDING',(0,0),(-1,-1),4),('RIGHTPADDING',(0,0),(-1,-1),4),
                    ('BOX',(0,0),(-1,-1),0.5,RL)]
        for i,ti in enumerate(tier_config):
            style_cmds.append(('BACKGROUND',(i,0),(i,0),colors.HexColor(ti['bg'])))
        t.setStyle(TableStyle(style_cmds)); return t
    def hdr():
        r=[Paragraph('#',sCH),Paragraph('TIER',sCH),Paragraph('SALE DATE',sCH),
           Paragraph(f'ADDRESS  {cl}',sCL),Paragraph('NOTES',sCL),Paragraph('HOMEOWNER',sCL)]
        t=Table([r],colWidths=CW,rowHeights=[18])
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),CD),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
            ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
        return t
    def chunk(rows):
        data=[]; cmds=[('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2),
            ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LINEBELOW',(0,0),(-1,-1),0.3,RL),
            ('BOX',(0,0),(-1,-1),0.5,RL)]
        for i,(_,row) in enumerate(rows):
            tkey=row.get('_tier_key','UNTIERED')
            if tkey in TC: bg,fg,nm=TC[tkey]
            else: bg=colors.HexColor('#F5F5F5'); fg=colors.HexColor('#999999'); nm='Other'
            rb=RA if i%2==0 else colors.white
            ts=ParagraphStyle(f't{i}',fontName='Helvetica-Bold',fontSize=8,textColor=fg,
                              alignment=TA_CENTER,leading=10,spaceAfter=0,spaceBefore=0)
            data.append([Paragraph(str(row['Stop_#']),sN),Paragraph(nm,ts),
                         Paragraph(str(row['Sale_Date_Str']),sD),Paragraph(str(row['Address']),sA),
                         Paragraph('',sF),Paragraph(str(row['Owner_Name']),sO)])
            cmds+=[('BACKGROUND',(0,i),(0,i),rb),('BACKGROUND',(1,i),(1,i),bg),
                   ('BACKGROUND',(2,i),(2,i),rb),('BACKGROUND',(3,i),(3,i),rb),
                   ('BACKGROUND',(4,i),(4,i),NT),('BACKGROUND',(5,i),(5,i),rb)]
        t=Table(data,colWidths=CW,rowHeights=[rh]*len(rows))
        t.setStyle(TableStyle(cmds)); return t
    buf=io.BytesIO()
    doc=SimpleDocTemplate(buf,pagesize=letter,leftMargin=LM,rightMargin=RM,topMargin=TM,bottomMargin=BM)
    all_r=list(df_r.iterrows()); chunks=[all_r[i:i+40] for i in range(0,len(all_r),40)]
    story=[]
    for pi,ch in enumerate(chunks):
        if pi==0: story.append(legend()); story.append(Spacer(1,5))
        story.append(hdr()); story.append(chunk(ch))
        if pi<len(chunks)-1: story.append(PageBreak())
    doc.build(story,onFirstPage=draw,onLaterPages=draw)
    return buf.getvalue()

def now_str(): return datetime.now().strftime('%b %d, %Y %I:%M %p')

# ═══════════════════════════════════
# REP ENDPOINTS
# ═══════════════════════════════════

@app.post("/rep/request")
async def rep_request(
    rep_id:str=Form(...), rep_name:str=Form(...), zips:str=Form(...),
    sale_date_from:str=Form(""), sale_date_to:str=Form(""),
    price_max:str=Form(""), price_min:str=Form(""),
    owner_occupied:str=Form("Any"),
    property_type:str=Form("Single Family Residential"),
    home_count:str=Form("100"), start_address:str=Form(""), note:str=Form(""),
):
    zip_list=[z.strip() for z in re.split(r'[,\n\s]+',zips) if z.strip().isdigit()]
    if not zip_list: raise HTTPException(400,"Enter at least one valid ZIP code.")
    req_id=str(uuid.uuid4())[:8].upper()
    data={
        "id":req_id,"rep_id":rep_id,"rep_name":rep_name,
        "zips":zip_list,
        "filters":{"sale_date_from":sale_date_from,"sale_date_to":sale_date_to,
                   "price_max":price_max,"price_min":price_min,
                   "owner_occupied":owner_occupied,"property_type":property_type,
                   "home_count":home_count,"start_address":start_address},
        "note":note,"status":"pending",
        "created_at":now_str(),"fulfilled_at":None,"row_count":0,
        "zip_meta":{},"data":[]
    }
    sb.table("requests").insert(data).execute()
    return {"success":True,"request_id":req_id}


@app.get("/rep/{rep_id}/requests")
def rep_get_requests(rep_id:str):
    res=sb.table("requests").select("id,rep_id,rep_name,zips,filters,note,status,created_at,fulfilled_at,row_count,zip_meta").eq("rep_id",rep_id).order("created_at",desc=True).execute()
    return {"requests":res.data}


@app.post("/rep/generate")
async def rep_generate(
    request_id:str=Form(...),
    home_base:str=Form(""),
    date_from:str=Form(""), date_to:str=Form(""),
    price_max:int=Form(800000), home_count:int=Form(100),
    t1_months:int=Form(3), t2_months:int=Form(6),
    t3_months:int=Form(9), t4_months:int=Form(12),
    tier_config:str=Form("[]"),
    label:str=Form("My Knock List"),
    preserve_order:str=Form("false"),
):
    # Get request from DB
    res=sb.table("requests").select("*").eq("id",request_id).execute()
    if not res.data: raise HTTPException(404,"Request not found.")
    req=res.data[0]
    if req["status"]!="ready": raise HTTPException(400,"Data not ready yet.")
    if not req.get("data"): raise HTTPException(400,"No data attached.")

    # Reconstruct DataFrame from stored JSON
    rows=req["data"]
    df=pd.DataFrame(rows)
    df['_date']=pd.to_datetime(df['_date'],errors='coerce')
    df['_price']=pd.to_numeric(df['_price'],errors='coerce').fillna(0)
    df['_lat']=pd.to_numeric(df['_lat'],errors='coerce').fillna(27.9)
    df['_lon']=pd.to_numeric(df['_lon'],errors='coerce').fillna(-82.4)
    df['Zip']=pd.to_numeric(df['Zip'],errors='coerce').fillna(33596).astype(int)

    today=datetime.today()
    if date_from: df=df[df['_date']>=pd.to_datetime(date_from)]
    if date_to:   df=df[df['_date']<=pd.to_datetime(date_to)]
    df=df[df['_price']<=price_max].copy()
    if len(df)==0: raise HTTPException(400,"No records match your filters.")

    # If preserving order, keep the upload sequence (index order from Supabase)
    # If _original_order column exists use it, otherwise use row index as order
    use_original_order = preserve_order.lower()=="true"
    if use_original_order:
        if '_original_order' in df.columns:
            df['_original_order']=pd.to_numeric(df['_original_order'],errors='coerce').fillna(df.index+1)
        else:
            df['_original_order']=df.index+1
        df=df.sort_values('_original_order').head(home_count).copy()
    else:
        df=df.sort_values('_date',ascending=False).head(home_count).copy()

    df['_tier_key']=df['_date'].apply(
        lambda d: tier_fn(d,today,t1_months,t2_months,t3_months,t4_months))

    try: tc=json.loads(tier_config)
    except: tc=[{"key":"T1","name":"Tier 1","color":"#E67E22","bg":"#FFF3E0","range":"0-3 mo"},
                {"key":"T2","name":"Tier 2","color":"#C0392B","bg":"#FFEBEE","range":"3-6 mo"},
                {"key":"T3","name":"Tier 3","color":"#D4AC0D","bg":"#FFFDE7","range":"6-9 mo"},
                {"key":"T4","name":"Tier 4","color":"#2471A3","bg":"#E3F2FD","range":"9-12 mo"}]

    key_to_name={t['key']:t['name'] for t in tc}
    df['Tier_Label']=df['_tier_key'].map(key_to_name).fillna('Other')
    df['Sale_Date_Str']=df['_date'].dt.strftime('%m/%d/%Y').fillna('N/A')

    hb=home_base or req.get("filters",{}).get("start_address","")
    slat,slon=parse_home_base(hb) if hb else (27.916,-82.263)
    if use_original_order:
        df=df.sort_values('_original_order').reset_index(drop=True)
    else:
        df=nn_route(df,slat,slon)
    df['Stop_#']=range(1,len(df)+1)
    df=df.reset_index(drop=True)

    AVAIL=letter[1]-68-34-16; rh=math.floor((AVAIL-43)/40*10)/10
    tier_counts={t['name']:int(len(df[df['_tier_key']==t['key']])) for t in tc}

    pdf_b64=base64.b64encode(build_pdf(df,label,hb,tc,rh)).decode()

    cc=df['City'].fillna('') if 'City' in df.columns else pd.Series(['']*len(df))
    sc=df['State'].fillna('FL') if 'State' in df.columns else pd.Series(['FL']*len(df))
    csv_df=pd.DataFrame({
        'Stop #':df['Stop_#'],'Homeowner Name':df['Owner_Name'],
        'Lead Tier':df['Tier_Label'],'Sale Date':df['Sale_Date_Str'],
        'Address':df['Address'],'City':cc,'State':sc,'ZIP':df['Zip'].astype(str),
        'Full Address':df['Address']+', '+cc.astype(str)+', '+sc.astype(str)+' '+df['Zip'].astype(str),
        'Notes':''
    })
    buf=io.StringIO(); csv_df.to_csv(buf,index=False)
    csv_b64=base64.b64encode(buf.getvalue().encode()).decode()

    # Save route to Supabase
    route_id=str(uuid.uuid4())[:8].upper()
    route_data={
        "id":route_id,"rep_id":req["rep_id"],"rep_name":req["rep_name"],
        "label":label,"home_base":hb,"tier_config":tc,
        "total":len(df),"current_stop":1,"created_at":now_str()
    }
    sb.table("routes").insert(route_data).execute()

    # Save stops to Supabase
    stops_list=[]
    for _,row in df.iterrows():
        city=row.get('City','') if 'City' in df.columns else ''
        state=row.get('State','FL') if 'State' in df.columns else 'FL'
        full_addr=f"{row['Address']}, {city}, {state} {row['Zip']}"
        stops_list.append({
            "route_id":route_id,"stop_num":int(row['Stop_#']),
            "address":row['Address'],"full_address":full_addr,
            "owner":row['Owner_Name'],"tier_key":row['_tier_key'],
            "tier_name":row['Tier_Label'],"sale_date":row['Sale_Date_Str'],
            "lat":float(row['_lat']),"lon":float(row['_lon']),
            "status":"pending","outcome":None,"note":"","phone":"","completed_at":None
        })
    # Insert in batches of 50
    for i in range(0,len(stops_list),50):
        sb.table("stops").insert(stops_list[i:i+50]).execute()

    return JSONResponse({
        "success":True,"total_stops":len(df),"pages":math.ceil(len(df)/40),
        "tier_counts":tier_counts,"pdf_b64":pdf_b64,"csv_b64":csv_b64,
        "label":label,"route_id":route_id,
    })


@app.get("/rep/{rep_id}/routes")
def rep_routes(rep_id:str):
    res=sb.table("routes").select("*").eq("rep_id",rep_id).order("created_at",desc=True).execute()
    routes=[]
    for r in res.data:
        stops_res=sb.table("stops").select("status").eq("route_id",r["id"]).execute()
        stops=stops_res.data
        completed=sum(1 for s in stops if s["status"]=="complete")
        pct=round(completed/r["total"]*100) if r["total"] else 0
        routes.append({**r,"completed":completed,"pct":pct})
    return {"routes":routes}


@app.get("/route/{route_id}")
def get_route(route_id:str):
    res=sb.table("routes").select("*").eq("id",route_id).execute()
    if not res.data: raise HTTPException(404,"Route not found.")
    r=res.data[0]
    stops_res=sb.table("stops").select("*").eq("route_id",route_id).order("stop_num").execute()
    stops=stops_res.data
    completed=sum(1 for s in stops if s["status"]=="complete")
    return {**r,"stops":stops,"completed":completed,
            "skipped":sum(1 for s in stops if s["status"]=="skipped"),
            "remaining":r["total"]-completed}


@app.post("/route/{route_id}/stop/{stop_num}/complete")
async def complete_stop(route_id:str, stop_num:int,
    outcome:str=Form("Completed"), note:str=Form(""), phone:str=Form("")):
    sb.table("stops").update({
        "status":"complete","outcome":outcome,"note":note,"phone":phone,
        "completed_at":datetime.now().strftime('%I:%M %p')
    }).eq("route_id",route_id).eq("stop_num",stop_num).execute()
    # Advance current_stop
    stops_res=sb.table("stops").select("stop_num,status").eq("route_id",route_id).order("stop_num").execute()
    pending=[s for s in stops_res.data if s["status"]=="pending"]
    next_stop=pending[0]["stop_num"] if pending else None
    if next_stop: sb.table("routes").update({"current_stop":next_stop}).eq("id",route_id).execute()
    return {"success":True,"next_stop":next_stop}


@app.post("/route/{route_id}/stop/{stop_num}/skip")
async def skip_stop(route_id:str, stop_num:int, note:str=Form("")):
    sb.table("stops").update({"status":"skipped","note":note}).eq("route_id",route_id).eq("stop_num",stop_num).execute()
    stops_res=sb.table("stops").select("stop_num,status").eq("route_id",route_id).order("stop_num").execute()
    pending=[s for s in stops_res.data if s["status"]=="pending"]
    next_stop=pending[0]["stop_num"] if pending else None
    if next_stop: sb.table("routes").update({"current_stop":next_stop}).eq("id",route_id).execute()
    return {"success":True,"next_stop":next_stop}


@app.post("/route/{route_id}/stop/{stop_num}/update")
async def update_stop(route_id:str, stop_num:int,
    outcome:str=Form(""), note:str=Form(""), phone:str=Form("")):
    update={"note":note,"phone":phone}
    if outcome: update["outcome"]=outcome
    sb.table("stops").update(update).eq("route_id",route_id).eq("stop_num",stop_num).execute()
    return {"success":True}


# ═══════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════

@app.get("/admin/requests")
def admin_get_requests():
    res=sb.table("requests").select("id,rep_id,rep_name,zips,filters,note,status,created_at,fulfilled_at,row_count,zip_meta").order("created_at",desc=True).execute()
    reqs=res.data
    return {"requests":reqs,"total":len(reqs),
            "pending":sum(1 for r in reqs if r["status"]=="pending"),
            "ready":sum(1 for r in reqs if r["status"]=="ready")}


@app.post("/admin/fulfill/{request_id}")
async def admin_fulfill(request_id:str, file:UploadFile=File(...)):
    res=sb.table("requests").select("*").eq("id",request_id).execute()
    if not res.data: raise HTTPException(404,"Request not found.")
    req=res.data[0]
    content=await file.read()
    df=parse_propstream(content,file.filename)
    requested_zips=[int(z) for z in req["zips"] if z.isdigit()]
    if requested_zips:
        df_f=df[df['Zip'].isin(requested_zips)]
        if len(df_f)>0: df=df_f.copy()
    zip_meta={}
    for z,grp in df.groupby('Zip'):
        city=grp['City'].mode()[0] if 'City' in grp.columns and len(grp) else ''
        dates=grp['_date'].dropna()
        zip_meta[str(z)]={'city':city,'count':len(grp),
            'min_date':dates.min().strftime('%m/%d/%Y') if len(dates) else 'N/A',
            'max_date':dates.max().strftime('%m/%d/%Y') if len(dates) else 'N/A'}

    # Store processed data as JSON for persistence
    records=[]
    for idx,(_, row) in enumerate(df.iterrows()):
        records.append({
            'Address':str(row['Address']),'Zip':int(row['Zip']),
            'Owner_Name':str(row['Owner_Name']),
            'City':str(row.get('City','')),'State':str(row.get('State','FL')),
            '_date':row['_date'].isoformat() if not pd.isna(row['_date']) else None,
            '_price':float(row['_price']),'_lat':float(row['_lat']),'_lon':float(row['_lon']),
            '_original_order':int(row.get('_original_order', idx+1))
        })

    sb.table("requests").update({
        "status":"ready","fulfilled_at":now_str(),
        "row_count":len(df),"zip_meta":zip_meta,"data":records
    }).eq("id",request_id).execute()
    return {"success":True,"rows":len(df),"zips_loaded":list(zip_meta.keys())}


@app.get("/admin/routes")
def admin_routes():
    res=sb.table("routes").select("*").order("created_at",desc=True).execute()
    routes=[]
    for r in res.data:
        stops_res=sb.table("stops").select("status").eq("route_id",r["id"]).execute()
        completed=sum(1 for s in stops_res.data if s["status"]=="complete")
        routes.append({
            "id":r["id"],"rep_name":r["rep_name"],"label":r["label"],
            "total":r["total"],"completed":completed,
            "pct":round(completed/r["total"]*100) if r["total"] else 0,
            "created":r["created_at"],
        })
    return {"routes":routes}


@app.get("/health")
def health():
    try:
        res=sb.table("requests").select("id",count="exact").execute()
        req_count=res.count or 0
    except: req_count=-1
    try:
        res=sb.table("routes").select("id",count="exact").execute()
        route_count=res.count or 0
    except: route_count=-1
    return {"status":"ok","requests":req_count,"routes":route_count,"db":"supabase"}
