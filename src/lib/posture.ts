// 姿勢分析ロジック（MediaPipe Pose のランドマークから簡易スコアを算出）
// ブラウザ単体で動作。医療診断ではなく施術前後の変化共有用。

export type Landmark = { x: number; y: number; z?: number; visibility?: number };

export type PostureItem = {
  key: string;
  label: string;
  value: string;
  score: number; // 0..100
  detail: string;
};
export type PostureAnalysis = { items: PostureItem[] };

export const POSE_LM = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// SVG でつなぐ骨格ライン
export const POSE_LINES: [keyof typeof POSE_LM, keyof typeof POSE_LM][] = [
  ["LEFT_SHOULDER", "RIGHT_SHOULDER"],
  ["LEFT_SHOULDER", "LEFT_HIP"],
  ["RIGHT_SHOULDER", "RIGHT_HIP"],
  ["LEFT_HIP", "RIGHT_HIP"],
  ["LEFT_HIP", "LEFT_KNEE"],
  ["RIGHT_HIP", "RIGHT_KNEE"],
  ["LEFT_KNEE", "LEFT_ANKLE"],
  ["RIGHT_KNEE", "RIGHT_ANKLE"],
];

export function scoreColor(s: number): string {
  if (s >= 80) return "#16a34a";
  if (s >= 60) return "#84cc16";
  if (s >= 40) return "#f97316";
  return "#dc2626";
}
export function scoreLabel(s: number): string {
  if (s >= 80) return "良好";
  if (s >= 60) return "やや注意";
  if (s >= 40) return "要改善";
  return "要施術";
}

function linearScore(value: number, bad: number): number {
  const v = Math.abs(value);
  if (v <= 0) return 100;
  if (v >= bad) return 0;
  return Math.round(100 * (1 - v / bad));
}

const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// 3点の角度(度) / a が頂点
function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - a.x;
  const v2y = c.y - a.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (!m1 || !m2) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return Math.acos(cos) * (180 / Math.PI);
}

// 正面分析: 肩 / 骨盤の傾き、頭・体軸の左右ズレ
export function analyzeFront(lm: Landmark[]): PostureAnalysis | null {
  const ls = lm[POSE_LM.LEFT_SHOULDER];
  const rs = lm[POSE_LM.RIGHT_SHOULDER];
  const lh = lm[POSE_LM.LEFT_HIP];
  const rh = lm[POSE_LM.RIGHT_HIP];
  const nose = lm[POSE_LM.NOSE];
  if (!ls || !rs || !lh || !rh || !nose) return null;

  const sMid = mid(ls, rs);
  const hMid = mid(lh, rh);
  const shoulderWidth = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.2;

  const shTilt = Math.abs(Math.atan2(rs.y - ls.y, rs.x - ls.x) * (180 / Math.PI));
  const shTiltN = Math.min(shTilt, Math.abs(shTilt - 180));
  const hpTilt = Math.abs(Math.atan2(rh.y - lh.y, rh.x - lh.x) * (180 / Math.PI));
  const hpTiltN = Math.min(hpTilt, Math.abs(hpTilt - 180));
  const headOffset = Math.abs(nose.x - sMid.x) / shoulderWidth;
  const centerOffset = Math.abs(sMid.x - hMid.x) / shoulderWidth;

  return {
    items: [
      {
        key: "shoulder",
        label: "肩の左右バランス",
        value: shTiltN.toFixed(1) + "°",
        score: linearScore(shTiltN, 12),
        detail: shTiltN < 1 ? "均等" : ls.y < rs.y ? "左肩が高い" : "右肩が高い",
      },
      {
        key: "hip",
        label: "骨盤の左右バランス",
        value: hpTiltN.toFixed(1) + "°",
        score: linearScore(hpTiltN, 12),
        detail: hpTiltN < 1 ? "均等" : lh.y < rh.y ? "左が高い" : "右が高い",
      },
      {
        key: "head",
        label: "頭の位置",
        value: (headOffset * 100).toFixed(1) + "%",
        score: linearScore(headOffset * 100, 8),
        detail: headOffset < 0.01 ? "正中" : nose.x < sMid.x ? "左に傾斜" : "右に傾斜",
      },
      {
        key: "center",
        label: "体軸の左右ズレ",
        value: (centerOffset * 100).toFixed(1) + "%",
        score: linearScore(centerOffset * 100, 8),
        detail: centerOffset < 0.01 ? "正中" : sMid.x < hMid.x ? "左にズレ" : "右にズレ",
      },
    ],
  };
}

