const express=require("express"),crypto=require("crypto"),fs=require("fs"),path=require("path");
const {createClient}=require("@libsql/client");
const SECRET=process.env.SECRET||"change-me",ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"admin123",PORT=process.env.PORT||3000;
const DATA=process.env.DATA_DIR||path.join(__dirname,"data");fs.mkdirSync(DATA,{recursive:true});
const db=createClient({url:process.env.TURSO_DATABASE_URL||"file:"+path.join(DATA,"saedni.db"),authToken:process.env.TURSO_AUTH_TOKEN});
const ready=db.executeMultiple(`CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY,name TEXT,username TEXT UNIQUE,salt TEXT,hash TEXT,phone TEXT,notes TEXT,photo TEXT,device TEXT);
CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,title TEXT,video TEXT,rel TEXT,sheet_txt TEXT,sheet_img TEXT);
CREATE TABLE IF NOT EXISTS easy(id INTEGER PRIMARY KEY,lesson_id INTEGER,q TEXT,choices TEXT,correct INTEGER);
CREATE TABLE IF NOT EXISTS subs(id INTEGER PRIMARY KEY,lesson_id INTEGER,student_id INTEGER,img TEXT,score REAL,corr TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY,at TEXT,text TEXT);`);
const all=async(s,...a)=>(await db.execute({sql:s,args:a})).rows.map(r=>({...r})),get=async(s,...a)=>(await await all(s,...a))[0],run=async(s,...a)=>({lastInsertRowid:Number((await db.execute({sql:s,args:a})).lastInsertRowid)});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sign=v=>crypto.createHmac("sha256",SECRET).update(v).digest("hex"),rid=n=>crypto.randomBytes(n).toString("hex");
const hashOf=(c,salt)=>crypto.scryptSync(c,salt,32).toString("hex");
const nowTxt=()=>new Date().toLocaleString("ar-EG",{timeZone:"Africa/Cairo",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const logEv=async t=>await run("INSERT INTO log(at,text) VALUES(?,?)",nowTxt(),t);
const fmt=x=>String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0");
async function notifyParent(s,text){await logEv(`رسالة لولي أمر ${s.name} (${s.phone}): ${text}`);
 if(process.env.SMS_WEBHOOK)try{await fetch(process.env.SMS_WEBHOOK,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({to:s.phone,text})});}catch(e){console.error("sms",e.message);}}
const img=v=>/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(v||"")&&v.length<900000?v:"";
const imgjs='document.addEventListener("change",e=>{const t=e.target,n=t.dataset&&t.dataset.t;if(!n||!t.files[0])return;const im=new Image();im.onload=()=>{const k=Math.min(1,1100/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=im.width*k;c.height=im.height*k;c.getContext("2d").drawImage(im,0,0,c.width,c.height);t.form.elements[n].value=c.toDataURL("image/jpeg",.7)};im.src=URL.createObjectURL(t.files[0])})';
const app=express();app.use(express.urlencoded({extended:true,limit:"3mb"}));
app.use((req,res,next)=>{const c=Object.fromEntries((req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>[x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
 req.ck=c;const[v,sg]=(c.s||"").split(".");req.u=v&&sg&&sg===sign(v)?{role:v.split(":")[0],id:+v.split(":")[1]}:null;next();});
const setCk=(res,k,v,age=31536000)=>res.append("Set-Cookie",`${k}=${v}; HttpOnly; Path=/; Max-Age=${age}; SameSite=Lax`);
const login=(res,v)=>setCk(res,"s",`${v}.${sign(v)}`);
const need=role=>(req,res,next)=>req.u?.role===role?next():res.redirect("/");
const css=`:root{--p:#c2185b;--bg:#fff5f8;--ink:#4a1d34;--line:#f5d0df}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 Tajawal,Tahoma,sans-serif}
header{background:linear-gradient(120deg,#e75a9a,#b3145a);color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}.logo{font:30px Pacifico,cursive;direction:ltr}header a{color:#fff;margin-inline-start:14px}
main{max-width:900px;margin:auto;padding:16px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;margin:0 0 12px}.row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
input,textarea,select{font:inherit;width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin:4px 0}button,.btn{font:inherit;background:var(--p);color:#fff;border:0;border-radius:8px;padding:8px 18px;cursor:pointer;text-decoration:none;display:inline-block}
.sec{background:#fff;color:var(--p);border:1px solid var(--p)}.muted{color:#8a5a73;font-size:14px}.ok{background:#e3f6ea;padding:8px 12px;border-radius:8px}.bad{background:#fee4e2;padding:8px 12px;border-radius:8px}img.s,video{max-width:100%;border-radius:10px}img.av{width:48px;height:48px;border-radius:50%;object-fit:cover}
pre{white-space:pre-wrap;background:#fff5f8;border:1px dashed var(--line);padding:10px;border-radius:10px;font:inherit}table{width:100%;border-collapse:collapse}td,th{text-align:right;padding:6px;border-bottom:1px solid var(--line)}
.stop{position:fixed;inset:0;background:rgba(74,18,54,.95);color:#fff;display:none;place-items:center;text-align:center;padding:24px;z-index:9}.bomb{font-size:21px;font-weight:800;border-radius:99px;padding:18px 30px;background:radial-gradient(circle at 30% 30%,#ff6b6b,#b3145a 60%,#5a0a2e);animation:p 1.4s infinite}@keyframes p{50%{transform:scale(1.07)}}@media(prefers-reduced-motion:reduce){.bomb{animation:none}}`;
const page=(t,b,nav="")=>`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&family=Pacifico&display=swap" rel="stylesheet"><style>${css}</style></head><body><header><span class="logo">Saedni</span><nav>${nav}</nav></header><main>${b}</main><script>${imgjs}</script></body></html>`;
const av=s=>s.photo?`<img class="av" src="${s.photo}" alt="">`:"";
// ---------- دخول ----------
app.get("/",async(req,res)=>res.redirect(req.u?.role==="a"?"/admin":req.u?.role==="s"?"/me":"/login"));
app.get("/login",async(req,res)=>res.send(page("دخول",`<div class="card"><h2>تسجيل الدخول</h2>${req.query.e?'<p class="bad">البيانات غلط، أو الحساب مفتوح على جهاز تاني.</p>':""}<form method="post" action="/login"><input name="u" placeholder="اسم المستخدم" autocomplete="username" required><input name="p" type="password" placeholder="الرقم السري" autocomplete="current-password" required><button>دخول</button></form></div>`)));
app.post("/login",async(req,res)=>{const{u,p}=req.body;
 if(u==="admin"&&p===ADMIN_PASSWORD){login(res,"a:0");return res.redirect("/admin");}
 const s=await get("SELECT * FROM students WHERE username=?",String(u||"").trim());
 if(!s||hashOf(String(p||""),s.salt)!==s.hash)return res.redirect("/login?e=1");
 let d=req.ck.d;if(s.device&&s.device!==d)return res.redirect("/login?e=1"); // جهاز واحد فقط
 if(!s.device){d=d||rid(16);await run("UPDATE students SET device=? WHERE id=?",d,s.id);setCk(res,"d",d,315360000);}
 login(res,"s:"+s.id);res.redirect("/me");});
app.get("/logout",async(req,res)=>{setCk(res,"s","",0);res.redirect("/login");});
// ---------- محمد ----------
const aNav='<a href="/admin">الرئيسية</a><a href="/logout">خروج</a>';
app.get("/admin",need("a"),async(req,res)=>{const ss=await all("SELECT * FROM students ORDER BY id DESC"),ls=await all("SELECT * FROM lessons ORDER BY id"),lg=await all("SELECT * FROM log ORDER BY id DESC LIMIT 40");
 res.send(page("لوحة محمد",`<div class="card"><b>نشاط الطلاب</b>${lg.map(x=>`<div><span class="muted">${esc(x.at)}</span> ${esc(x.text)}</div>`).join("")||'<div class="muted">لسه مفيش نشاط.</div>'}</div>
<div class="card"><b>الدروس</b>${ls.map(l=>`<div class="row"><span>${esc(l.title)}</span><a class="btn sec" href="/admin/lesson/${l.id}">إدارة</a></div>`).join("")}<form method="post" action="/admin/lesson"><input name="title" placeholder="عنوان درس جديد" required><button>أضف درس</button></form></div>
<div class="card"><b>إضافة طالب</b><form method="post" action="/admin/student"><input name="name" placeholder="اسم الطالب" required><input name="phone" placeholder="رقم ولي الأمر" required><textarea name="notes" placeholder="ملاحظات وبيانات عن الطالب"></textarea><label class="muted">صورة الطالب</label><input type="file" data-t="photo" accept="image/*"><input type="hidden" name="photo"><button>أضف الطالب</button></form></div>
<div class="card"><b>الطلاب</b><table>${ss.map(s=>`<tr><td>${av(s)}</td><td>${esc(s.name)}<div class="muted">${esc(s.notes)}</div></td><td dir="ltr">${esc(s.phone)}</td><td>${esc(s.username)}</td><td><form method="post" action="/admin/student/${s.id}/reset"><button class="sec">رقم سري جديد وفك الجهاز</button></form></td></tr>`).join("")}</table></div>`,aNav));});
app.post("/admin/student",need("a"),async(req,res)=>{const{name,phone,notes}=req.body,un="s"+Math.floor(1000+Math.random()*9000),code=String(Math.floor(100000+Math.random()*900000)),salt=rid(8);
 try{await run("INSERT INTO students(name,username,salt,hash,phone,notes,photo) VALUES(?,?,?,?,?,?,?)",name,un,salt,hashOf(code,salt),phone,notes||"",img(req.body.photo));}catch{return res.redirect("/admin");}
 res.send(page("بيانات الدخول",`<div class="card"><h2>اتضاف ${esc(name)}</h2><p>ادّيله البيانات دي. الرقم السري بيظهر مرة واحدة بس.</p><p>اسم المستخدم: <b dir="ltr">${un}</b><br>الرقم السري: <b dir="ltr">${code}</b></p><a class="btn" href="/admin">رجوع</a></div>`,aNav));});
app.post("/admin/student/:id/reset",need("a"),async(req,res)=>{const code=String(Math.floor(100000+Math.random()*900000)),salt=rid(8),s=await get("SELECT * FROM students WHERE id=?",+req.params.id);if(!s)return res.redirect("/admin");
 await run("UPDATE students SET salt=?,hash=?,device=NULL WHERE id=?",salt,hashOf(code,salt),s.id);
 res.send(page("رقم جديد",`<div class="card"><h2>${esc(s.name)}</h2><p>اسم المستخدم: <b dir="ltr">${esc(s.username)}</b><br>الرقم السري الجديد: <b dir="ltr">${code}</b></p><a class="btn" href="/admin">رجوع</a></div>`,aNav));});
app.post("/admin/lesson",need("a"),async(req,res)=>{const r=await run("INSERT INTO lessons(title,rel,sheet_txt) VALUES(?,?,?)",req.body.title,new Date().toISOString().slice(0,16),"");res.redirect("/admin/lesson/"+r.lastInsertRowid);});
app.get("/admin/lesson/:id",need("a"),async(req,res)=>{const l=await get("SELECT * FROM lessons WHERE id=?",+req.params.id);if(!l)return res.redirect("/admin");
 const es=await all("SELECT * FROM easy WHERE lesson_id=?",l.id),rk=await all("SELECT subs.*,students.name,students.photo FROM subs JOIN students ON students.id=student_id WHERE lesson_id=? ORDER BY score IS NULL,score DESC",l.id);
 res.send(page(l.title,`<div class="card"><form method="post" action="/admin/lesson/${l.id}"><b>الدرس</b><input name="title" value="${esc(l.title)}"><label class="muted">موعد نزول الدرس للطلاب</label><input type="datetime-local" name="rel" value="${esc(l.rel)}"><label class="muted">رابط الفيديو على يوتيوب (يفضّل غير مُدرج)</label><input name="video" value="${esc(l.video)}" placeholder="https://youtu.be/..."><label class="muted">الشيت: صورة الأسئلة</label><input type="file" data-t="sheet_img" accept="image/*"><input type="hidden" name="sheet_img">${l.sheet_img?`<img class="s" src="${l.sheet_img}">`:""}<label class="muted">نص الشيت</label><textarea name="sheet_txt">${esc(l.sheet_txt)}</textarea><button>احفظ</button></form></div>
<div class="card"><b>أسئلة التاسك السهل</b>${es.map(e=>`<div class="row"><span>${esc(e.q)} <span class="muted">(${JSON.parse(e.choices).map(esc).join(" / ")}، الصحيح ${e.correct+1})</span></span><form method="post" action="/admin/easy/${e.id}/delete"><button class="sec">حذف</button></form></div>`).join("")}
<form method="post" action="/admin/lesson/${l.id}/easy"><input name="q" placeholder="السؤال" required><textarea name="choices" placeholder="الاختيارات، كل اختيار في سطر" required></textarea><input name="correct" type="number" min="1" placeholder="رقم الاختيار الصحيح" required><button>أضف</button></form></div>
<div class="card"><b>حلول الطلاب (من الأعلى للأقل)</b>${rk.map((s,i)=>`<div class="card"><div class="row"><b>${i+1}) ${av(s)} ${esc(s.name)}</b><span>${s.score==null?"لسه ما اتصححش":s.score+" من 10"}</span></div>${s.img?`<img class="s" src="${s.img}">`:""}<form method="post" action="/admin/grade/${s.id}"><input name="score" type="number" step="0.5" min="0" max="10" value="${s.score??""}" placeholder="الدرجة من 10" required><input name="corr" value="${esc(s.corr)}" placeholder="تصحيحك وملاحظاتك"><button>احفظ التصحيح</button></form></div>`).join("")||'<div class="muted">لسه محدش سلّم.</div>'}</div>`,aNav));});
app.post("/admin/lesson/:id",need("a"),async(req,res)=>{const id=+req.params.id,b=req.body,yt=/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(b.video||"")?b.video:"";
 await run("UPDATE lessons SET title=?,rel=?,sheet_txt=?,video=? WHERE id=?",b.title,b.rel,b.sheet_txt||"",yt,id);
 if(img(b.sheet_img))await run("UPDATE lessons SET sheet_img=? WHERE id=?",img(b.sheet_img),id);res.redirect("/admin/lesson/"+id);});
app.post("/admin/lesson/:id/easy",need("a"),async(req,res)=>{const ch=req.body.choices.split("\n").map(x=>x.trim()).filter(Boolean),k=parseInt(req.body.correct)-1;
 if(ch.length>1&&k>=0&&k<ch.length)await run("INSERT INTO easy(lesson_id,q,choices,correct) VALUES(?,?,?,?)",+req.params.id,req.body.q,JSON.stringify(ch),k);res.redirect("/admin/lesson/"+req.params.id);});
app.post("/admin/easy/:id/delete",need("a"),async(req,res)=>{const e=await get("SELECT * FROM easy WHERE id=?",+req.params.id);await run("DELETE FROM easy WHERE id=?",+req.params.id);res.redirect("/admin/lesson/"+(e?.lesson_id||""));});
app.post("/admin/grade/:id",need("a"),async(req,res)=>{const sub=await get("SELECT * FROM subs WHERE id=?",+req.params.id);if(!sub)return res.redirect("/admin");
 const sc=Math.min(10,Math.max(0,parseFloat(req.body.score)||0));await run("UPDATE subs SET score=?,corr=? WHERE id=?",sc,req.body.corr||"",sub.id);
 const s=await get("SELECT * FROM students WHERE id=?",sub.student_id),l=await get("SELECT * FROM lessons WHERE id=?",sub.lesson_id);
 await notifyParent(s,`درجة ${s.name} في ${l.title}: ${sc} من 10`);if(sc<6)await logEv(`تنبيه: ${s.name} جاب أقل من 6 من 10 (${sc}) في ${l.title}`);res.redirect("/admin/lesson/"+sub.lesson_id);});
// ---------- الطالبة ----------
const sNav='<a href="/me">الدروس</a><a href="/folder">شيتاتي واجاباتي</a><a href="/logout">خروج</a>';
const stu=async(req,res,next)=>{const s=await get("SELECT * FROM students WHERE id=?",req.u.id);if(!s||(s.device&&s.device!==req.ck.d)){setCk(res,"s","",0);return res.redirect("/login?e=1");}req.s=s;next();};
const out=l=>!l.rel||new Date(l.rel)<=new Date();
app.get("/me",need("s"),stu,async(req,res)=>{const ls=await all("SELECT * FROM lessons ORDER BY id"),done=new Set((await all("SELECT lesson_id FROM subs WHERE student_id=?",req.s.id)).map(x=>x.lesson_id));
 res.send(page("الدروس",`<h2>${av(req.s)} أهلاً يا ${esc(req.s.name)} 🌸</h2>${req.query.ok?'<p class="ok">اتسلّم حلك وهيوصل لمحمد 🌸</p>':""}${ls.map(l=>{const d=done.has(l.id);
 return `<div class="card row"><div><b>${esc(l.title)}</b><div class="muted">${d?"اتسلّم الحل ✓":out(l)?"متاح":"قريباً"}</div></div>${out(l)?`<a class="btn" href="/lesson/${l.id}">افتحي الدرس</a>`:""}</div>`}).join("")||'<div class="card muted">لسه مفيش دروس.</div>'}`,sNav));});
app.get("/lesson/:id",need("s"),stu,async(req,res)=>{const l=await get("SELECT * FROM lessons WHERE id=?",+req.params.id);if(!l||!out(l))return res.redirect("/me");
 const es=await all("SELECT * FROM easy WHERE lesson_id=?",l.id),p=req.query.p;await logEv(`${req.s.name} فتحت ${l.title}`);
 const sheet=`${l.sheet_img?`<img class="s" src="${l.sheet_img}">`:""}${l.sheet_txt?`<pre>${esc(l.sheet_txt)}</pre>`:""}`;
 res.send(page(l.title,`<h2>${esc(l.title)}</h2><div class="card">${l.video?`<a class="btn" href="/go/${l.id}" target="_blank" rel="noopener">شوفي الفيديو على يوتيوب ▶</a>`:'<p class="muted">محمد لسه ما حطش الفيديو.</p>'}</div>
${p?`<div class="card" style="text-align:center"><h2>برافو، خلصتي التاسك 📚</h2><button id="st">روحي ذاكري الدرس</button></div><div class="stop" id="ov"><div><h2>الموقع واقف دلوقتي</h2><p>ذاكري الدرس براحتك. لما تخلصي دوسي على الزرار.</p><button class="bomb" id="bm">ذاكرت الدرس، يلا على الاختبار 💣</button></div></div>
<div class="card" id="sh" style="display:none"><b>شيت الدرس</b><p class="muted">حليه على ورقة بره الموقع، وبعدين صوّري الحل وارفعيه.</p>${sheet}<form method="post" action="/lesson/${l.id}/submit"><input type="file" data-t="img" accept="image/*" required><input type="hidden" name="img"><button>سلّمي الحل</button></form></div>
<script>st.onclick=()=>ov.style.display="grid";bm.onclick=()=>{ov.style.display="none";st.parentNode.style.display="none";sh.style.display="block"}</script>`
 :`<div class="card"><b>تاسك سهل من الشرح</b>${req.query.f?'<p class="bad">في إجابات غلط. ارجعي للفيديو وجربي تاني.</p>':""}<form method="post" action="/lesson/${l.id}/easy">${es.map((e,i)=>`<div><b>${i+1})</b> ${esc(e.q)}${JSON.parse(e.choices).map((c,j)=>`<label style="display:block"><input type="radio" style="width:auto" name="e${e.id}" value="${j}" required> ${esc(c)}</label>`).join("")}</div>`).join("")||'<p class="muted">مفيش أسئلة لسه.</p>'}<button>تأكدي من إجاباتي</button></form></div>`}`,sNav));});
app.get("/go/:id",need("s"),stu,async(req,res)=>{const l=await get("SELECT * FROM lessons WHERE id=?",+req.params.id);if(!l||!l.video||!out(l))return res.redirect("/me");await logEv(`${req.s.name} دخلت على فيديو «${l.title}»`);res.redirect(l.video);});
app.post("/lesson/:id/easy",need("s"),stu,async(req,res)=>{const l=await get("SELECT * FROM lessons WHERE id=?",+req.params.id),es=await all("SELECT * FROM easy WHERE lesson_id=?",+req.params.id);if(!l)return res.redirect("/me");
 const n=es.filter(e=>String(req.body["e"+e.id])===String(e.correct)).length;
 if(n<es.length){await logEv(`${req.s.name} حاولت التاسك السهل في «${l.title}» ومعرفتش تحله (جابت ${n} من ${es.length})`);return res.redirect(`/lesson/${l.id}?f=1`);}
 await logEv(`${req.s.name} حلّت الأسئلة السهلة في «${l.title}»`);res.redirect(`/lesson/${l.id}?p=1`);});
app.post("/lesson/:id/submit",need("s"),stu,async(req,res)=>{const l=await get("SELECT * FROM lessons WHERE id=?",+req.params.id),im=img(req.body.img);if(!l||!im)return res.redirect("/me");
 await run("DELETE FROM subs WHERE lesson_id=? AND student_id=?",l.id,req.s.id);await run("INSERT INTO subs(lesson_id,student_id,img,at) VALUES(?,?,?,?)",l.id,req.s.id,im,nowTxt());
 await logEv(`${req.s.name} سلّمت حل شيت «${l.title}»`);res.redirect("/me?ok=1");});
app.get("/folder",need("s"),stu,async(req,res)=>{const ls=await all("SELECT lessons.*,subs.img AS simg,subs.score,subs.corr,subs.id AS sid FROM subs JOIN lessons ON lessons.id=lesson_id WHERE student_id=?",req.s.id);const rk={};for(const l of ls)rk[l.id]=(await all("SELECT id FROM subs WHERE lesson_id=? AND score IS NOT NULL ORDER BY score DESC",l.id)).map(x=>x.id);
 res.send(page("شيتاتي واجاباتي",`<h2>📁 شيتاتي واجاباتي</h2>${ls.map(l=>{const g=rk[l.id],r=g.indexOf(l.sid)+1;
 return `<div class="card"><b>${esc(l.title)}</b><p class="muted">الشيت</p>${l.sheet_img?`<img class="s" src="${l.sheet_img}">`:""}${l.sheet_txt?`<pre>${esc(l.sheet_txt)}</pre>`:""}<p class="muted">حلّك</p><img class="s" src="${l.simg}">${l.score==null?'<p class="ok">مستنية تصحيح محمد.</p>':`<p class="ok">تصحيح محمد: ${esc(l.corr)||"-"}<br><b>درجتك: ${l.score} من 10</b><br>ترتيبك: ${r} من ${g.length} في الدفعة</p>`}</div>`}).join("")||'<div class="card muted">لسه ما سلّمتيش أي شيت.</div>'}`,sNav));});
ready.then(()=>app.listen(PORT,()=>console.log("Saedni on :"+PORT)));
