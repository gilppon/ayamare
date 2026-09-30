import type {
  ApologyAction,
  Judgment,
  JournalistType,
  SnsItem,
} from "./types";
import type { Lang } from "@/i18n/ui";

export const BPM = 130;

/**
 * 스테이지별 실측 BPM (릴리아 생성곡 온셋 분석값).
 * 곡과 채보 박자를 맞추기 위해 사용. 커스텀/절차음악은 기본 BPM.
 * stage1: 120 / stage2: 120 / stage3: 128 / daily: 120
 * stage4: 140 / stage5: 150 (절차 그루브, 음원 없음)
 */
export const STAGE_BPMS: Record<string, number> = {
  stage1: 120,
  stage2: 120,
  stage3: 128,
  stage4: 140,
  stage5: 150,
  daily: 120,
};

export function bpmForStage(stageId: string): number {
  if (stageId.startsWith("daily")) return STAGE_BPMS.daily;
  if (stageId.startsWith("custom")) return BPM;
  return STAGE_BPMS[stageId] ?? BPM;
}

// Judgment timing windows (milliseconds).
export const PERFECT_MS = 55;
export const GREAT_MS = 110;
export const GOOD_MS = 170;
export const BAD_MS = 260;

export interface LaneConfig {
  lane: 0 | 1 | 2 | 3;
  action: ApologyAction;
  key: string;
  keyLabel: string;
  label: string;
  name: string;
  color: string;
  glow: string;
}

export const LANES: LaneConfig[] = [
  {
    lane: 0,
    action: "bow15",
    key: "a",
    keyLabel: "A",
    label: "15°",
    name: "가벼운 목례",
    color: "#2dd4bf",
    glow: "rgba(45, 212, 191, 0.55)",
  },
  {
    lane: 1,
    action: "bow45",
    key: "s",
    keyLabel: "S",
    label: "45°",
    name: "정중한 사과",
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.55)",
  },
  {
    lane: 2,
    action: "bow90",
    key: "d",
    keyLabel: "D",
    label: "90°",
    name: "극한 사죄",
    color: "#c084fc",
    glow: "rgba(192, 132, 252, 0.55)",
  },
  {
    lane: 3,
    action: "dogeza",
    key: " ",
    keyLabel: "SPACE",
    label: "DOGEZA",
    name: "최종 사죄",
    color: "#fb7185",
    glow: "rgba(251, 113, 133, 0.6)",
  },
];

export const ACTION_BY_LANE: ApologyAction[] = [
  "bow15",
  "bow45",
  "bow90",
  "dogeza",
];

export const KEY_TO_LANE: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  " ": 3,
};

/**
 * 물리 키 코드 폴백. 한글 IME가 켜져 있으면 e.key가 'ㅁ' 등으로 들어와
 * 매핑이 실패하므로, 레이아웃과 무관한 e.code로 한 번 더 조회한다.
 */
export const CODE_TO_LANE: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  Space: 3,
};

/** 키보드 이벤트 → 레인. keyMap(커스텀) > e.key > e.code 순. */
export function laneFromKeyboardEvent(
  e: { key: string; code: string },
  keyMap: Record<string, number>
): number | undefined {
  const key = e.key === " " ? " " : e.key.toLowerCase();
  return keyMap[key] ?? KEY_TO_LANE[key] ?? CODE_TO_LANE[e.code];
}

export interface ComboTier {
  min: number;
  name: string;
  sub: string;
}

export const COMBO_TIERS: ComboTier[] = [
  { min: 75, name: "NATIONAL APOLOGY", sub: "국가적 사죄" },
  { min: 50, name: "LEGENDARY APOLOGY", sub: "전설의 사죄" },
  { min: 30, name: "EXTREME APOLOGY", sub: "극한 사죄" },
  { min: 20, name: "VERY SORRY", sub: "매우 죄송" },
  { min: 10, name: "SINCERE", sub: "진심 어림" },
  { min: 5, name: "POLITE", sub: "예의 있음" },
];

export function comboToTier(combo: number): ComboTier | null {
  for (const tier of COMBO_TIERS) {
    if (combo >= tier.min) return tier;
  }
  return null;
}

