"""
KnockListAI Backend v6 — Supabase database
All data persists across Railway restarts.
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd, io, re, hashlib, math, base64, uuid, json
from datetime import datetime
from typing import Optional
from supabase import create_client, Client

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# ── Supabase ───────────────────────────────────────────────────────────
import os
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://gnobnrwpieosdliysjmt.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="KnockListAI", version="6.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ZIP_COORDS = {
    33510:(27.941,-82.299),33511:(27.935,-82.285),33527:(27.985,-82.213),
    33534:(27.840,-82.369),33547:(27.863,-82.213),33548:(28.143,-82.460),
    33549:(28.143,-82.430),33556:(28.168,-82.557),33558:(28.168,-82.523),
    33559:(28.168,-82.450),33563:(28.021,-82.128),33565:(28.055,-82.099),
    33566:(27.997,-82.100),33567:(27.950,-82.109),33569:(27.862,-82.341),
    33570:(27.718,-82.432),33572:(27.769,-82.396),33573:(27.716,-82.358),
    33578:(27.855,-82.328),33579:(27.814,-82.285),33584:(27.996,-82.273),
    33592:(28.054,-82.281),33594:(27.934,-82.234),33596:(27.907,-82.247),
    33598:(27.715,-82.307),33602:(27.949,-82.457),33603:(27.968,-82.457),
    33604:(27.992,-82.457),33605:(27.956,-82.437),33606:(27.936,-82.466),
    33607:(27.963,-82.489),33609:(27.943,-82.499),33610:(27.987,-82.393),
    33611:(27.902,-82.497),33612:(28.025,-82.454),33613:(28.060,-82.454),
    33614:(28.010,-82.488),33615:(27.990,-82.558),33616:(27.873,-82.519),
    33617:(28.049,-82.384),33618:(28.063,-82.493),33619:(27.916,-82.408),
    33624:(28.077,-82.524),33625:(28.064,-82.565),33626:(28.047,-82.600),
    33629:(27.916,-82.511),33634:(27.998,-82.567),33635:(28.006,-82.601),
    33637:(28.063,-82.355),33647:(28.128,-82.349),33701:(27.771,-82.640),
    33702:(27.819,-82.643),33703:(27.836,-82.629),33704:(27.797,-82.647),
    33705:(27.755,-82.640),33706:(27.726,-82.737),33707:(27.741,-82.715),
    33708:(27.798,-82.804),33709:(27.818,-82.715),33710:(27.795,-82.715),
    33711:(27.736,-82.692),33712:(27.747,-82.668),33713:(27.793,-82.682),
    33714:(27.817,-82.678),33716:(27.840,-82.674),33755:(27.965,-82.800),
    33756:(27.951,-82.800),33759:(27.986,-82.767),33760:(27.916,-82.729),
    33761:(28.021,-82.764),33762:(27.896,-82.714),33763:(28.006,-82.752),
    33764:(27.952,-82.762),33765:(27.974,-82.762),33767:(27.973,-82.832),
    33770:(27.908,-82.788),33771:(27.911,-82.758),33772:(27.866,-82.796),
    33773:(27.878,-82.762),33774:(27.857,-82.814),33776:(27.841,-82.814),
    33777:(27.862,-82.758),33778:(27.876,-82.795),33781:(27.862,-82.699),
    33782:(27.855,-82.724),33785:(27.875,-82.843),33786:(27.894,-82.843),
    34677:(28.054,-82.688),34681:(28.094,-82.754),34683:(28.077,-82.734),
    34684:(28.087,-82.708),34685:(28.114,-82.690),34688:(28.150,-82.754),
    34689:(28.147,-82.768),34695:(28.002,-82.694),34698:(28.021,-82.780),
}

def addr_coords(addr, zc):
    bl,bo=ZIP_COORDS.get(int(zc),(27.9,-82.4))
    m=re.match(r'^(\d+)',str(addr)); hn=int(m.group(1)) if m else 500
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
