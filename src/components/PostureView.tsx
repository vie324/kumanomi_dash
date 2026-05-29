"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeFront,
  analyzeSide,
  loadMediaPipePose,
  POSE_LINES,
  POSE_LM,
  scoreColor,
  scoreLabel,
  todayJST,
  totalScore,
  type Landmark,
  type PostureAnalysis,
} from "@/lib/posture";

type Phase = "idle" | "loading" | "live" | "captured";
type Mode = "front" | "side";
type StashData = { mode: Mode; image: string; analysis: PostureAnalysis | null };

export default function PostureView() {
  const [mode, setMode] = useState<Mode>("front");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null);
  const [analysis, setAnalysis] = useState<PostureAnalysis | null>(null);
  const [capturedImg, setCapturedImg] = useState<string | null>(null);
  const [overlayOn, setOverlayOn] = useState(true);
  const [beforeData, setBeforeData] = useState<StashData | null>(null);
  const [afterData, setAfterData] = useState<StashData | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poseRef = useRef<any>(null);
  const animRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // mode 変更でリセット
  useEffect(() => {
    stopCamera();
    setPhase("idle");
    setLandmarks(null);
    setAnalysis(null);
    setCapturedImg(null);
    setErrorMsg("");
  }, [mode, stopCamera]);

  const startCamera = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    setLandmarks(null);
    setAnalysis(null);
    setCapturedImg(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Pose = (await loadMediaPipePose()) as any;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 960 },
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) throw new Error("ビューポート要素がありません");
      v.srcObject = stream;
      await v.play();
      if (!poseRef.current) {
        const pose = new Pose({
          locateFile: (f: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${f}`,
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pose.onResults((results: any) => {
          if (results.poseLandmarks) setLandmarks(results.poseLandmarks);
        });
        await pose.initialize();
        poseRef.current = pose;
      }
      setPhase("live");
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          await poseRef.current.send({ image: v });
        } catch {
          /* ignore frame errors */
        }
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "カメラを起動できませんでした");
      setPhase("idle");
      stopCamera();
    }
  }, [stopCamera]);

  // 解析
  useEffect(() => {
    if (!landmarks) return;
    setAnalysis(mode === "front" ? analyzeFront(landmarks) : analyzeSide(landmarks));
  }, [landmarks, mode]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    setCapturedImg(c.toDataURL("image/jpeg", 0.92));
    setPhase("captured");
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCapturedImg(null);
    setLandmarks(null);
    setAnalysis(null);
    setPhase("idle");
  }, []);

  const total = useMemo(() => totalScore(analysis), [analysis]);

  function stash(slot: "before" | "after") {
    if (!capturedImg || !analysis) return;
    const data: StashData = { mode, image: capturedImg, analysis };
    if (slot === "before") setBeforeData(data);
    else setAfterData(data);
  }

  function downloadCurrent() {
    if (!capturedImg) return;
    const a = document.createElement("a");
    a.download = `posture_${mode}_${todayJST()}.jpg`;
    a.href = capturedImg;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-extrabold text-slate-900">姿勢分析</h1>
        <span className="ml-auto text-[10px] font-bold text-slate-400 tracking-widest">POSTURE</span>
      </div>

      {/* モード切替 */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
        {(["front", "side"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === m ? "bg-white text-sise-700 shadow-sm" : "text-slate-500"
            }`}
          >
            {m === "front" ? "正面" : "側面"}
          </button>
        ))}
      </div>

      {/* ビューポート */}
      <div className="relative w-full aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: phase === "live" ? "block" : "none" }}
        />
        {capturedImg && phase === "captured" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capturedImg} alt="capture" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {overlayOn && landmarks && (phase === "live" || phase === "captured") && (
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            {POSE_LINES.map(([a, b], i) => {
              const la = landmarks[POSE_LM[a]];
              const lb = landmarks[POSE_LM[b]];
              if (!la || !lb || (la.visibility ?? 0) < 0.5 || (lb.visibility ?? 0) < 0.5) return null;
              return (
                <line
                  key={i}
                  x1={la.x}
                  y1={la.y}
                  x2={lb.x}
                  y2={lb.y}
                  stroke="rgba(249,115,22,0.85)"
                  strokeWidth="0.006"
                  strokeLinecap="round"
                />
              );
            })}
            {Object.values(POSE_LM).map((idx) => {
              const p = landmarks[idx];
              if (!p || (p.visibility ?? 0) < 0.5) return null;
              return <circle key={idx} cx={p.x} cy={p.y} r="0.008" fill="#f97316" stroke="#fff" strokeWidth="0.003" />;
            })}
          </svg>
        )}
        {phase === "idle" && !capturedImg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 text-center px-6">
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {mode === "front"
                ? "お客様の正面全身がフレームに\n収まるようにカメラを起動してください"
                : "お客様の左側面（左肩〜左足）が\nフレームに収まるようにしてください"}
            </p>
          </div>
        )}
        {phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-white bg-black/45">
            <span className="text-sm font-bold">カメラ・AI 読み込み中…</span>
          </div>
        )}
        {phase === "live" && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-extrabold">LIVE</span>
          </div>
        )}
      </div>

      {/* アクション */}
      <div className="flex items-center gap-2">
        {phase === "idle" && (
          <button className="btn-primary flex-1" onClick={startCamera}>カメラ起動</button>
        )}
        {phase === "live" && (
          <>
            <button className="btn-primary flex-1" onClick={capture} disabled={!landmarks}>キャプチャ</button>
            <button className="btn-ghost" onClick={() => { stopCamera(); setPhase("idle"); }}>停止</button>
          </>
        )}
        {phase === "captured" && (
          <>
            <button className="btn-ghost flex-1" onClick={retake}>撮り直し</button>
            <button className="btn-ghost" onClick={downloadCurrent}>画像保存</button>
          </>
        )}
      </div>

      {(phase === "live" || phase === "captured") && (
        <div className="flex justify-center">
          <button
            onClick={() => setOverlayOn((o) => !o)}
            className="text-xs text-slate-500 hover:text-sise-600 px-3 py-1.5 rounded-lg hover:bg-sise-50 transition"
          >
            骨格表示 {overlayOn ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{errorMsg}</div>
      )}

      {/* スコア */}
      {analysis && (phase === "captured" || phase === "live") && (
        <div className="space-y-3">
          {total !== null && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border-2" style={{ borderColor: scoreColor(total) }}>
              <div
                className="w-14 h-14 rounded-full grid place-items-center text-xl font-black text-white"
                style={{ background: scoreColor(total) }}
              >
                {total}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-slate-400 tracking-widest">TOTAL SCORE</div>
                <div className="text-base font-bold" style={{ color: scoreColor(total) }}>{scoreLabel(total)}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {mode === "front" ? "正面分析" : "側面分析"} ・ {analysis.items.length}項目
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            {analysis.items.map((item) => (
              <div key={item.key} className="flex items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-700">{item.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.detail} ・ {item.value}</div>
                </div>
                <span className="text-white text-xs font-extrabold px-2.5 py-1 rounded-lg" style={{ background: scoreColor(item.score) }}>
                  {item.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Before / After */}
      {phase === "captured" && (
        <div className="p-3 rounded-xl border border-slate-200 bg-white/60">
          <div className="text-[11px] font-bold text-slate-500 mb-2 tracking-widest">BEFORE / AFTER 比較</div>
          <div className="flex gap-2">
            <button className="btn-ghost !py-2 flex-1 text-xs" onClick={() => stash("before")}>Before に保存</button>
            <button className="btn-ghost !py-2 flex-1 text-xs" onClick={() => stash("after")}>After に保存</button>
            {(beforeData || afterData) && (
              <button className="btn-ghost !py-2 text-xs" onClick={() => { setBeforeData(null); setAfterData(null); }}>クリア</button>
            )}
          </div>
          {(beforeData || afterData) && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {(["before", "after"] as const).map((slot) => {
                const data = slot === "before" ? beforeData : afterData;
                const label = slot === "before" ? "Before" : "After";
                if (!data) {
                  return (
                    <div key={slot} className="aspect-[3/4] rounded-xl border-2 border-dashed border-slate-200 grid place-items-center text-xs text-slate-400">
                      {label} 未保存
                    </div>
                  );
                }
                const t = totalScore(data.analysis);
                return (
                  <div key={slot} className="rounded-xl overflow-hidden border border-slate-200">
                    <div className="aspect-[3/4] bg-slate-900 relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={data.image} alt={label} className="w-full h-full object-cover" />
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/55 text-white text-[10px] font-extrabold">{label}</div>
                      {t !== null && (
                        <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full text-white text-[11px] font-extrabold" style={{ background: scoreColor(t) }}>{t}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {beforeData && afterData && (() => {
            const bt = totalScore(beforeData.analysis) ?? 0;
            const at = totalScore(afterData.analysis) ?? 0;
            const diff = at - bt;
            return (
              <div
                className="mt-3 p-2.5 rounded-lg text-center text-xs font-bold"
                style={{
                  background: diff >= 0 ? "#f0fdf4" : "#fef2f2",
                  border: "1px solid " + (diff >= 0 ? "#bbf7d0" : "#fecaca"),
                  color: diff >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                スコア変化: {bt} → {at} ({diff >= 0 ? "+" : ""}{diff})
              </div>
            );
          })()}
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-center leading-relaxed">
        ※ スコアは MediaPipe Pose の関節点から算出した簡易な指標です。医療的診断ではなく、施術前後の変化を共有する目的でご利用ください。
      </p>
    </div>
  );
}