export const JUDGMENTS: Record<
  Judgment,
  { label: string; color: string; score: number }
> = {
  PERFECT: { label: "PERFECT", color: "#fbbf24", score: 1000 },
  GREAT: { label: "GREAT", color: "#34d399", score: 800 },
  GOOD: { label: "GOOD", color: "#38bdf8", score: 600 },
  BAD: { label: "BAD", color: "#fb923c", score: 300 },
  MISS: { label: "MISS", color: "#f43f5e", score: 0 },
};

export const STOCK_DELTA: Record<Judgment, number> = {
  PERFECT: 0.034,
  GREAT: 0.018,
  GOOD: 0.008,
  BAD: -0.025,
  MISS: -0.14,
};

export const ANGER_DELTA: Record<Judgment, number> = {
  PERFECT: -6,
  GREAT: -3,
  GOOD: -1,
  BAD: 4,
  MISS: 9,
};

export const INITIAL_STOCK = 8200;
export const INITIAL_ANGER = 25;

export const MISS_LINES: string[] = [
  "지금 그게 사과입니까?",
  "사과 끝났습니까?",
  "성의가 없군요.",
  "질문에 답해주세요.",
  "계속 그러고 계실 겁니까?",
  "고개가 안 숙여지는데요?",
  "이대로 뉴스에 나가겠습니다.",
  "주식 팔았습니다.",
];

export const GOOD_LINES: string[] = [
  "진심이 느껴집니다.",
  "45도는 괜찮았어요.",
  "오늘은 여기까지 하죠.",
  "사과, 인정합니다.",
];

const REACTION_OVERRIDE: Record<"en" | "ja", { miss: string[]; good: string[] }> = {
  en: {
    miss: [
      "Do you call that an apology?",
      "Are we done here?",
      "No sincerity at all.",
      "Answer the question.",
      "Still dodging, I see?",
      "Your head isn't bowing at all?",
      "This is going on the news as-is.",
      "Just sold the stock.",
    ],
    good: [
      "I feel the sincerity.",
      "That 45 degrees was fine.",
      "Let's call it a day.",
      "Apology accepted.",
    ],
  },
  ja: {
    miss: [
      "それが謝罪ですか？",
      "謝罪は終わりですか？",
      "誠意がありませんね。",
      "質問に答えてください。",
      "まだその調子ですか？",
      "頭が下がっていませんよ？",
      "このままニュースに出しますよ。",
      "株を売りました。",
    ],
    good: [
      "真心を感じます。",
      "45度は良かったですよ。",
      "今日はここまでにしましょう。",
      "謝罪、認めます。",
    ],
  },
};

export function missLines(lang: Lang): string[] {
  return lang === "ko" ? MISS_LINES : REACTION_OVERRIDE[lang].miss;
}

export function goodLines(lang: Lang): string[] {
  return lang === "ko" ? GOOD_LINES : REACTION_OVERRIDE[lang].good;
}

export const JOURNALIST_NAMES: Record<Lang, Record<JournalistType, string>> = {
  ko: {
    rookie: "신입 기자",
    economy: "경제지 기자",
    investigative: "탐사보도 기자",
    internet: "인터넷 기자",
    veteran: "베테랑 기자",
    boss: "최종보스 기자",
  },
  en: {
    rookie: "Rookie reporter",
    economy: "Business reporter",
    investigative: "Investigative reporter",
    internet: "Online reporter",
    veteran: "Veteran reporter",
    boss: "Final boss reporter",
  },
  ja: {
    rookie: "新人記者",
    economy: "経済紙記者",
    investigative: "調査報道記者",
    internet: "ネット記者",
    veteran: "ベテラン記者",
    boss: "ラスボス記者",
  },
};

export const LANE_NAMES: Record<Lang, Record<ApologyAction, string>> = {
  ko: { bow15: "가벼운 목례", bow45: "정중한 사과", bow90: "극한 사죄", dogeza: "최종 사죄" },
  en: { bow15: "Light nod", bow45: "Formal apology", bow90: "Deep remorse", dogeza: "Final atonement" },
  ja: { bow15: "軽い会釈", bow45: "丁寧な謝罪", bow90: "土下座級の謝罪", dogeza: "最終謝罪" },
};

