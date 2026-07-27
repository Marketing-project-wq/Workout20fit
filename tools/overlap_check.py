#!/usr/bin/env python3
"""
20FIT program overlap checker.

Run BEFORE publishing catalog changes. It flags:
  1. Program pairs whose exercise sets overlap above a threshold
     (overlap coefficient = |A n B| / min(|A|,|B|)). Guideline: adjacent-
     theme programs should overlap <= ~30%.
  2. Programs with low movement-pattern variety (one pattern dominates).

Usage:  python3 tools/overlap_check.py ["Workout 20FIT (1).html"] [--threshold 0.30]
Exit code is non-zero if any pair exceeds the threshold (handy for CI/pre-publish).
"""
import re, json, sys, os

def load_template(path):
    d = open(path, encoding="utf-8").read()
    m = re.search(r'<script type="__bundler/template">(.*?)</script>', d, re.S)
    return json.loads(m.group(1))

def match(s, i, o, c):
    depth = 0; q = None; esc = False
    while i < len(s):
        ch = s[i]
        if q:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == q: q = None
        else:
            if ch in "'\"": q = ch
            elif ch == o: depth += 1
            elif ch == c:
                depth -= 1
                if depth == 0: return i
        i += 1
    return -1

def parse(path):
    t = load_template(path)
    # programs: id -> (name, jenis, tujuan[])
    pi = t.find("_programsSrc=["); ao = t.find("[", pi); ae = match(t, ao, "[", "]")
    pb = t[ao:ae + 1]
    progs = {}
    order = []
    kk = 0
    while kk < len(pb):
        if pb[kk] == "{":
            e = match(pb, kk, "{", "}"); obj = pb[kk:e + 1]; kk = e + 1
            pid = re.search(r"id:'(p\d+)'", obj).group(1)
            name = (re.search(r"name:('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", obj).group(1))[1:-1]
            jenis = (re.search(r"jenis:'([^']*)'", obj) or [None, ""])
            jenis = jenis.group(1) if hasattr(jenis, "group") else ""
            tuj = re.search(r"tujuan:\[([^\]]*)\]", obj)
            tuj = [x.replace("'", "").strip() for x in (tuj.group(1).split(",") if tuj else []) if x.strip()]
            progs[pid] = {"name": name, "jenis": jenis, "tujuan": tuj}
            order.append(pid)
        else:
            kk += 1
    # wp: pid -> list of (exercise name, movementPattern)
    wi = t.find("_wpSrc="); wbo = t.find("{", wi); wbe = match(t, wbo, "{", "}")
    wb = t[wbo:wbe + 1]
    ex = {}
    for pm in re.finditer(r"(p\d+):\s*\[", wb):
        pid = pm.group(1); a2 = wb.find("[", pm.start()); e2 = match(wb, a2, "[", "]")
        arr = wb[a2 + 1:e2]; items = []; z = 0
        while z < len(arr):
            if arr[z] == "{":
                e = match(arr, z, "{", "}"); lit = arr[z:e + 1]; z = e + 1
                nm = (re.search(r"name:('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")", lit).group(1))[1:-1]
                mpm = re.search(r"movementPattern:'([^']*)'", lit)
                items.append((nm, mpm.group(1) if mpm else "?"))
            else:
                z += 1
        ex[pid] = items
    return progs, ex, order

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = args[0] if args else "Workout 20FIT (1).html"
    if not os.path.exists(path):
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(here, "Workout 20FIT (1).html")
    thr = 0.30
    if "--threshold" in sys.argv:
        thr = float(sys.argv[sys.argv.index("--threshold") + 1])

    progs, ex, order = parse(path)
    names = {pid: set(n for n, _ in ex.get(pid, [])) for pid in order}

    print("20FIT overlap checker — %d programs, threshold %.0f%%\n" % (len(order), thr * 100))

    # 1) pairwise overlap (same jenis prioritised, but check all)
    flagged = []
    for i in range(len(order)):
        for j in range(i + 1, len(order)):
            a, b = order[i], order[j]
            A, B = names[a], names[b]
            if not A or not B: continue
            inter = len(A & B); coef = inter / min(len(A), len(B))
            if coef > thr:
                same = progs[a]["jenis"] == progs[b]["jenis"]
                flagged.append((coef, a, b, inter, min(len(A), len(B)), same))
    flagged.sort(reverse=True)
    print("== PAIRS OVER THRESHOLD: %d ==" % len(flagged))
    for coef, a, b, inter, mn, same in flagged[:40]:
        print("  %5.0f%%  %s (%s) x %s (%s)  [%d/%d shared]%s"
              % (coef * 100, progs[a]["name"], progs[a]["jenis"],
                 progs[b]["name"], progs[b]["jenis"], inter, mn,
                 "  SAME-JENIS" if same else ""))
    if len(flagged) > 40:
        print("  ... and %d more" % (len(flagged) - 40))

    # 2) within-program movement-pattern variety
    print("\n== LOW MOVEMENT-PATTERN VARIETY (one pattern > 50%% of a program) ==")
    lowvar = 0
    for pid in order:
        items = ex.get(pid, [])
        if not items: continue
        pats = {}
        for _, mp in items:
            pats[mp] = pats.get(mp, 0) + 1
        top = max(pats.values()) / len(items)
        if top > 0.5:
            dom = max(pats, key=pats.get)
            print("  %s (%s): %.0f%% '%s'  [%s]"
                  % (progs[pid]["name"], progs[pid]["jenis"], top * 100, dom,
                     ", ".join("%s:%d" % (k, v) for k, v in sorted(pats.items(), key=lambda x: -x[1]))))
            lowvar += 1
    if not lowvar:
        print("  none")

    print("\nSummary: %d pair(s) over %.0f%% overlap, %d program(s) low variety."
          % (len(flagged), thr * 100, lowvar))
    sys.exit(1 if flagged else 0)

if __name__ == "__main__":
    main()
