import { useState, useEffect, useRef } from "react";

const API        = import.meta.env?.VITE_API_URL || "http://localhost:8000";
const ADMIN_PIN  = "solar2026";

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
const OUTCOMES = ["No Answer","Not Interested","Callback","Appointment Set","Already Has Solar","Come Back Later"];

const TIER_WINDOWS = [
  {id:"t1",key:"T1",range:"0–3 mo", defaultColor:"#E67E22",defaultBg:"#FFF3E0",defaultName:"Tier 1"},
  {id:"t2",key:"T2",range:"3–6 mo", defaultColor:"#C0392B",defaultBg:"#FFEBEE",defaultName:"Tier 2"},
  {id:"t3",key:"T3",range:"6–9 mo", defaultColor:"#D4AC0D",defaultBg:"#FFFDE7",defaultName:"Tier 3"},
  {id:"t4",key:"T4",range:"9–12 mo",defaultColor:"#2471A3",defaultBg:"#E3F2FD",defaultName:"Tier 4"},
];
const TIER_COLORS = [
  {fg:"#E67E22",bg:"#FFF3E0"},{fg:"#C0392B",bg:"#FFEBEE"},{fg:"#D4AC0D",bg:"#FFFDE7"},
  {fg:"#2471A3",bg:"#E3F2FD"},{fg:"#27AE60",bg:"#E8F5E9"},{fg:"#8E44AD",bg:"#F3E5F5"},
  {fg:"#16A085",bg:"#E0F2F1"},{fg:"#D35400",bg:"#FBE9E7"},
];

const defaultTiers = () => TIER_WINDOWS.map((w,i) => ({
  ...w, name:w.defaultName, color:TIER_COLORS[i].fg, bg:TIER_COLORS[i].bg, enabled:true,
}));

// ── helpers ────────────────────────────────────────────────────────────
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
  a.download = name; a.click();
};

// Navigation deep links
const navLinks = (fullAddress) => ({
  google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}&travelmode=driving`,
  waze:   `https://waze.com/ul?q=${encodeURIComponent(fullAddress)}&navigate=yes`,
  apple:  `maps://maps.apple.com/?daddr=${encodeURIComponent(fullAddress)}`,
});