export const JOURNALISTS: Record<
  JournalistType,
  { name: string; stars: string; color: string }
> = {
  rookie: { name: "신입 기자", stars: "★", color: "#7dd3fc" },
  economy: { name: "경제지 기자", stars: "★★", color: "#fbbf24" },
  investigative: { name: "탐사보도 기자", stars: "★★★", color: "#f472b6" },
  internet: { name: "인터넷 기자", stars: "★★★", color: "#34d399" },
  veteran: { name: "베테랑 기자", stars: "★★★★", color: "#fb923c" },
  boss: { name: "최종보스 기자", stars: "★★★★★", color: "#f43f5e" },
};

const SNS_USERS = [
  "@주린이",
  "@개미탈출",
  "@야근중",
  "@민심탐사",
  "@리듬고수",
  "@주가감시단",
  "@뉴스보다재밌음",
  "@도게자마스터",
];

const SNS_POSITIVE = [
  "저 사람 진짜 반성하는 거 맞음?",
  "45도는 괜찮았다.",
  "도게자 타이밍 미쳤다ㅋㅋㅋ",
  "표정에서 진심이 보인다.",
  "저 각도면 용서한다.",
  "이 정도면 사과 인정.",
];

const SNS_NEGATIVE = [
  "주식 팔았다.",
  "반성하는 척 좀 그만해.",
  "이제 와서 도게자?",
  "15도로 사과하네ㅋㅋ",
  "저건 성의가 없잖아.",
  "고개 각도가 문제가 아니라...",
  "회사 망했다.",
];

const SNS_NEUTRAL = [
  "기자회견 시작됐네",
  "#사죄회견 하는 중",
  "카메라 플래시 장난 아니다",
  "오늘도 회사는 멀쩡하겠지",
  "음악 왜 이렇게 신나냐ㅋㅋ",
];

const SNS_OVERRIDE: Record<
  "en" | "ja",
  { users: string[]; positive: string[]; negative: string[]; neutral: string[] }
> = {
  en: {
    users: ["@stonks", "@bagholder", "@overtime", "@moodscout", "@rhythmpro", "@chartwatch", "@newsbutfun", "@dogezamaster"],
    positive: [
      "Wait, is he actually sorry?",
      "That 45 degrees was solid.",
      "That dogeza timing was insane lol",
      "You can see it in his face.",
      "Forgiven at that angle.",
      "Apology accepted, I'd say.",
    ],
    negative: [
      "Sold the stock.",
      "Stop pretending to reflect.",
      "Dogeza NOW? Too late.",
      "A 15-degree apology lol",
      "Zero sincerity there.",
      "It's not about the angle...",
      "Company's done for.",
    ],
    neutral: [
      "Press conference started",
      "#apologypresser live",
      "Camera flashes are wild",
      "Company survives another day, probably",
      "Why is the music so hype lol",
    ],
  },
  ja: {
    users: ["@株初心者", "@損切り", "@残業中", "@世論調査", "@リズム上手", "@株価監視団", "@報道より面白い", "@土下座マスター"],
    positive: [
      "この人、本当に反省してる？",
      "45度は良かった。",
      "土下座のタイミングやばいww",
      "表情から真心が見える。",
      "その角度なら許す。",
      "これなら謝罪認定。",
    ],
    negative: [
      "株を売った。",
      "反省してるフリはやめろ。",
      "今さら土下座？",
      "15度で謝罪かよww",
      "誠意が感じられない。",
      "角度の問題じゃない…",
      "会社終わったな。",
    ],
    neutral: [
      "会見始まったな",
      "#謝罪会見 開催中",
      "カメラのフラッシュすごい",
      "今日も会社は無事だろう",
      "なんで音楽こんなにノリノリなんだww",
    ],
  },
};

