# PáircVision — Automated Game Analysis: Research & Legal Audit

_Prepared 2026-07-23. Scope: what you can legally use to build an "upload a game → auto-breakdown of where it was won/lost, formation & tactics" feature, for personal analysis use._

---

## 1. Where PáircVision is today (and the gap)

PáircVision is currently a **manual, human-in-the-loop** logging and review app:

- Live event logging (kickouts, turnovers, shots), HT/FT, FOR/OPP + segment review, filters,
  Match Pack sharing, PNG/PDF export (`src/stats`, `src/tactical`, `src/rapid-capture`, `src/pro-tagger`).
- Stack: React 19 + PixiJS 8 + jsPDF, Vite PWA, TypeScript. No backend, no video pipeline.
- There is a `vision-training` module, but it is **coaching/attendance session tracking**, not computer vision.

**The gap:** "upload a game and the app analyses it" requires three capabilities you don't have yet:

1. **Video ingestion** (a file, not live taps).
2. **Perception** — detect/track players & ball, read the pitch, recognise events.
3. **Reasoning** — turn tracked positions + events into "who won the kickout battle", "what formation",
   "where momentum swung".

There is no off-the-shelf GAA model that does this. Everything mature is built for **soccer**, and GAA
(15-a-side, larger pitch, different markings, kickouts/handpasses) needs its own training data. That is the
core finding: the building blocks are free, but the **GAA-specific perception model does not exist and you'd
have to create it** (or lean on a general multimodal LLM — see Route B).

---

## 2. Legal landscape — three separate questions

Keep these distinct; people conflate them:

### 2a. Software/model licences (can you use the code?)

| Component | Licence | Personal-use verdict |
|---|---|---|
| **Ultralytics YOLO** (v8 / 11 / 26) — player/ball detection, pose, keypoints | **AGPL-3.0** | ✅ Free for personal, private, research use. Obligation only triggers on **distribution or hosting a network service for others** — then you'd have to open-source your whole app under AGPL, or buy an Ultralytics Enterprise licence. Purely local, just-for-you = fine. |
| **Roboflow `supervision`** (annotation, ByteTrack tracking, homography helpers) | **MIT** | ✅ Fully free, incl. commercial. No strings. |
| **ByteTrack / BoT-SORT** trackers | MIT | ✅ Free. |
| **OpenCV** (video decode, homography, warping) | Apache-2.0 | ✅ Free. |
| **PyTorch, NumPy** | BSD | ✅ Free. |
| **Roboflow `sports`** demo repo (soccer pitch detection, radar) | Apache-2.0 code; the *models* it downloads are AGPL YOLO | ✅ Reuse the code freely; the AGPL note above applies to the YOLO weights. |
| **SoccerNet** datasets/benchmarks | Research/non-commercial licence — read per-dataset terms | ⚠️ Fine to learn from; check terms before any redistribution. |

**Bottom line on licences:** for *your own analysis, run locally, not shared*, the entire mainstream CV stack
(YOLO + supervision + ByteTrack + OpenCV) is **free and legal**. The one line you must not cross casually is
turning it into a product other people use — that's when AGPL forces you to either open-source PáircVision or
pay Ultralytics. If you want to keep future commercial options fully open with zero AGPL risk, prefer
**non-AGPL detectors** (e.g. models under Apache-2.0 like RT-DETR variants, or train your own on a permissive
base) — but that's an optimisation, not a requirement for personal use.

### 2b. Footage copyright (can you use the video?)

- **Footage you record yourself** (club match, your phone/camera on a tripod) — you own it. ✅ No issue.
- **Broadcast / GAAGO / TG4 / Spórt TG4 footage** — that's copyrighted content. Downloading and analysing it
  privately for your own study sits in a low-risk grey area (personal, non-distributed), but you have **no
  right to redistribute** clips, telestration, or derived highlight reels publicly, and platform Terms of
  Service typically forbid downloading. Keep any broadcast-derived analysis strictly private.
