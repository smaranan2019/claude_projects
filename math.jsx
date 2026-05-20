import { useState, useEffect, useRef, useCallback } from "react";

// ─── constants ────────────────────────────────────────────────────────────────
const QUIZ_SECS = 30;
const BOARD_KEY = "mlab_board";   // short, safe key

// ─── game helpers ─────────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const GENS = {
  easy:   { add:()=>[rand(1,50),rand(1,50)],      sub:()=>{const b=rand(1,50),a=rand(b,99);return[a,b]},      mul:()=>[rand(2,9),rand(2,9)],      div:()=>{const b=rand(2,9),a=b*rand(2,9);return[a,b]}    },
  medium: { add:()=>[rand(50,500),rand(50,500)],   sub:()=>{const b=rand(50,500),a=rand(b,999);return[a,b]},   mul:()=>[rand(10,99),rand(2,9)],    div:()=>{const b=rand(2,12),a=b*rand(10,99);return[a,b]}  },
  hard:   { add:()=>[rand(100,999),rand(100,999)], sub:()=>{const b=rand(100,999),a=rand(b,1999);return[a,b]}, mul:()=>[rand(100,999),rand(10,99)], div:()=>{const b=rand(2,19),a=b*rand(20,99);return[a,b]}  },
};
const OPS=[{key:"add",sym:"+"},{key:"sub",sym:"−"},{key:"mul",sym:"×"},{key:"div",sym:"÷"}];
function makeQ(diff){
  const op=OPS[rand(0,3)];
  const [a,b]=GENS[diff][op.key]();
  const ans=op.key==="add"?a+b:op.key==="sub"?a-b:op.key==="mul"?a*b:Math.floor(a/b);
  return{a,b,op,answer:ans};
}

// ─── storage — dead simple read/write ────────────────────────────────────────
async function readBoard() {
  try {
    const r = await window.storage.get(BOARD_KEY, true);
    if (r && r.value) return JSON.parse(r.value);
    return [];
  } catch {
    return [];
  }
}

async function writeBoard(rows) {
  await window.storage.set(BOARD_KEY, JSON.stringify(rows), true);
}

async function addScore(name, diff, correct) {
  // Read existing
  let rows = await readBoard();

  // Each play gets its own entry — just append and sort by score desc
  rows.push({ name: name.trim(), diff, correct, ts: Date.now() });
  rows.sort((a, b) => b.correct - a.correct);
  rows = rows.slice(0, 200); // keep top 200

  await writeBoard(rows);
  return rows;
}

