"""Regenerate preview.html (single double-clickable file with data inlined)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
html = open("index.html", encoding="utf-8").read()
css  = open("styles.css", encoding="utf-8").read()
js   = open("app.js", encoding="utf-8").read()
jobs = open("data/jobs.json", encoding="utf-8").read()
filt = open("data/filters.json", encoding="utf-8").read()
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', "")
js = js.replace('load();',
  'JOBS=window.__J__.jobs||[];window.__GEN__=window.__J__.generated_at;window.__PROFILE__=window.__J__.profile;DEF=Object.assign(DEF,window.__F__);render();')
js = js.replace('if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }', "")
inj = "<script>window.__J__=" + jobs + ";window.__F__=" + filt + ";</script>\n<script>\n" + js + "\n</script>"
html = html.replace('<script src="app.js"></script>', inj)
open("preview.html", "w", encoding="utf-8").write(html)
print("preview.html rebuilt:", len(html), "bytes")