let snsId = 0;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomSns(tone: SnsItem["tone"], lang: Lang = "ko"): SnsItem {
  const o = lang === "ko" ? null : SNS_OVERRIDE[lang];
  const text =
    tone === "positive"
      ? pick(o?.positive ?? SNS_POSITIVE)
      : tone === "negative"
      ? pick(o?.negative ?? SNS_NEGATIVE)
      : pick(o?.neutral ?? SNS_NEUTRAL);
  return { id: snsId++, user: pick(o?.users ?? SNS_USERS), text, tone };
}

export function computeGrade(accuracy: number): string {
  if (accuracy >= 0.95) return "SSS";
  if (accuracy >= 0.9) return "SS";
  if (accuracy >= 0.85) return "S";
  if (accuracy >= 0.75) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.55) return "C";
  if (accuracy >= 0.45) return "D";
  return "F";
}

export const GRADE_COLORS: Record<string, string> = {
  SSS: "#fbbf24",
  SS: "#f472b6",
  S: "#c084fc",
  A: "#38bdf8",
  B: "#34d399",
  C: "#facc15",
  D: "#fb923c",
  F: "#f43f5e",
};

type Ending = { title: string; text: string; tone: "good" | "normal" | "bad" | "disaster" | "secret" };

const ENDINGS: Record<"en" | "ja", Record<string, Ending>> = {
  en: {
    secret: { title: "SECRET ENDING", text: "PERFECT on every question. The whole room bows to you.", tone: "secret" },
    good: { title: "PERFECT ENDING", text: "\u201CWe felt the sincerity.\u201D The stock soars; the crisis is over.", tone: "good" },
    normal: { title: "NORMAL ENDING", text: "Things calm down. The company survives another day.", tone: "normal" },
    bad: { title: "BAD ENDING", text: "Not enough remorse. Another press conference must be held.", tone: "bad" },
    disaster: { title: "DISASTER ENDING", text: "CEO dismissed. Whose turn is next?", tone: "disaster" },
  },
  ja: {
    secret: { title: "SECRET ENDING", text: "全問PERFECT。会見場全体があなたに頭を下げる。", tone: "secret" },
    good: { title: "PERFECT ENDING", text: "「真心を感じた。」株価は暴騰し、事態は収拾した。", tone: "good" },
    normal: { title: "NORMAL ENDING", text: "事態は沈静化した。明日も会社は無事だ。", tone: "normal" },
    bad: { title: "BAD ENDING", text: "謝罪が足りなかった。会見をやり直さなければならない。", tone: "bad" },
    disaster: { title: "DISASTER ENDING", text: "CEO解任。次は誰の番だ？", tone: "disaster" },
  },
};

export function computeEnding(
  grade: string,
  allPerfect: boolean,
  lang: Lang = "ko"
): Ending {
  let key: "secret" | "good" | "normal" | "bad" | "disaster";
  if (allPerfect) {
    key = "secret";
    if (lang === "ko") {
      return {
        title: "SECRET ENDING",
        text: "모든 질문에 PERFECT. 회견장 전체가 당신에게 고개를 숙인다.",
        tone: "secret",
      };
    }
    return ENDINGS[lang][key];
  }
  if (grade === "SSS" || grade === "SS") {
    key = "good";
    if (lang === "ko") {
      return {
        title: "PERFECT ENDING",
        text: "\u201C진심이 느껴졌다.\u201D 주가가 폭등하며 사태가 수습된다.",
        tone: "good",
      };
    }
    return ENDINGS[lang][key];
  }
  if (grade === "S" || grade === "A" || grade === "B") {
    key = "normal";
    if (lang === "ko") {
      return {
        title: "NORMAL ENDING",
        text: "사태가 진정되었다. 내일도 회사는 무사하다.",
        tone: "normal",
      };
    }
    return ENDINGS[lang][key];
  }
  if (grade === "C" || grade === "D") {
    key = "bad";
    if (lang === "ko") {
      return {
        title: "BAD ENDING",
        text: "사과가 부족했다. 기자회견을 다시 열어야 한다.",
        tone: "bad",
      };
    }
    return ENDINGS[lang][key];
  }
  if (lang === "ko") {
    return {
      title: "DISASTER ENDING",
      text: "CEO 해임. 다음은 누구의 차례인가?",
      tone: "disaster",
    };
  }
  return ENDINGS[lang].disaster;
}