// 側面分析: 頭の前方偏位 / 巻き肩・猫背 / 骨盤の前後傾
export function analyzeSide(lm: Landmark[]): PostureAnalysis | null {
  const ear = lm[POSE_LM.LEFT_EAR];
  const sh = lm[POSE_LM.LEFT_SHOULDER];
  const hip = lm[POSE_LM.LEFT_HIP];
  const knee = lm[POSE_LM.LEFT_KNEE];
  if (!ear || !sh || !hip) return null;

  const shHipDist = Math.hypot(sh.x - hip.x, sh.y - hip.y) || 0.15;
  const headFwd = (ear.x - sh.x) / shHipDist;
  // 巻き肩・猫背: 肩を頂点に「耳-肩-腰」の角度（180°に近いほど直立=良好）
  const rollAngle = angleDeg(sh, ear, hip);
  // 膝が検出できているときだけ骨盤の前後傾を評価（欠損時に満点を捏造しない）
  const hasKnee = !!knee && (knee.visibility ?? 0) >= 0.5;

  const items: PostureItem[] = [
    {
      key: "head-fwd",
      label: "頭の前方偏位",
      value: (headFwd * 100).toFixed(1) + "%",
      score: linearScore(Math.max(0, headFwd) * 100, 18),
      detail: headFwd < 0.02 ? "良好" : headFwd < 0.08 ? "軽度の前方偏位" : "ストレートネック傾向",
    },
    {
      key: "roll",
      label: "巻き肩・猫背",
      value: rollAngle.toFixed(0) + "°",
      score: linearScore(180 - rollAngle, 35),
      detail: rollAngle >= 160 ? "良好" : rollAngle >= 145 ? "軽度の巻き肩" : "巻き肩傾向",
    },
  ];

  if (hasKnee) {
    const pelvicAngle = angleDeg(hip, sh, knee!);
    items.push({
      key: "pelvic",
      label: "骨盤の前後傾",
      value: pelvicAngle.toFixed(0) + "°",
      score: linearScore(Math.abs(pelvicAngle - 175), 18),
      detail:
        Math.abs(pelvicAngle - 175) < 5 ? "正常範囲" : pelvicAngle > 175 ? "後傾傾向" : "前傾傾向",
    });
  }

  return { items };
}

export function totalScore(a: PostureAnalysis | null): number | null {
  if (!a || !a.items.length) return null;
  return Math.round(a.items.reduce((s, it) => s + it.score, 0) / a.items.length);
}

// MediaPipe Pose を動的ロード（クライアント専用・初回のみ）
let _poseLoadPromise: Promise<unknown> | null = null;
export function loadMediaPipePose(): Promise<unknown> {
  const w = window as unknown as { Pose?: unknown };
  if (w.Pose) return Promise.resolve(w.Pose);
  if (_poseLoadPromise) return _poseLoadPromise;
  _poseLoadPromise = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js";
    sc.async = true;
    sc.onload = () => {
      setTimeout(
        () => (w.Pose ? resolve(w.Pose) : reject(new Error("Pose 未定義"))),
        200
      );
    };
    sc.onerror = () => reject(new Error("MediaPipe Pose の読み込みに失敗しました"));
    document.head.appendChild(sc);
  });
  return _poseLoadPromise;
}

export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