const StatusBadge = ({status}) => {
  const c = status==="ready"
    ? {bg:"#0D2B1A",border:"#27AE60",color:"#27AE60",label:"✓ Ready"}
    : {bg:"#1A1400",border:"#F5A623",color:"#F5A623",label:"⏳ Pending"};
  return <span style={{background:c.bg,border:`1px solid ${c.border}`,color:c.color,
    borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.label}</span>;
};

const TierBadge = ({name,color}) => (
  <span style={{background:color+"22",border:`1px solid ${color}55`,
    borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700,color,whiteSpace:"nowrap"}}>
    {name}
  </span>
);

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
    if (!repName.trim()) { setLoginErr("Enter your name"); return; }
    setRepId(repName.trim().toLowerCase().replace(/\s+/g,"_"));
    setScreen("rep"); setLoginErr("");
  };
  const loginAdmin = () => {
    if (pin !== ADMIN_PIN) { setLoginErr("Wrong PIN"); return; }
    setScreen("admin"); setLoginErr("");
  };

  if (screen === "login") return (
    <div style={{minHeight:"100vh",background:"#080E14",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
      <div style={{width:390}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:54,height:54,background:"linear-gradient(135deg,#F5A623,#E8820C)",
            borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:28,margin:"0 auto 12px"}}>☀️</div>
          <div style={{fontSize:26,fontWeight:800,color:"white"}}>
            KnockList<span style={{color:"#F5A623"}}>AI</span></div>
          <div style={{fontSize:13,color:"#4A6075",marginTop:4}}>Solar door-knock routes, instantly</div>
        </div>
        <div style={{display:"flex",background:"#0D1520",borderRadius:10,padding:4,
          marginBottom:18,border:"1px solid #1E2D3D"}}>
          {[["rep","Sales Rep"],["admin","Admin"]].map(([t,l]) => (
            <button key={t} onClick={()=>setLoginTab(t)} style={{flex:1,padding:"9px 0",
              background:loginTab===t?"#1E2D3D":"transparent",border:"none",borderRadius:7,
              color:loginTab===t?"white":"#4A6075",fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
        <div style={{background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:14,padding:24}}>
          {loginTab==="rep" ? (<>
            <label style={{fontSize:11,fontWeight:600,color:"#F5A623",letterSpacing:"1px",
              textTransform:"uppercase",display:"block",marginBottom:8}}>Your Name</label>
            <input value={repName} onChange={e=>setRepName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&loginRep()} placeholder="e.g. Justin Torres"
              style={{width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:8,
                color:"white",padding:"11px 14px",fontSize:14,outline:"none",
                boxSizing:"border-box",marginBottom:14}}/>
            <button onClick={loginRep} style={{width:"100%",background:"linear-gradient(135deg,#F5A623,#E8820C)",
              border:"none",borderRadius:10,color:"#0A0A0A",fontWeight:800,fontSize:14,
              padding:"12px 0",cursor:"pointer"}}>Sign In →</button>
          </>) : (<>
            <label style={{fontSize:11,fontWeight:600,color:"#F5A623",letterSpacing:"1px",
              textTransform:"uppercase",display:"block",marginBottom:8}}>Admin PIN</label>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&loginAdmin()} placeholder="Enter PIN"
              style={{width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:8,
                color:"white",padding:"11px 14px",fontSize:14,outline:"none",
                boxSizing:"border-box",marginBottom:14}}/>
            <button onClick={loginAdmin} style={{width:"100%",
              background:"linear-gradient(135deg,#1B4F2E,#27AE60)",border:"none",
              borderRadius:10,color:"white",fontWeight:800,fontSize:14,
              padding:"12px 0",cursor:"pointer"}}>Admin Access →</button>
          </>)}
          {loginErr && <div style={{marginTop:10,fontSize:12,color:"#FF6B6B",textAlign:"center"}}>{loginErr}</div>}
        </div>
      </div>
    </div>
  );

  if (screen==="rep")   return <RepDashboard   repId={repId} repName={repName} onLogout={()=>{setScreen("login");setPin("");}} />;
  if (screen==="admin") return <AdminDashboard onLogout={()=>{setScreen("login");setPin("");}} />;
}

// ══════════════════════════════════════════════════════════════════════
// REP DASHBOARD
// ══════════════════════════════════════════════════════════════════════
function RepDashboard({repId,repName,onLogout}) {
  const [tab,      setTab]      = useState("request");
  const [requests, setRequests] = useState([]);
  const [routes,   setRoutes]   = useState([]);
  const [driveRoute,setDriveRoute]=useState(null); // active route object
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState("");

  // Request form
  const [zips,setZips]=useState(""); const [dateFrom,setDateFrom]=useState(""); const [dateTo,setDateTo]=useState("");
  const [priceMin,setPriceMin]=useState(""); const [priceMax,setPriceMax]=useState("");
  const [ownerOcc,setOwnerOcc]=useState("Any"); const [propType,setPropType]=useState("Single Family Residential");
  const [homeCount,setHomeCount]=useState(100); const [customCount,setCustomCount]=useState("");
  const [note,setNote]=useState(""); const [reqErr,setReqErr]=useState("");

  // Generate form
  const [selReq,setSelReq]=useState(null);
  const [homeBase,setHomeBase]=useState("2003 River Crossing Dr, Valrico, FL 33596");
  const [genCount,setGenCount]=useState(100); const [customGen,setCustomGen]=useState("");
  const [tiers,setTiers]=useState(defaultTiers());
  const [label,setLabel]=useState(""); const [genResult,setGenResult]=useState(null);
  const [genErr,setGenErr]=useState("");

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
  useEffect(()=>{ if(tab==="requests"||tab==="generate") loadRequests(); if(tab==="drive") loadRoutes(); },[tab]);

  const readyReqs = requests.filter(r=>r.status==="ready");

  const submitRequest = async () => {
    const zl=zips.trim().split(/[\s,\n]+/).filter(z=>/^\d{5}$/.test(z));
    if(!zl.length){setReqErr("Enter at least one 5-digit ZIP");return;}
    const cnt=homeCount==="Custom"?customCount||100:homeCount;
    setLoading(true);setReqErr("");
    try {
      const d=await post("/rep/request",{rep_id:repId,rep_name:repName,zips:zl.join(","),
        sale_date_from:dateFrom,sale_date_to:dateTo,price_min:priceMin,price_max:priceMax,
        owner_occupied:ownerOcc,property_type:propType,home_count:String(cnt),note});
      setMsg(`✓ Request #${d.request_id} submitted`);
      setZips("");setNote("");setDateFrom("");setDateTo("");setPriceMin("");setPriceMax("");
      setOwnerOcc("Any");setPropType("Single Family Residential");setHomeCount(100);setCustomCount("");
      await loadRequests(); setTab("requests");
    } catch(e){setReqErr(e.message);} finally{setLoading(false);}
  };

  const generate = async () => {
    if(!selReq){setGenErr("Select a fulfilled request first");return;}
    const activeTiers=tiers.filter(t=>t.enabled);
    if(!activeTiers.length){setGenErr("Enable at least one tier");return;}
    const cnt=genCount==="Custom"?(parseInt(customGen)||100):genCount;
    const tierConfig=JSON.stringify(activeTiers.map(t=>({
      key:t.key,name:t.name,color:t.color,bg:t.bg,range:t.range
    })));
    const monthMap={T1:3,T2:6,T3:9,T4:12};
    setLoading(true);setGenErr("");setGenResult(null);
    try {
      const d=await post("/rep/generate",{
        request_id:selReq.id,home_base:homeBase,price_max:800000,
        home_count:cnt,t1_months:3,t2_months:6,t3_months:9,t4_months:12,
        tier_config:tierConfig,
        label:label||`${repName} — ${new Date().toLocaleDateString()}`,
      });
      setGenResult(d);
    } catch(e){setGenErr(e.message);} finally{setLoading(false);}
  };

  const startDriving = async (routeId) => {
    await loadDriveRoute(routeId);
    setTab("drive");
  };

  const card={background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:12,padding:18};
  const lbl={fontSize:11,fontWeight:600,color:"#F5A623",letterSpacing:"1px",textTransform:"uppercase",display:"block",marginBottom:8};
  const inp={width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:8,color:"white",padding:"9px 12px",fontSize:13,outline:"none",boxSizing:"border-box"};

  const hasDrive = routes.length>0||genResult?.route_id;
  const activeRouteId = driveRoute?.id;

  return (
    <div style={{minHeight:"100vh",background:"#080E14",fontFamily:"system-ui,sans-serif",color:"white"}}>
      {/* NAV */}
      <nav style={{background:"#0A1118",borderBottom:"1px solid #1E2D3D",padding:"0 16px",
        display:"flex",alignItems:"center",height:52,gap:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:20}}>
          <span style={{fontSize:16}}>☀️</span>
          <span style={{fontWeight:800,fontSize:14}}>KnockList<span style={{color:"#F5A623"}}>AI</span></span>
        </div>
        {[
          ["request","Request"],
          ["requests","My Requests"],
          ["generate","Generate"],
          ["drive","🚗 Drive"],
        ].map(([t,l]) => (
          <button key={t} onClick={()=>setTab(t)} style={{
            background:tab===t ? (t==="drive"?"#1A2800":"#1E2D3D") : "transparent",
            border:t==="drive"?"1px solid #27AE60":"none",
            color:tab===t?"white":t==="drive"?"#27AE60":"#4A6075",
            padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:t==="drive"?700:500,marginRight:2}}>
            {l}
            {t==="requests"&&readyReqs.length>0&&
              <span style={{background:"#27AE60",color:"white",borderRadius:10,padding:"1px 5px",fontSize:9,marginLeft:5,fontWeight:700}}>{readyReqs.length}</span>}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:"#7A8FA6"}}>👤 {repName}</span>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2A3D50",
            borderRadius:6,color:"#7A8FA6",fontSize:11,padding:"4px 10px",cursor:"pointer"}}>Sign out</button>
        </div>
      </nav>

      {tab==="drive" ? (
        <DriveMode repId={repId} repName={repName} driveRoute={driveRoute}
          setDriveRoute={setDriveRoute} routes={routes} loadDriveRoute={loadDriveRoute}
          onBack={()=>setTab("generate")} tiers={tiers} />
      ) : (
        <div style={{maxWidth:780,margin:"0 auto",padding:"20px 16px"}}>

          {/* REQUEST */}
          {tab==="request" && (
            <div style={{display:"grid",gap:12}}>
              <div><h2 style={{fontSize:20,fontWeight:800,margin:0}}>Request Data</h2>
                <p style={{color:"#4A6075",fontSize:12,margin:"4px 0 0"}}>
                  Specify what you need. Your admin pulls the data and uploads it to your portal.
                </p></div>
              {msg&&<div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:9,
                padding:"9px 14px",fontSize:13,color:"#27AE60"}}>{msg}</div>}
              <div style={card}>
                <span style={lbl}>ZIP Codes</span>
                <textarea value={zips} onChange={e=>setZips(e.target.value)}
                  placeholder="33596, 33511, 33510&#10;One per line or comma separated"
                  style={{...inp,height:80,resize:"none",lineHeight:1.6}}/>
              </div>
              <div style={card}>
                <span style={lbl}>Sale Date Range</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:5,fontWeight:600}}>FROM MONTH</span>
                    <select value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{...inp,cursor:"pointer"}}>
                      <option value="">No start limit</option>
                      {MONTHS.map(m=><option key={m.val} value={m.val}>{m.lbl}</option>)}
                    </select></div>
                  <div><span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:5,fontWeight:600}}>TO MONTH</span>
                    <select value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{...inp,cursor:"pointer"}}>
                      <option value="">No end limit</option>
                      {MONTHS.map(m=><option key={m.val} value={m.val}>{m.lbl}</option>)}
                    </select></div>
                </div>
                {dateFrom&&dateTo&&<div style={{marginTop:8,background:"#0D2B1A",border:"1px solid #1A3A2A",
                  borderRadius:7,padding:"7px 10px",fontSize:12,color:"#27AE60"}}>
                  ✓ {MONTHS.find(m=>m.val===dateFrom)?.lbl} → {MONTHS.find(m=>m.val===dateTo)?.lbl}
                </div>}
              </div>
              <div style={card}>
                <span style={lbl}>Sale Price Range</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div><span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:5,fontWeight:600}}>MIN PRICE</span>
                    <input value={priceMin?("$"+Number(priceMin.replace(/\D/g,"")||0).toLocaleString()):""}
                      onChange={e=>setPriceMin(e.target.value.replace(/\D/g,""))} placeholder="e.g. $200,000" style={inp}/></div>
                  <div><span style={{fontSize:10,color:"#7A8FA6",display:"block",marginBottom:5,fontWeight:600}}>MAX PRICE</span>
                    <input value={priceMax?("$"+Number(priceMax.replace(/\D/g,"")||0).toLocaleString()):""}
                      onChange={e=>setPriceMax(e.target.value.replace(/\D/g,""))} placeholder="e.g. $800,000" style={inp}/></div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div style={card}><span style={lbl}>Owner Occupied</span>
                  {["Yes","No","Any"].map(o=>(
                    <button key={o} onClick={()=>setOwnerOcc(o)} style={{display:"block",width:"100%",
                      padding:"8px 10px",borderRadius:7,textAlign:"left",marginBottom:5,
                      border:`1.5px solid ${ownerOcc===o?"#F5A623":"#2A3D50"}`,
                      background:ownerOcc===o?"#3A2800":"transparent",
                      color:ownerOcc===o?"#F5A623":"#7A8FA6",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      {o==="Yes"?"✓ Owner Occupied":o==="No"?"✗ Non-Owner":"— Any"}
                    </button>
                  ))}</div>
                <div style={card}><span style={lbl}>Property Type</span>
                  {PROPERTY_TYPES.map(p=>(
                    <button key={p} onClick={()=>setPropType(p)} style={{display:"block",width:"100%",
                      padding:"8px 10px",borderRadius:7,textAlign:"left",marginBottom:5,
                      border:`1.5px solid ${propType===p?"#F5A623":"#2A3D50"}`,
                      background:propType===p?"#3A2800":"transparent",
                      color:propType===p?"#F5A623":"#7A8FA6",fontSize:11,fontWeight:600,cursor:"pointer"}}>{p}</button>
                  ))}</div>
              </div>
              <div style={card}>
                <span style={lbl}>Records Needed</span>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
                  {COUNTS.map(c=>(
                    <button key={c} onClick={()=>{setHomeCount(c);if(c!=="Custom")setCustomCount("");}}
                      style={{padding:"7px 14px",borderRadius:7,
                        border:`1.5px solid ${homeCount===c?"#F5A623":"#2A3D50"}`,
                        background:homeCount===c?"#3A2800":"transparent",
                        color:homeCount===c?"#F5A623":"#7A8FA6",fontSize:12,fontWeight:600,cursor:"pointer"}}>{c}</button>
                  ))}
                </div>
                {homeCount==="Custom"&&<input type="number" value={customCount}
                  onChange={e=>setCustomCount(e.target.value)} placeholder="Enter exact number..."
                  style={{...inp,width:180}}/>}
              </div>
              <div style={card}><span style={lbl}>Notes for Admin (optional)</span>
                <input value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="e.g. Need by Tuesday, focus south Brandon" style={inp}/></div>
              {reqErr&&<div style={{background:"#2B0A0A",border:"1px solid #C0392B",borderRadius:8,
                padding:"9px 12px",fontSize:12,color:"#FF6B6B"}}>{reqErr}</div>}
              <button onClick={submitRequest} disabled={loading}
                style={{background:loading?"#2A3D50":"linear-gradient(135deg,#F5A623,#E8820C)",
                  border:"none",borderRadius:10,color:"#0A0A0A",fontWeight:800,
                  fontSize:14,padding:"13px 0",cursor:loading?"default":"pointer"}}>
                {loading?"Submitting…":"📤  Submit Data Request"}
              </button>
            </div>
          )}

          {/* MY REQUESTS */}
          {tab==="requests" && (
            <div style={{display:"grid",gap:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><h2 style={{fontSize:20,fontWeight:800,margin:0}}>My Requests</h2>
                  <p style={{color:"#4A6075",fontSize:12,margin:"4px 0 0"}}>
                    {readyReqs.length>0?`${readyReqs.length} ready — go to Generate`:"Waiting for admin to upload data"}</p></div>
                <button onClick={loadRequests} style={{background:"#1E2D3D",border:"none",
                  borderRadius:8,color:"#7A8FA6",fontSize:12,padding:"7px 14px",cursor:"pointer"}}>↻</button>
              </div>
              {requests.length===0?(
                <div style={{...card,textAlign:"center",padding:36,color:"#4A6075"}}>
                  No requests yet. Go to "Request" to get started.
                </div>
              ):requests.map(req=>(
                <div key={req.id} style={card}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontFamily:"monospace",fontSize:10,color:"#4A6075",
                          background:"#1E2D3D",padding:"2px 7px",borderRadius:4}}>#{req.id}</span>
                        <StatusBadge status={req.status}/>
                      </div>
                      <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>ZIPs: {req.zips.join(", ")}</div>
                      <div style={{fontSize:11,color:"#4A6075"}}>
                        {req.created}{req.fulfilled&&<> · {req.row_count?.toLocaleString()} homes loaded</>}
                      </div>
                      {req.note&&<div style={{fontSize:11,color:"#7A8FA6",marginTop:2,fontStyle:"italic"}}>"{req.note}"</div>}
                    </div>
                    {req.status==="ready"&&(
                      <button onClick={()=>{setSelReq(req);setTab("generate");}}
                        style={{background:"linear-gradient(135deg,#27AE60,#1E8449)",border:"none",
                          borderRadius:7,color:"white",fontWeight:700,fontSize:11,
                          padding:"7px 14px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
                        Generate →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GENERATE */}
          {tab==="generate" && (
            <div style={{display:"grid",gap:12}}>
              <div><h2 style={{fontSize:20,fontWeight:800,margin:0}}>Generate Knock List</h2>
                <p style={{color:"#4A6075",fontSize:12,margin:"4px 0 0"}}>
                  Configure your tiers, set your count, and generate your routed list.
                </p></div>

              {/* Select request */}
              <div style={card}><span style={lbl}>Select Data</span>
                {readyReqs.length===0?(
                  <div style={{fontSize:13,color:"#4A6075"}}>No fulfilled data yet.</div>
                ):readyReqs.map(req=>(
                  <div key={req.id} onClick={()=>setSelReq(selReq?.id===req.id?null:req)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
                      background:selReq?.id===req.id?"#0D2B1A":"#080E14",
                      border:`1.5px solid ${selReq?.id===req.id?"#27AE60":"#2A3D50"}`,
                      borderRadius:8,cursor:"pointer",marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:12}}>ZIPs: {req.zips.join(", ")}</div>
                      <div style={{fontSize:10,color:"#4A6075",marginTop:1}}>{req.row_count?.toLocaleString()||"—"} homes · {req.fulfilled}</div>
                    </div>
                    <div style={{width:16,height:16,borderRadius:"50%",
                      background:selReq?.id===req.id?"#27AE60":"transparent",
                      border:`2px solid ${selReq?.id===req.id?"#27AE60":"#2A3D50"}`,flexShrink:0}}/>
                  </div>
                ))}</div>

              {selReq&&(<>
                <div style={card}><span style={lbl}>List Name</span>
                  <input value={label} onChange={e=>setLabel(e.target.value)}
                    placeholder={`${repName} — ${new Date().toLocaleDateString()}`} style={inp}/></div>

                <div style={card}><span style={lbl}>Number of Homes</span>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:8}}>
                    {COUNTS.map(c=>(
                      <button key={c} onClick={()=>{setGenCount(c);if(c!=="Custom")setCustomGen("");}}
                        style={{padding:"7px 14px",borderRadius:7,
                          border:`1.5px solid ${genCount===c?"#F5A623":"#2A3D50"}`,
                          background:genCount===c?"#3A2800":"transparent",
                          color:genCount===c?"#F5A623":"#7A8FA6",fontSize:12,fontWeight:600,cursor:"pointer"}}>{c}</button>
                    ))}
                  </div>
                  {genCount==="Custom"&&<input type="number" value={customGen}
                    onChange={e=>setCustomGen(e.target.value)} placeholder="Enter number..."
                    style={{...inp,width:200}}/>}</div>

                <div style={card}><span style={lbl}>Starting Address</span>
                  <input value={homeBase} onChange={e=>setHomeBase(e.target.value)} style={inp}/>
                  <p style={{margin:"5px 0 0",fontSize:11,color:"#4A6075"}}>Route built closest-to-closest from here</p></div>

                {/* TIER BUILDER */}
                <div style={card}>
                  <span style={lbl}>Lead Tiers</span>
                  <p style={{fontSize:12,color:"#4A6075",marginBottom:12}}>
                    Toggle windows, rename, and pick a color. These labels appear on your printed list and in Drive mode.
                  </p>
                  <div style={{display:"grid",gap:8}}>
                    {TIER_WINDOWS.map((win,i) => {
                      const t=tiers[i];
                      return (
                        <div key={win.id} style={{background:t.enabled?"#0A1118":"#080E14",
                          border:`1.5px solid ${t.enabled?t.color:"#1E2D3D"}`,
                          borderRadius:10,padding:"10px 14px",opacity:t.enabled?1:0.5,transition:"all 0.2s"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div onClick={()=>{const n=[...tiers];n[i]={...n[i],enabled:!n[i].enabled};setTiers(n);}}
                              style={{width:34,height:18,borderRadius:9,cursor:"pointer",flexShrink:0,
                                background:t.enabled?"#27AE60":"#2A3D50",position:"relative"}}>
                              <div style={{position:"absolute",top:2,left:t.enabled?16:2,
                                width:14,height:14,borderRadius:"50%",background:"white",transition:"left 0.15s"}}/>
                            </div>
                            <div onClick={()=>{const n=[...tiers];const ci=TIER_COLORS.findIndex(c=>c.fg===t.color);
                              const ni=(ci+1)%TIER_COLORS.length;n[i]={...n[i],color:TIER_COLORS[ni].fg,bg:TIER_COLORS[ni].bg};setTiers(n);}}
                              style={{width:18,height:18,borderRadius:"50%",background:t.color,
                                cursor:"pointer",border:"2px solid rgba(255,255,255,0.2)",flexShrink:0}}
                              title="Click to change color"/>
                            <span style={{fontSize:11,fontWeight:700,color:t.enabled?t.color:"#4A6075",minWidth:80}}>{win.range}</span>
                            <input value={t.name} onChange={e=>{const n=[...tiers];n[i]={...n[i],name:e.target.value};setTiers(n);}}
                              disabled={!t.enabled} placeholder={win.defaultName}
                              style={{flex:1,background:"#080E14",border:"1px solid #2A3D50",borderRadius:6,
                                color:"white",padding:"4px 8px",fontSize:12,outline:"none"}}/>
                            {t.enabled&&<span style={{fontSize:9,color:t.color,background:t.color+"22",
                              border:`1px solid ${t.color}44`,borderRadius:3,padding:"2px 6px",
                              fontWeight:700,flexShrink:0,whiteSpace:"nowrap"}}>
                              {i===0?"HOTTEST":i===1?"★ SWEET SPOT":i===2?"VIABLE":"LOWER PRI"}
                            </span>}
                          </div>
                        </div>
                      );
                    })}
                    <div style={{background:"#080E14",borderRadius:9,padding:"9px 14px",
                      border:"1px solid #1E2D3D",fontSize:11,color:"#4A6075"}}>
                      🔵 12+ months — included but unlabeled
                    </div>
                  </div>
                  {/* Preview */}
                  <div style={{marginTop:12,background:"#080E14",borderRadius:8,padding:"9px 12px",border:"1px solid #2A3D50"}}>
                    <span style={{fontSize:10,color:"#4A6075",marginRight:10}}>Preview:</span>
                    {tiers.filter(t=>t.enabled).map(t=>(
                      <span key={t.id} style={{marginRight:8,fontSize:10,fontWeight:700,color:t.color,
                        background:t.color+"22",border:`1px solid ${t.color}44`,
                        borderRadius:3,padding:"2px 7px"}}>{t.name}</span>
                    ))}
                  </div>
                </div>

                {genErr&&<div style={{background:"#2B0A0A",border:"1px solid #C0392B",borderRadius:8,
                  padding:"9px 12px",fontSize:12,color:"#FF6B6B"}}>{genErr}</div>}

                {genResult ? (
                  <div style={{display:"grid",gap:10}}>
                    <div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:12,
                      padding:16,display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:38,height:38,background:"#27AE60",borderRadius:"50%",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>✓</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800,fontSize:14}}>{genResult.label}</div>
                        <div style={{color:"#7A8FA6",fontSize:12,marginTop:2}}>
                          {genResult.total_stops} homes · {genResult.pages} pages · proximity-ordered
                        </div>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                      <button onClick={()=>dlFile(genResult.pdf_b64,genResult.label+".pdf","application/pdf")}
                        style={{background:"#2B0A0A",border:"1px solid #C0392B",borderRadius:10,
                          padding:"14px",cursor:"pointer",textAlign:"center"}}>
                        <div style={{fontSize:22,marginBottom:4}}>📄</div>
                        <div style={{fontWeight:700,fontSize:12,color:"#E74C3C"}}>Download PDF</div>
                        <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Print-ready</div>
                      </button>
                      <button onClick={()=>dlFile(genResult.csv_b64,genResult.label+".csv","text/csv")}
                        style={{background:"#0A2B16",border:"1px solid #27AE60",borderRadius:10,
                          padding:"14px",cursor:"pointer",textAlign:"center"}}>
                        <div style={{fontSize:22,marginBottom:4}}>📊</div>
                        <div style={{fontWeight:700,fontSize:12,color:"#27AE60"}}>Download CSV</div>
                        <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Route planner</div>
                      </button>
                      <button onClick={()=>{ loadDriveRoute(genResult.route_id).then(()=>setTab("drive")); }}
                        style={{background:"#1A2800",border:"1px solid #7BC818",borderRadius:10,
                          padding:"14px",cursor:"pointer",textAlign:"center"}}>
                        <div style={{fontSize:22,marginBottom:4}}>🚗</div>
                        <div style={{fontWeight:700,fontSize:12,color:"#7BC818"}}>Start Driving</div>
                        <div style={{fontSize:10,color:"#7A8FA6",marginTop:2}}>Turn-by-turn</div>
                      </button>
                    </div>
                    <button onClick={()=>setGenResult(null)}
                      style={{background:"transparent",border:"1px solid #1E2D3D",borderRadius:9,
                        color:"#7A8FA6",fontSize:13,padding:"10px 0",cursor:"pointer",fontWeight:600}}>
                      ← Generate Another
                    </button>
                  </div>
                ) : (
                  <button onClick={generate} disabled={loading}
                    style={{background:loading?"#2A3D50":"linear-gradient(135deg,#27AE60,#1E8449)",
                      border:"none",borderRadius:10,color:"white",fontWeight:800,
                      fontSize:14,padding:"13px 0",cursor:loading?"default":"pointer"}}>
                    {loading?"⏳  Building your route…":"⚡  Generate Knock List"}
                  </button>
                )}
              </>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DRIVE MODE — full screen
// ══════════════════════════════════════════════════════════════════════
function DriveMode({repId,driveRoute,setDriveRoute,routes,loadDriveRoute,onBack,tiers}) {
  const [view,      setView]      = useState(driveRoute?"current":"list");
  const [outcome,   setOutcome]   = useState("");
  const [note,      setNote]      = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [showNav,   setShowNav]   = useState(false);

  useEffect(()=>{ if(driveRoute) setView("current"); },[driveRoute?.id]);

  const route      = driveRoute;
  const stops      = route?.stops || [];
  const currentStop= stops.find(s=>s.stop_num===route?.current_stop) || stops.find(s=>s.status==="pending");
  const completed  = stops.filter(s=>s.status==="complete").length;
  const total      = stops.length;
  const pct        = total>0?Math.round(completed/total*100):0;

  const tierColor = (tierKey) => {
    const t = tiers.find(t=>t.key===tierKey);
    return t?.color || "#7A8FA6";
  };
  const tierName = (tierKey) => {
    const t = tiers.find(t=>t.key===tierKey);
    return t?.name || tierKey;
  };

  const doComplete = async () => {
    if (!outcome) return;
    setSubmitting(true);
    try {
      await post(`/route/${route.id}/stop/${currentStop.stop_num}/complete`,
        {outcome, note});
      await loadDriveRoute(route.id);
      setOutcome(""); setNote(""); setShowNav(false);
    } catch(e){} finally{setSubmitting(false);}
  };

  const doSkip = async () => {
    setSubmitting(true);
    try {
      await post(`/route/${route.id}/stop/${currentStop.stop_num}/skip`,{note});
      await loadDriveRoute(route.id);
      setOutcome(""); setNote(""); setShowNav(false);
    } catch(e){} finally{setSubmitting(false);}
  };

  const navL = currentStop ? navLinks(currentStop.full_address) : null;

  // No route loaded — show route picker
  if (!route) return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"20px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"#1E2D3D",border:"none",borderRadius:7,
          color:"#7A8FA6",fontSize:12,padding:"6px 12px",cursor:"pointer"}}>← Back</button>
        <h2 style={{fontSize:20,fontWeight:800,margin:0}}>Drive Mode</h2>
      </div>
      {routes.length===0?(
        <div style={{background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:12,
          padding:40,textAlign:"center",color:"#4A6075"}}>
          Generate a list first, then come back here to start driving.
        </div>
      ):(
        <div style={{display:"grid",gap:10}}>
          <p style={{color:"#4A6075",fontSize:13,margin:"0 0 8px"}}>Select a route to drive:</p>
          {routes.map(r=>(
            <div key={r.id} onClick={()=>loadDriveRoute(r.id)}
              style={{background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:10,
                padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{r.label}</div>
                <div style={{fontSize:11,color:"#4A6075",marginTop:2}}>
                  {r.completed}/{r.total} stops done · {r.pct}% · {r.created}
                </div>
              </div>
              <div style={{color:"#27AE60",fontSize:12,fontWeight:700}}>Select →</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"16px"}}>
      {/* Progress bar */}
      <div style={{background:"#0D1520",borderRadius:10,padding:"12px 16px",
        border:"1px solid #1E2D3D",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700}}>{route.label}</span>
          <span style={{fontSize:12,color:"#7A8FA6"}}>{completed} / {total} stops · {pct}%</span>
        </div>
        <div style={{height:6,background:"#1E2D3D",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,
            background:"linear-gradient(90deg,#27AE60,#7BC818)",borderRadius:3,transition:"width 0.4s"}}/>
        </div>
        {completed===total&&total>0&&(
          <div style={{textAlign:"center",fontSize:12,color:"#27AE60",marginTop:8,fontWeight:700}}>
            ✓ All stops complete! Great work today.
          </div>
        )}
      </div>

      {/* View toggle */}
      <div style={{display:"flex",background:"#0A1118",borderRadius:8,padding:3,
        border:"1px solid #1E2D3D",marginBottom:14}}>
        {[["current","Current Stop"],["list","All Stops"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"7px 0",
            background:view===v?"#1E2D3D":"transparent",border:"none",borderRadius:6,
            color:view===v?"white":"#4A6075",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>
        ))}
      </div>

      {/* CURRENT STOP */}
      {view==="current" && currentStop && (
        <div style={{display:"grid",gap:12}}>
          {/* Stop card */}
          <div style={{background:"#0D1520",border:`2px solid ${tierColor(currentStop.tier_key)}`,
            borderRadius:14,padding:20}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{background:"#1E2D3D",borderRadius:6,padding:"3px 10px",
                    fontSize:12,fontWeight:700,color:"white"}}>Stop {currentStop.stop_num}</span>
                  <TierBadge name={tierName(currentStop.tier_key)} color={tierColor(currentStop.tier_key)}/>
                </div>
                <div style={{fontSize:20,fontWeight:800,lineHeight:1.2,marginBottom:4}}>
                  {currentStop.address}
                </div>
                <div style={{fontSize:13,color:"#7A8FA6"}}>
                  {currentStop.owner} · Moved in {currentStop.sale_date}
                </div>
              </div>
            </div>

            {/* Navigate buttons */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"#4A6075",textTransform:"uppercase",
                letterSpacing:"1px",marginBottom:8,fontWeight:600}}>Navigate To This Stop</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <a href={navL.google} target="_blank" rel="noreferrer"
                  style={{display:"block",background:"#1A2040",border:"1px solid #4285F4",
                    borderRadius:9,padding:"10px 6px",textAlign:"center",textDecoration:"none"}}>
                  <div style={{fontSize:18,marginBottom:3}}>🗺️</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#4285F4"}}>Google Maps</div>
                </a>
                <a href={navL.waze} target="_blank" rel="noreferrer"
                  style={{display:"block",background:"#1A2830",border:"1px solid #33CCFF",
                    borderRadius:9,padding:"10px 6px",textAlign:"center",textDecoration:"none"}}>
                  <div style={{fontSize:18,marginBottom:3}}>🚗</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#33CCFF"}}>Waze</div>
                </a>
                <a href={navL.apple} target="_blank" rel="noreferrer"
                  style={{display:"block",background:"#1A1A28",border:"1px solid #888",
                    borderRadius:9,padding:"10px 6px",textAlign:"center",textDecoration:"none"}}>
                  <div style={{fontSize:18,marginBottom:3}}>🍎</div>
                  <div style={{fontSize:11,fontWeight:700,color:"#aaa"}}>Apple Maps</div>
                </a>
              </div>
            </div>

            {/* Outcome buttons */}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:"#4A6075",textTransform:"uppercase",
                letterSpacing:"1px",marginBottom:8,fontWeight:600}}>Door Outcome</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                {OUTCOMES.map(o=>(
                  <button key={o} onClick={()=>setOutcome(o===outcome?"":o)}
                    style={{padding:"9px 8px",borderRadius:8,border:`1.5px solid ${outcome===o?"#F5A623":"#2A3D50"}`,
                      background:outcome===o?"#3A2800":"transparent",
                      color:outcome===o?"#F5A623":"#7A8FA6",
                      fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left"}}>
                    {o==="No Answer"?"🚪 No Answer"
                     :o==="Not Interested"?"✋ Not Interested"
                     :o==="Callback"?"📞 Callback"
                     :o==="Appointment Set"?"⭐ Appointment Set"
                     :o==="Already Has Solar"?"☀️ Has Solar"
                     :"🔄 Come Back Later"}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <input value={note} onChange={e=>setNote(e.target.value)}
              placeholder="Optional note (e.g. speaks Spanish, dog in yard)..."
              style={{width:"100%",background:"#080E14",border:"1px solid #2A3D50",borderRadius:8,
                color:"white",padding:"8px 12px",fontSize:12,outline:"none",
                boxSizing:"border-box",marginBottom:12}}/>

            {/* Action buttons */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10}}>
              <button onClick={doSkip} disabled={submitting}
                style={{background:"transparent",border:"1px solid #2A3D50",borderRadius:9,
                  color:"#7A8FA6",fontSize:13,padding:"11px 0",cursor:"pointer",fontWeight:600}}>
                Skip →
              </button>
              <button onClick={doComplete} disabled={!outcome||submitting}
                style={{background:outcome?"linear-gradient(135deg,#27AE60,#1E8449)":"#1E2D3D",
                  border:"none",borderRadius:9,color:outcome?"white":"#4A6075",
                  fontSize:13,fontWeight:800,padding:"11px 0",
                  cursor:outcome?"pointer":"default",transition:"all 0.2s"}}>
                {submitting?"Saving…":"✓ Complete & Next Stop"}
              </button>
            </div>
          </div>

          {/* Next 3 stops preview */}
          {stops.filter(s=>s.status==="pending"&&s.stop_num!==currentStop.stop_num).slice(0,3).length>0&&(
            <div>
              <div style={{fontSize:11,color:"#4A6075",marginBottom:8,fontWeight:600,
                textTransform:"uppercase",letterSpacing:"1px"}}>Coming up</div>
              {stops.filter(s=>s.status==="pending"&&s.stop_num!==currentStop.stop_num).slice(0,3).map(s=>(
                <div key={s.stop_num} style={{background:"#0A1118",border:"1px solid #1E2D3D",
                  borderRadius:9,padding:"10px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#4A6075",
                    background:"#1E2D3D",borderRadius:5,padding:"2px 8px",flexShrink:0}}>
                    #{s.stop_num}
                  </span>
                  <span style={{width:8,height:8,borderRadius:"50%",
                    background:tierColor(s.tier_key),flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.address}</div>
                    <div style={{fontSize:10,color:"#4A6075"}}>{s.owner}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Done */}
          {!currentStop&&(
            <div style={{background:"#0D2B1A",border:"1px solid #27AE60",borderRadius:12,
              padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🎉</div>
              <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>Route Complete!</div>
              <div style={{color:"#7A8FA6",fontSize:13}}>{completed} stops knocked today</div>
            </div>
          )}
        </div>
      )}

      {/* ALL STOPS LIST */}
      {view==="list" && (
        <div style={{display:"grid",gap:7}}>
          <div style={{fontSize:11,color:"#4A6075",marginBottom:4}}>
            {completed} complete · {stops.filter(s=>s.status==="skipped").length} skipped · {stops.filter(s=>s.status==="pending").length} remaining
          </div>
          {stops.map(s=>{
            const isCurrent=s.stop_num===route.current_stop;
            const isDone=s.status==="complete";
            const isSkipped=s.status==="skipped";
            return (
              <div key={s.stop_num} style={{
                background:isCurrent?"#0D2B1A":isDone?"#0A1118":isSkipped?"#0A0A0A":"#0D1520",
                border:`1px solid ${isCurrent?"#27AE60":isDone?"#1E3D26":isSkipped?"#1E1E1E":"#1E2D3D"}`,
                borderRadius:9,padding:"10px 14px",
                opacity:isDone?0.7:isSkipped?0.5:1,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,fontWeight:700,color:isCurrent?"#27AE60":"#4A6075",
                    background:"#1E2D3D",borderRadius:5,padding:"2px 8px",flexShrink:0,minWidth:32,textAlign:"center"}}>
                    {s.stop_num}
                  </span>
                  <span style={{width:8,height:8,borderRadius:"50%",background:tierColor(s.tier_key),flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",textDecoration:isDone?"line-through":"none"}}>{s.address}</div>
                    <div style={{fontSize:10,color:"#4A6075"}}>{s.owner} · {s.sale_date}</div>
                  </div>
                  {isDone&&<span style={{fontSize:11,color:"#27AE60",fontWeight:700,flexShrink:0}}>{s.outcome||"✓"}</span>}
                  {isSkipped&&<span style={{fontSize:10,color:"#555",flexShrink:0}}>skipped</span>}
                  {isCurrent&&<span style={{fontSize:10,color:"#27AE60",fontWeight:700,flexShrink:0}}>← NOW</span>}
                </div>
              </div>
            );
          })}
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

  const MONTHS_REF = MONTHS;

  const load = async () => {
    try {
      const [dr,rr] = await Promise.all([get("/admin/requests"),get("/admin/routes")]);
      setRequests(dr.requests); setStats({total:dr.total,pending:dr.pending,ready:dr.ready});
      setRoutes(rr.routes);
    } catch{}
  };

  useEffect(()=>{load(); const i=setInterval(load,10000); return()=>clearInterval(i);},[]);

  const fulfill = async (reqId,file) => {
    setUploading(reqId);
    const fd=new FormData(); fd.append("file",file);
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
  const card={background:"#0D1520",border:"1px solid #1E2D3D",borderRadius:12,padding:18};

  return (
    <div style={{minHeight:"100vh",background:"#080E14",fontFamily:"system-ui,sans-serif",color:"white"}}>
      <nav style={{background:"#0A1118",borderBottom:"1px solid #1E2D3D",padding:"0 16px",
        display:"flex",alignItems:"center",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>☀️</span>
          <span style={{fontWeight:800,fontSize:14}}>
            KnockList<span style={{color:"#F5A623"}}>AI</span>
            <span style={{fontSize:10,color:"#27AE60",marginLeft:8,fontWeight:600}}>ADMIN</span>
          </span>
        </div>
        <div style={{display:"flex",gap:4,marginLeft:20}}>
          {[["requests","Data Requests"],["routes","Live Routes"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?"#1E2D3D":"transparent",
              border:"none",color:tab===t?"white":"#4A6075",padding:"6px 12px",borderRadius:6,
              cursor:"pointer",fontSize:12,fontWeight:500}}>
              {l}{t==="routes"&&routes.length>0&&
                <span style={{background:"#27AE60",color:"white",borderRadius:10,padding:"1px 5px",
                  fontSize:9,marginLeft:5,fontWeight:700}}>{routes.length}</span>}
            </button>
          ))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={load} style={{background:"#1E2D3D",border:"none",borderRadius:7,
            color:"#7A8FA6",fontSize:12,padding:"5px 12px",cursor:"pointer"}}>↻</button>
          <button onClick={onLogout} style={{background:"transparent",border:"1px solid #2A3D50",
            borderRadius:6,color:"#7A8FA6",fontSize:11,padding:"4px 10px",cursor:"pointer"}}>Sign out</button>
        </div>
      </nav>

      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px"}}>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          {[["Requests",stats.total||0,"white"],["⏳ Pending",stats.pending||0,"#F5A623"],
            ["✓ Fulfilled",stats.ready||0,"#27AE60"],["🚗 Active Routes",routes.length,"#4285F4"]].map(([l,v,c])=>(
            <div key={l} style={{...card,textAlign:"center",padding:14}}>
              <div style={{fontSize:26,fontWeight:800,color:c}}>{v}</div>
              <div style={{fontSize:11,color:"#4A6075",marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>

        {/* DATA REQUESTS TAB */}
        {tab==="requests" && (<>
          <h3 style={{fontSize:14,fontWeight:700,marginBottom:10,color:"#F5A623"}}>
            ⏳ Pending {pending.length>0&&`(${pending.length})`}
          </h3>
          {pending.length===0?(
            <div style={{...card,textAlign:"center",padding:28,color:"#4A6075",marginBottom:20}}>
              No pending requests.
            </div>
          ):(
            <div style={{display:"grid",gap:12,marginBottom:20}}>
              {pending.map(req=>(
                <div key={req.id} style={card}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:10}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                        <span style={{fontFamily:"monospace",fontSize:11,color:"#4A6075",
                          background:"#1E2D3D",padding:"2px 7px",borderRadius:4}}>#{req.id}</span>
                        <span style={{fontWeight:700,fontSize:14}}>{req.rep_name}</span>
                        <StatusBadge status={req.status}/>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:4}}>
                        {req.zips.map(z=>(
                          <span key={z} style={{background:"#1E2D3D",borderRadius:5,
                            padding:"2px 9px",fontSize:12,fontWeight:600,color:"#B0C4D4"}}>{z}</span>
                        ))}
                      </div>
                      <div style={{fontSize:11,color:"#4A6075"}}>{req.created}</div>
                      {req.note&&<div style={{fontSize:11,color:"#7A8FA6",marginTop:2,fontStyle:"italic"}}>"{req.note}"</div>}
                    </div>
                    <div style={{flexShrink:0,textAlign:"center"}}>
                      <input ref={el=>fileRefs.current[req.id]=el} type="file"
                        accept=".csv,.xlsx,.xls" style={{display:"none"}}
                        onChange={e=>e.target.files[0]&&fulfill(req.id,e.target.files[0])}/>
                      <button onClick={()=>fileRefs.current[req.id]?.click()} disabled={uploading===req.id}
                        style={{background:uploading===req.id?"#2A3D50":"linear-gradient(135deg,#F5A623,#E8820C)",
                          border:"none",borderRadius:8,color:"#0A0A0A",fontWeight:800,fontSize:11,
                          padding:"9px 14px",cursor:uploading===req.id?"default":"pointer",
                          whiteSpace:"nowrap",display:"block",marginBottom:4}}>
                        {uploading===req.id?"Uploading…":"📤 Upload Data Export"}
                      </button>
                      <span style={{fontSize:9,color:"#4A6075"}}>Pull {req.filters?.home_count||"100"} records</span>
                    </div>
                  </div>
                  {/* Search criteria */}
                  <div style={{background:"#080E14",border:"1px solid #1A3A2A",borderRadius:9,padding:12}}>
                    <div style={{fontSize:10,fontWeight:600,color:"#27AE60",letterSpacing:"1px",
                      textTransform:"uppercase",marginBottom:8}}>🔍 Search Criteria</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                      {[
                        ["ZIPs",      req.zips.join(", ")],
                        ["Date From", req.filters?.sale_date_from?MONTHS.find(m=>m.val===req.filters.sale_date_from)?.lbl||req.filters.sale_date_from:"Any"],
                        ["Date To",   req.filters?.sale_date_to?MONTHS.find(m=>m.val===req.filters.sale_date_to)?.lbl||req.filters.sale_date_to:"Any"],
                        ["Min Price", req.filters?.price_min?"$"+Number(req.filters.price_min).toLocaleString():"Any"],
                        ["Max Price", req.filters?.price_max?"$"+Number(req.filters.price_max).toLocaleString():"Any"],
                        ["Owner Occ.",req.filters?.owner_occupied||"Any"],
                        ["Type",      req.filters?.property_type||"Any"],
                        ["Records",   req.filters?.home_count||"100"],
                      ].map(([k,v])=>(
                        <div key={k} style={{background:"#0D1520",borderRadius:6,padding:"6px 8px",border:"1px solid #1E2D3D"}}>
                          <div style={{fontSize:8,color:"#4A6075",textTransform:"uppercase",letterSpacing:"1px",marginBottom:2}}>{k}</div>
                          <div style={{fontSize:11,fontWeight:600,color:"white",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {msgs[req.id]&&(
                    <div style={{marginTop:8,fontSize:12,padding:"7px 10px",borderRadius:7,
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
            <h3 style={{fontSize:14,fontWeight:700,marginBottom:10,color:"#27AE60"}}>✓ Fulfilled ({fulfilled.length})</h3>
            <div style={{display:"grid",gap:8}}>
              {fulfilled.map(req=>(
                <div key={req.id} style={{...card,display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                      <span style={{fontFamily:"monospace",fontSize:10,color:"#4A6075",
                        background:"#1E2D3D",padding:"2px 6px",borderRadius:4}}>#{req.id}</span>
                      <span style={{fontWeight:700,fontSize:13}}>{req.rep_name}</span>
                      <StatusBadge status={req.status}/>
                    </div>
                    <div style={{fontSize:11,color:"#7A8FA6"}}>
                      ZIPs: {req.zips.join(", ")} · {req.row_count?.toLocaleString()} homes · {req.fulfilled}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </>)}

        {/* LIVE ROUTES TAB */}
        {tab==="routes" && (
          <div style={{display:"grid",gap:10}}>
            <p style={{color:"#4A6075",fontSize:13,margin:"0 0 8px"}}>
              Live view of all active driving sessions.
            </p>
            {routes.length===0?(
              <div style={{...card,textAlign:"center",padding:32,color:"#4A6075"}}>
                No active routes. Reps will appear here once they start driving.
              </div>
            ):routes.map(r=>(
              <div key={r.id} style={card}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                      <span style={{fontFamily:"monospace",fontSize:10,color:"#4A6075",
                        background:"#1E2D3D",padding:"2px 6px",borderRadius:4}}>#{r.id}</span>
                      <span style={{fontWeight:700,fontSize:14}}>{r.rep_name}</span>
                      <span style={{fontSize:11,color:"#27AE60",fontWeight:600}}>🟢 Active</span>
                    </div>
                    <div style={{fontSize:12,color:"#B0C4D4",marginBottom:6}}>{r.label}</div>
                    <div style={{height:6,background:"#1E2D3D",borderRadius:3,overflow:"hidden",maxWidth:300}}>
                      <div style={{height:"100%",width:`${r.pct}%`,
                        background:"linear-gradient(90deg,#27AE60,#7BC818)",borderRadius:3}}/>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:26,fontWeight:800,color:"#27AE60"}}>{r.pct}%</div>
                    <div style={{fontSize:11,color:"#4A6075"}}>{r.completed}/{r.total} stops</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
