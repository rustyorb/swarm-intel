import json, sys, time, os, urllib.request, re
BASE="http://localhost:3369"
RUNS=r"C:\_PROJECTS\swarm-intel\runs"
topic="Best open-weight LLM under 14B parameters for tool-calling on a single 24GB GPU as of this month"
settings={"modelMapping":{
  "orchestrator":{"provider":"anthropic","model":"claude-sonnet-5-5"},
  "agent":{"provider":"anthropic","model":"claude-haiku-5-5"},
  "synthesis":{"provider":"anthropic","model":"claude-sonnet-5-5"}}}
config={"agentCount":3,"depth":"recon","conditionDirective":True}
def post_json(path, body, timeout=900):
    req=urllib.request.Request(BASE+path, data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode("utf-8"))
def post_sse(path, body, timeout=1800):
    req=urllib.request.Request(BASE+path, data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
    text=""; ground=[]; err=None
    with urllib.request.urlopen(req, timeout=timeout) as r:
        for raw in r:
            line=raw.decode("utf-8","ignore").strip()
            if not line.startswith("data: "): continue
            try: ev=json.loads(line[6:])
            except Exception: continue
            t=ev.get("type")
            if t=="chunk": text+=ev.get("text","")
            elif t=="grounding": ground.append(f'{ev.get("mode")}: {ev.get("detail","")[:90]}')
            elif t=="error": err=ev.get("error"); break
            elif t=="done":
                if ev.get("text"): text=ev["text"]
                break
    return text, ground, err
runs_before=len([d for d in os.listdir(RUNS) if os.path.isdir(os.path.join(RUNS,d))])
t0=time.time()
init=post_json("/api/research/initiate", {"topic":topic,"settings":settings,"config":config})
directive=init.get("directive",""); eff=directive or topic
print(f"[initiate] {time.time()-t0:.0f}s agents={len(init['agents'])} directive_words={len(directive.split())} headers={[l for l in directive.splitlines() if l.startswith('# ')][:12]}".encode("ascii","replace").decode())
reports=[]
for a in init["agents"]:
    t1=time.time()
    text,ground,err=post_sse("/api/research/agent-run-stream", {"topic":eff,"rawTopic":topic,"agent":a,"settings":settings,"config":config})
    w=len(text.split())
    print(f"[agent] {a['name'][:24]:24} {time.time()-t1:.0f}s words={w} err={err} trunc={'OUTPUT TRUNCATED' in text} degen={'OUTPUT ENDED EARLY' in text} | {' | '.join(ground)}".encode("ascii","replace").decode())
    if text.strip(): reports.append({"agentName":a["name"],"agentRole":a["role"],"report":text})
t2=time.time()
syn,_,err=post_sse("/api/research/synthesize-stream", {"topic":eff,"rawTopic":topic,"reports":reports,"settings":settings,"config":config,"critiques":[],"catalyticTerms":[]})
runs_after=len([d for d in os.listdir(RUNS) if os.path.isdir(os.path.join(RUNS,d))])
print(f"[synthesis] {time.time()-t2:.0f}s words={len(syn.split())} err={err} trunc={'OUTPUT TRUNCATED' in syn} degen={'OUTPUT ENDED EARLY' in syn} runs_dirs +{runs_after-runs_before}")
print("[synthesis headers]", [l[:60] for l in syn.splitlines() if l.startswith('## ')][:12])
i=syn.find("## 1."); print("[synthesis opening]", syn[i:i+700].encode("ascii","replace").decode())
print(f"[total] {time.time()-t0:.0f}s")