// ─── reset-time helper ────────────────────────────────────────────────────────
function msToReset(){
  const now=new Date(),r=new Date(now);
  r.setHours(16,34,0,0);
  if(r<=now)r.setDate(r.getDate()+1);
  return r-now;
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [name,   setName  ] = useState("");
  const [diff,   setDiff  ] = useState(null);
  const [q,      setQ     ] = useState(null);
  const [input,  setInput ] = useState("");
  const [secs,   setSecs  ] = useState(QUIZ_SECS);
  const [score,  setScore ] = useState({ correct:0, wrong:0, total:0 });
  const [flash,  setFlash ] = useState(null);
  const [board,  setBoard ] = useState([]);
  const [status, setStatus] = useState("idle");

  const scoreRef = useRef({ correct:0, wrong:0, total:0 });
  const nameRef  = useRef("");
  const diffRef  = useRef(null);
  const timerRef = useRef(null);
  const flashRef = useRef(null);
  const doneRef  = useRef(false);

  useEffect(()=>{ scoreRef.current = score; }, [score]);
  useEffect(()=>{ nameRef.current  = name;  }, [name]);
  useEffect(()=>{ diffRef.current  = diff;  }, [diff]);

  const fetchBoard = useCallback(async () => {
    const rows = await readBoard();
    setBoard(rows);
  }, []);

  useEffect(()=>{ fetchBoard(); }, [fetchBoard]);

  // ── end quiz ────────────────────────────────────────────────────────────────
  const endQuiz = useCallback(async () => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    clearTimeout(flashRef.current);

    // Capture everything NOW from refs before any state changes
    const finalCorrect = scoreRef.current.correct;
    const finalName    = nameRef.current;
    const finalDiff    = diffRef.current;

    setScreen("result");
    setStatus("saving");

    try {
      const updated = await addScore(finalName, finalDiff, finalCorrect);
      setBoard(updated);
      setStatus("saved");
    } catch (e) {
      console.error("Save failed:", e);
      setStatus("error");
    }
  }, []);

  const endRef = useRef(endQuiz);
  useEffect(()=>{ endRef.current = endQuiz; }, [endQuiz]);

  // ── countdown ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (screen !== "quiz") return;
    if (secs <= 0) { endRef.current(); return; }
    timerRef.current = setTimeout(() => setSecs(s => s-1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [screen, secs]);

  // ── start ───────────────────────────────────────────────────────────────────
  const startQuiz = () => {
    const fresh = { correct:0, wrong:0, total:0 };
    setScore(fresh);
    scoreRef.current = fresh;
    doneRef.current  = false;
    setInput(""); setFlash(null);
    setSecs(QUIZ_SECS);
    setQ(makeQ(diff));
    setStatus("idle");
    setScreen("quiz");
  };

  // ── submit ──────────────────────────────────────────────────────────────────
  const submit = useCallback(() => {
    if (!input.trim() || flash || !q) return;
    const val = parseInt(input, 10);
    if (isNaN(val)) return;
    const ok = val === q.answer;
    clearTimeout(flashRef.current);
    setFlash(ok ? "correct" : "wrong");
    setScore(s => {
      const next = { correct:s.correct+(ok?1:0), wrong:s.wrong+(ok?0:1), total:s.total+1 };
      scoreRef.current = next;
      return next;
    });
    setInput("");
    flashRef.current = setTimeout(() => {
      setFlash(null);
      setQ(makeQ(diffRef.current));
    }, 380);
  }, [input, flash, q]);

  // keyboard
  useEffect(()=>{
    if (screen !== "quiz") return;
    const h = (e) => {
      if (e.key === "Enter")     { submit(); return; }
      if (e.key === "Backspace") { setInput(s => s.slice(0,-1)); return; }
      if (/^\d$/.test(e.key))    setInput(s => s + e.key);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [screen, submit]);

  const numPress = (v) => {
    if (v === "⌫")    { setInput(s => s.slice(0,-1)); return; }
    if (v === "ENTER") { submit(); return; }
    setInput(s => s + v);
  };

  const pct  = secs / QUIZ_SECS * 100;
  const tCol = secs > 15 ? "#4ade80" : secs > 7 ? "#facc15" : "#f87171";
  const DC   = { easy:"#4ade80", medium:"#facc15", hard:"#f87171" };

  return (
    <div style={S.root}>
      <div style={S.glow}/>

      {/* ── HOME ─────────────────────────────────────────────────────────── */}
      {screen === "home" && <Page>
        <div style={S.logo}>∑</div>
        <div style={S.title}>MATHLAB</div>
        <div style={S.sub}>30-SECOND MENTAL MATH QUIZ</div>
        <div style={S.features}>
          {[["⚡","30 seconds · unlimited questions"],["🎯","Easy, Medium or Hard"],["🏆","Shared leaderboard · beat your friends"]].map(([ic,tx])=>(
            <div key={tx} style={S.featRow}><span>{ic}</span><span style={{color:"#94a3b8",fontSize:13}}>{tx}</span></div>
          ))}
        </div>
        <Btn onClick={()=>setScreen("name")}>Play →</Btn>
        <Ghost onClick={async()=>{ await fetchBoard(); setScreen("leaderboard"); }}>🏆 Leaderboard</Ghost>
      </Page>}

      {/* ── NAME ─────────────────────────────────────────────────────────── */}
      {screen === "name" && <Page>
        <Card>
          <div style={S.cardTitle}>What's your name?</div>
          <div style={{fontSize:12,color:"#64748b"}}>Shown on the leaderboard</div>
          <input style={S.inp} value={name}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&name.trim()&&setScreen("select")}
            placeholder="Enter name…" maxLength={20} autoFocus/>
          <div style={{display:"flex",gap:10}}>
            <Ghost onClick={()=>setScreen("home")} style={{flex:1}}>← Back</Ghost>
            <Btn onClick={()=>setScreen("select")} disabled={!name.trim()} style={{flex:2,opacity:name.trim()?1:0.4}}>Next →</Btn>
          </div>
        </Card>
      </Page>}

      {/* ── DIFFICULTY ───────────────────────────────────────────────────── */}
      {screen === "select" && <Page>
        <Back onClick={()=>setScreen("name")}/>
        <div style={S.cardTitle}>Hey {name}, pick a difficulty</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[
            {k:"easy",  col:"#4ade80", desc:"Single & double digit",      ex:"47+31 · 6×8 · 84÷4"},
            {k:"medium",col:"#facc15", desc:"Two & three digit numbers",  ex:"342+187 · 65×7"},
            {k:"hard",  col:"#f87171", desc:"3-digit × 2-digit & beyond", ex:"746×38 · 813−294"},
          ].map(d=>(
            <button key={d.k} onClick={()=>setDiff(d.k)}
              style={{...S.diffBtn, borderColor:d.col, background:diff===d.k?"#1a1a2e":"#0f1117"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:d.col,fontSize:18,fontWeight:700,letterSpacing:3}}>{d.k.toUpperCase()}</span>
                {diff===d.k && <span style={{color:d.col}}>✓</span>}
              </div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>{d.desc}</div>
              <div style={{fontSize:11,color:"#475569",marginTop:3,fontStyle:"italic"}}>{d.ex}</div>
            </button>
          ))}
        </div>
        <Btn onClick={startQuiz} disabled={!diff} style={{opacity:diff?1:0.4}}>Start 30s Quiz →</Btn>
      </Page>}

      {/* ── QUIZ ─────────────────────────────────────────────────────────── */}
      {screen === "quiz" && q && (
        <div style={S.screen}>
          <div style={S.quizWrap}>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:22,fontWeight:700,width:40,flexShrink:0,color:tCol}}>{secs}s</div>
              <div style={S.track}><div style={{...S.fill,width:`${pct}%`,background:tCol}}/></div>
              <div style={{fontSize:20,fontWeight:700,color:"#4ade80",width:54,textAlign:"right"}}>✓ {score.correct}</div>
            </div>

            <div style={{...S.qCard,
              borderColor:flash==="correct"?"#4ade80":flash==="wrong"?"#f87171":"#1e2333",
              background: flash==="correct"?"#052e16":flash==="wrong"?"#2d0707":"#0f1117"}}>
              <div style={{fontSize:10,letterSpacing:3,color:DC[diff]||"#475569",textTransform:"uppercase"}}>{diff}</div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
                <span style={S.qn}>{q.a}</span>
                <span style={S.qop}>{q.op.sym}</span>
                <span style={S.qn}>{q.b}</span>
                <span style={S.qop}>=</span>
                <span style={{...S.qn,color:input?"#facc15":"#334155"}}>{input||"?"}</span>
              </div>
              {flash && <div style={{fontSize:15,fontWeight:700,letterSpacing:2,
                color:flash==="correct"?"#4ade80":"#f87171"}}>
                {flash==="correct"?"✓ Correct!":`✗ Answer: ${q.answer}`}
              </div>}
            </div>

            <div style={S.numpad}>
              {["1","2","3","4","5","6","7","8","9","−","0","⌫"].map(k=>(
                <button key={k} style={S.numKey} onClick={()=>numPress(k)}>{k}</button>
              ))}
              <button style={{...S.numKey,...S.enterKey,gridColumn:"1/-1"}} onClick={()=>numPress("ENTER")}>
                ENTER ↵
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── RESULT ───────────────────────────────────────────────────────── */}
      {screen === "result" && (
        <Page>
          <Card>
            <div style={{fontSize:52,textAlign:"center"}}>{score.correct>=20?"🔥":score.correct>=10?"⚡":"💪"}</div>
            <div style={{fontSize:13,color:"#64748b",textAlign:"center",letterSpacing:2,textTransform:"uppercase"}}>{name}</div>
            <div style={{fontSize:80,fontWeight:700,color:"#facc15",textAlign:"center",lineHeight:1}}>{score.correct}</div>
            <div style={{fontSize:12,color:"#64748b",textAlign:"center",letterSpacing:2}}>correct in 30 seconds</div>
            <div style={{display:"flex",justifyContent:"space-around",padding:"12px 0",borderTop:"1px solid #1e2333"}}>
              <span style={{color:"#4ade80"}}>✓ {score.correct}</span>
              <span style={{color:"#f87171"}}>✗ {score.wrong}</span>
              <span style={{color:"#64748b"}}>{score.total} total</span>
            </div>
            <div style={{fontSize:13,textAlign:"center",padding:"4px 0",color:
              status==="saving"?"#64748b":status==="saved"?"#4ade80":"#f87171"}}>
              {status==="saving" && "⏳ Saving to leaderboard…"}
              {status==="saved"  && "✓ Score saved!"}
              {status==="error"  && "⚠ Save failed"}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:4}}>
              <Btn onClick={async()=>{ await fetchBoard(); setScreen("leaderboard"); }}>🏆 View Leaderboard</Btn>
              <Ghost onClick={()=>setScreen("select")}>Play Again</Ghost>
              <Ghost onClick={()=>setScreen("home")} style={{fontSize:12,color:"#475569"}}>Home</Ghost>
            </div>
          </Card>
        </Page>
      )}

      {/* ── LEADERBOARD ──────────────────────────────────────────────────── */}
      {screen === "leaderboard" && (
        <LeaderboardScreen board={board} onBack={()=>setScreen("home")} onRefresh={fetchBoard} DC={DC}/>
      )}
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function LeaderboardScreen({ board, onBack, onRefresh, DC }) {
  const [busy, setBusy]         = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(()=>{
    const tick=()=>{
      const ms=msToReset();
      setCountdown(`${Math.floor(ms/3600000)}h ${Math.floor(ms%3600000/60000)}m ${Math.floor(ms%60000/1000)}s`);
    };
    tick();
    const t=setInterval(tick,1000);
    return()=>clearInterval(t);
  },[]);

  const refresh = async () => { setBusy(true); await onRefresh(); setTimeout(()=>setBusy(false),500); };
  const medals  = ["🥇","🥈","🥉"];

  return (
    <div style={S.screen}>
      <div style={{width:"100%",maxWidth:440,display:"flex",flexDirection:"column",gap:14,paddingTop:12}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <Back onClick={onBack}/>
          <div style={{fontSize:20,fontWeight:700,color:"#facc15",letterSpacing:2}}>🏆 Leaderboard</div>
          <button style={{...S.backBtn,opacity:busy?0.4:1}} onClick={refresh}>{busy?"…":"↻"}</button>
        </div>

        <div style={{fontSize:11,color:"#475569",textAlign:"center",background:"#0f1117",
          border:"1px solid #1e2333",borderRadius:8,padding:"10px 14px",lineHeight:1.8}}>
          ⏱ Resets daily at <strong style={{color:"#94a3b8"}}>4:34 PM</strong>
          {" · "}Next reset in <strong style={{color:"#facc15"}}>{countdown}</strong>
        </div>

        {board.length === 0
          ? <div style={{textAlign:"center",color:"#475569",padding:"40px 0",fontSize:14}}>
              No scores yet — be first! 🚀
            </div>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {board.map((e, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", gap:12,
                  border:"1px solid", borderRadius:12, padding:"14px 16px",
                  background:i===0?"#1a1500":"#0f1117",
                  borderColor:i===0?"#854d0e":"#1e2333"}}>
                  {/* rank */}
                  <div style={{fontSize:20,width:28,flexShrink:0,textAlign:"center"}}>
                    {i<3 ? medals[i] : <span style={{color:"#475569",fontSize:13}}>#{i+1}</span>}
                  </div>
                  {/* name */}
                  <div style={{flex:1,fontSize:15,fontWeight:700,color:"#e2e8f0"}}>{e.name}</div>
                  {/* difficulty tag */}
                  <div style={{
                    fontSize:10, letterSpacing:1, fontWeight:700, padding:"3px 8px",
                    borderRadius:6, border:"1px solid",
                    color:DC[e.diff]||"#94a3b8", borderColor:DC[e.diff]||"#334155",
                    background:"#0a0a0f",
                  }}>
                    {e.diff?.toUpperCase()}
                  </div>
                  {/* score */}
                  <div style={{fontSize:24,fontWeight:700,color:"#facc15",width:44,textAlign:"right"}}>
                    {e.correct}
                  </div>
                </div>
              ))}
            </div>
        }

        <div style={{fontSize:10,color:"#334155",textAlign:"center"}}>
          Sorted by score · All plays recorded · Resets daily at 4:34 PM
        </div>
      </div>
    </div>
  );
}

