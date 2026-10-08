import json, sys, time, urllib.request
BASE="http://localhost:3369"
import os
provider=sys.argv[1]; model=sys.argv[2]; depth=sys.argv[3] if len(sys.argv)>3 else "recon"
policy=sys.argv[4] if len(sys.argv)>4 else None; fringe=(sys.argv[5].lower()=="fringe") if len(sys.argv)>5 else False
topic=os.environ.get("PROBE_TOPIC") or "Best practices for keeping a sourdough starter alive during a two-week vacation"
body={
 "topic": topic, "rawTopic": topic,
 "agent": {"id":"probe-1","name":os.environ.get("PROBE_NAME") or "Probe Agent","role":os.environ.get("PROBE_ROLE") or "Home Fermentation Specialist",
           "investigativeAngle":os.environ.get("PROBE_ANGLE") or "Find the concrete, tested methods (refrigeration, drying, freezing, feeding ratios) home bakers use to pause a starter for 14 days and revive it, with sources."},
 "settings": {"modelMapping": {"agent": {"provider": provider, "model": model}}},
 "config": {"depth": depth, "agentCount": 3, **({"fringeMode": True} if fringe else {}), **({"evidencePolicy": policy} if policy else {})}
}
req=urllib.request.Request(BASE+"/api/research/agent-run-stream", data=json.dumps(body).encode(), headers={"Content-Type":"application/json"})
t0=time.time(); text=""; grounding=[]; stages=[]; err=None; done=False
with urllib.request.urlopen(req, timeout=900) as r:
    for raw in r:
        line=raw.decode("utf-8","ignore").strip()
        if not line.startswith("data: "): continue
        try: ev=json.loads(line[6:])
        except Exception: continue
        t=ev.get("type")
        if t=="chunk": text+=ev.get("text","")
        elif t=="grounding": grounding.append(f'{ev.get("mode")}: {ev.get("detail","")[:140]}')
        elif t=="stage": stages.append(f'{time.time()-t0:5.1f}s {ev.get("stage")}' + (f' wave={ev["wave"]}' if "wave" in ev else "") + (f' pages={ev["pages"]}' if "pages" in ev else "") + (f' hits={ev["hits"]}' if "hits" in ev else ""))
        elif t=="error": err=ev.get("error"); break
        elif t=="done": done=True; break
dt=time.time()-t0
words=len(text.split()); ws=sum(c.isspace() for c in text)*100//max(len(text),1)
print(f"provider={provider} model={model} depth={depth} policy={policy} fringe={fringe}")
print("scored-under stamps:", text.count("scored under"), "| custody-style scores:", len(__import__("re").findall(r"(?:10|[0-9])/10", text)))
print(f"done={done} error={err} seconds={dt:.0f}")
print(f"words={words} whitespace={ws}% truncated={'OUTPUT TRUNCATED' in text} degenerate={'OUTPUT ENDED EARLY' in text}")
for st in stages: print("  stage:", st)
for g in grounding: print("  grounding:", g.encode("ascii","replace").decode())
print("--- head ---"); print(text[:500].encode("ascii","replace").decode())
print("--- tail ---"); print(text[-300:].encode("ascii","replace").decode())