- **Safest path:** build and train on **your own recorded matches**. Best analysis input anyway (fixed camera,
  full-pitch wide angle beats broadcast's zoomed, cut coverage).

### 2c. People's data / GDPR (players are identifiable)

- Video of identifiable players + performance stats = personal data.
- For **purely personal/household use** (your own analysis, not shared, not for a club or organisation) the GDPR
  **"household exemption"** generally applies — you're mostly fine.
- The moment you share player-level reports with a club, coaches, or online, you're a data controller: you'd
  need a lawful basis, and **minors' data** (underage teams) raises the bar sharply. Keep it personal, or get
  proper consent before it leaves your device.

---

## 3. Two realistic architectures

### Route A — Computer-vision pipeline (the "real" tracking system)

The proven soccer pipeline, ported to GAA:

```
video → frame sampling → YOLO player+ball detection
      → ByteTrack (stable IDs across frames)
      → pitch keypoint model → homography → top-down radar coordinates
      → team classification (jersey colour: SigLIP embeddings + UMAP/K-means, or simple colour clustering)
      → event/possession logic (your existing src/tactical rules can consume the tracked data)
      → formation (average positions per phase), momentum, kickout zones, shot maps
```

- **What's free & ready:** the whole soccer version exists as open code
  ([roboflow/sports](https://github.com/roboflow/sports), [SkalskiP/sports](https://github.com/SkalskiP/sports)).
  You clone the pattern, not build from zero.
- **What you must create:** a **GAA-trained detector and pitch-keypoint model.** Soccer weights won't read a
  GAA pitch (different lines, no penalty box geometry to anchor homography, 30 players). This means:
  - Annotate a few hundred–thousand frames of *your* footage in **Roboflow** (free tier) or **CVAT** (open source).
  - Fine-tune YOLO on players/ball + define GAA pitch keypoints (45s, 20m/13m lines, sidelines, D, goals).
  - This is the real work — days to weeks of annotation + training, ideally on a GPU (Colab/free tier or a
    cheap cloud GPU).
- **Runs where:** Python. Heavy for a browser. Realistically a **local Python service / desktop tool** that
  produces JSON + images, which your existing React app then visualises (you already have the PDF/PNG/review UI).
- **Strength:** precise, quantitative, positional truth (formations, heatmaps, xP, kickout landing zones).
- **Cost:** free software; your time + optional GPU rental. Fully offline once trained → best for privacy.

### Route B — Multimodal LLM video understanding (the fast path to "narrative" analysis)

Feed the match video (or key segments) to a **video-native LLM** and ask for the tactical breakdown.

- **Google Gemini** natively ingests long video (up to ~1 hr per prompt) and reasons over frames + audio.
  API pricing is roughly **$1.25 / $10 per million input/output tokens** (2.5 Pro tier). A full match is many
  tokens — sample frames / analyse in segments to control cost.
- **What it's good at:** the *qualitative* half of your ask — "where did the game turn", "they went to a
  sweeper after the 40th minute", "your kickouts were pressured on the short option" — narrated in plain
  English, fast, with **zero model training**.
- **What it's weak at:** exact counts, precise formations, reliable player-level stats, and pixel-accurate
  positions. It hallucinates numbers. Don't trust it for the stat table.
- **Legal note:** fine for personal analysis of **your own footage**. Read the provider's terms; don't upload
  footage you don't have rights to, and check the data-use/retention settings if privacy matters (a self-hosted
  open model — e.g. a Qwen-VL / LLaVA-class video model, Apache/permissive — keeps everything local if you have
  the hardware).

### Recommendation for a personal build

**Do both, staged:**

1. **Start with Route B** on your own recorded matches for the *tactics/formation narrative* — you get value
   this week, no training, and it validates what insights you actually want.
2. **Layer in Route A incrementally** for the hard numbers — begin with just **player detection + tracking +
   team colour** (no homography) to get possession %, then add the **pitch homography** for shot maps,
   kickout zones and formation geometry.
3. **Feed both into the UI you already have.** PáircVision's review/segment/Match-Pack/PDF layer is genuinely
   your moat here — the CV/LLM layer just produces the events + coordinates that your existing engine already
   knows how to visualise and narrate (and your CLAUDE.md coaching-insight rules already govern how those
   insights are phrased).

---

## 4. Concrete free toolbox

| Need | Free/legal tool | Licence |
|---|---|---|
| Detection / pose / keypoints | Ultralytics YOLO (v8/11/26) | AGPL-3.0 (free personal) |
| Tracking (stable IDs) | ByteTrack / BoT-SORT via `supervision` | MIT |
| Annotation utils, radar, homography helpers | Roboflow `supervision` | MIT |
| Soccer reference pipeline to copy | `roboflow/sports`, `SkalskiP/sports` | Apache-2.0 code |
| Video I/O, warping, homography math | OpenCV | Apache-2.0 |
| Labelling your GAA footage | Roboflow (free tier) or CVAT | free / open source |
| Training compute | Google Colab free / cheap cloud GPU | — |
| Narrative tactical analysis (fast) | Gemini video API, or self-hosted Qwen-VL/LLaVA-video | commercial API / permissive OSS |
| Benchmarks & datasets to learn from | SoccerNet | research licence — check terms |

---

## 5. Existing GAA products (know the field — for benchmarking, not copying)

These are commercial and closed; treat as reference for *what good output looks like*, not as code sources:

- **GAAnalysis** (gaanalysis.com) — closest to your vision: full match video → shot maps, xP, kickout zones,
  possession chains, momentum, AI match analyst.
- **Clubber Coach / Gemmo AI** — AI highlight/analysis tool being built specifically for GAA.
- **Nacsport, Performa Sports, isportsanalysis, AnalysisPro** — established GAA video-analysis platforms
  (mostly manual tagging + reporting, like PáircVision today).
- **Gaelic Tracker (MWM)** — live event capture + heatmaps.

Your differentiator as a personal tool: you control the coaching-insight language (your locked CLAUDE.md
standards), you own your data, and you can tune it to exactly the questions you care about.

---

## 6. Honest reality check

- **The free tech is real and legal** for personal use — but the GAA-specific perception model is **not
  pre-made**. The single biggest cost is **annotating your own footage and training**, not licensing.
- **Camera matters more than code.** One fixed, elevated, full-pitch wide-angle camera makes tracking and
  homography dramatically easier than broadcast footage. Sort filming first.
- **Sequence the ambition:** possession % and shot maps are achievable and high-value early. Full automatic
  "formation + where it was won/lost" is the hardest tier — reach it in steps, and let the LLM route (B) carry
  the narrative while the CV route (A) earns trust on the numbers.

---

## Sources

- Roboflow `sports` (soccer CV pipeline): https://github.com/roboflow/sports
- SkalskiP `sports`: https://github.com/SkalskiP/sports
- Camera calibration / pitch keypoints: https://blog.roboflow.com/camera-calibration-sports-computer-vision/
- YOLOv8 licence & pricing: https://roboflow.com/model-licenses/yolov8
- Ultralytics licence: https://www.ultralytics.com/license
- Ultralytics repo: https://github.com/ultralytics/ultralytics
- SoccerNet 2025 challenges: https://arxiv.org/pdf/2508.19182
- Gemini video understanding docs: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini API pricing: https://ai.google.dev/gemini-api/docs/pricing
- GAAnalysis: https://www.gaanalysis.com/
- Gemmo AI for GAA: https://gemmo.ai/ai-for-gaa/
- Nacsport GAA: https://www.nacsport.com/en-gb/gaa-video-analysis.php