// ─── shared components ────────────────────────────────────────────────────────
function Page({children}){
  return <div style={S.screen}><div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:14,paddingTop:20}}>{children}</div></div>;
}
function Card({children}){ return <div style={S.card}>{children}</div>; }
function Btn({children,onClick,disabled,style}){
  return <button style={{...S.btn,...style}} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Ghost({children,onClick,style}){
  return <button style={{...S.ghost,...style}} onClick={onClick}>{children}</button>;
}
function Back({onClick}){ return <button style={S.backBtn} onClick={onClick}>← Back</button>; }

// ─── styles ───────────────────────────────────────────────────────────────────
const S={
  root:{minHeight:"100vh",background:"#080810",color:"#e2e8f0",fontFamily:"'Courier New',Courier,monospace",position:"relative"},
  glow:{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"radial-gradient(ellipse at 20% 50%,#0d0d2b 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,#1a0a00 0%,transparent 50%)"},
  screen:{position:"relative",zIndex:1,minHeight:"100vh",display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"24px 16px 40px"},
  logo:{fontSize:64,color:"#facc15",lineHeight:1,textAlign:"center"},
  title:{fontSize:36,fontWeight:700,letterSpacing:6,color:"#facc15",textAlign:"center"},
  sub:{fontSize:11,letterSpacing:3,color:"#64748b",textAlign:"center",textTransform:"uppercase"},
  features:{display:"flex",flexDirection:"column",gap:8,margin:"8px 0"},
  featRow:{display:"flex",alignItems:"center",gap:12,background:"#0f1117",border:"1px solid #1e2333",borderRadius:10,padding:"12px 16px"},
  card:{background:"#0f1117",border:"1px solid #1e2333",borderRadius:16,padding:24,display:"flex",flexDirection:"column",gap:12},
  cardTitle:{fontSize:22,fontWeight:700,color:"#facc15",letterSpacing:2},
  inp:{background:"#080810",border:"1px solid #334155",borderRadius:10,color:"#f1f5f9",fontSize:20,padding:"14px 16px",fontFamily:"inherit",fontWeight:700,outline:"none",width:"100%",boxSizing:"border-box"},
  btn:{background:"#facc15",color:"#080810",border:"none",borderRadius:10,padding:"16px",fontSize:16,fontWeight:700,cursor:"pointer",letterSpacing:2,fontFamily:"inherit",width:"100%"},
  ghost:{background:"none",border:"1px solid #1e2333",color:"#94a3b8",borderRadius:10,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",width:"100%"},
  backBtn:{background:"none",border:"1px solid #1e2333",color:"#94a3b8",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:13,width:"fit-content"},
  diffBtn:{background:"#0f1117",border:"1px solid",borderRadius:12,padding:"16px",cursor:"pointer",color:"#e2e8f0",textAlign:"left",fontFamily:"inherit"},
  quizWrap:{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:16,paddingTop:12},
  track:{flex:1,height:8,background:"#1e2333",borderRadius:4,overflow:"hidden"},
  fill:{height:"100%",borderRadius:4,transition:"width 0.9s linear,background 0.3s"},
  qCard:{border:"2px solid",borderRadius:16,padding:"24px 20px",transition:"background 0.2s,border-color 0.2s",minHeight:145,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10},
  qn:{fontSize:44,fontWeight:700,color:"#f1f5f9"},
  qop:{fontSize:34,color:"#facc15",fontWeight:700},
  numpad:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10},
  numKey:{background:"#0f1117",border:"1px solid #1e2333",borderRadius:12,color:"#f1f5f9",fontSize:24,fontWeight:700,padding:"18px 8px",cursor:"pointer",fontFamily:"inherit",WebkitTapHighlightColor:"transparent"},
  enterKey:{background:"#facc15",color:"#080810",border:"none",fontSize:18,fontWeight:700,letterSpacing:2,padding:"18px",borderRadius:12},
};
