import type { Lang } from "@/i18n/ui";

export interface PressContext {
  combo: number;
  missStreak: number;
  perfectStreak: number;
  anger: number;
  stockDelta: number;
  accuracy: number;
  questionIndex: number;
  dogezaHits: number;
  /**
   * 지금까지 판정된 노트 수. 표본 수.
   * 이게 없으면 accuracy 가 1(=미플레이) 로서 "기세가 좋으시네요" 꼬리가
   * 매 런 첫 질문부터 붙는다.
   */
  judged: number;
}

/** 호평 꼬리를 붙이기 위한 최소 표본 수 */
export const PRAISE_MIN_SAMPLE = 8;

export const INITIAL_PRESS_CONTEXT: PressContext = {
  combo: 0,
  missStreak: 0,
  perfectStreak: 0,
  anger: 25,
  stockDelta: 0,
  accuracy: 1,
  questionIndex: 0,
  dogezaHits: 0,
  judged: 0,
};

const MISS_TAUNTS: Record<string, string[]> = {
  default: [
    "지금 그게 사과입니까?",
    "질문에 답해주세요.",
    "성의가 없군요.",
  ],
  streak: [
    "세 번 연속으로 빗나갔습니다. 작정하신 겁니까?",
    "고개가 안 숙여지는데요? 어깨가 아프십니까?",
    "이대로면 내일 1면입니다. 계속 그러시겠습니까?",
  ],
  angerHigh: [
    "방청석이 술렁입니다. 분노가 80을 넘었습니다!",
    "국민 분노가 임계치입니다. 답을 내놓으십시오!",
  ],
  stockCrash: [
    "주가가 폭락 중입니다! 주주들이 보고 있습니다!",
    "방금 주식 팔았습니다. 변명해보시죠.",
  ],
};

const GOOD_PRAISE: Record<string, string[]> = {
  default: [
    "진심이 느껴집니다.",
    "사과, 인정합니다.",
  ],
  streak: [
    "연속 PERFECT! 회견장 공기가 바뀌고 있습니다.",
    "저 각도면 용서한다… 라는 댓글이 올라오고 있습니다!",
  ],
  comeback: [
    "아까와는 다르군요. 반성한 겁니까?",
    "이제야 좀 고개가 숙여지는군요.",
  ],
};

const QUESTION_INTENSIFIERS: string[] = [
  " …아직도 변명하실 겁니까?",
  " …국민이 듣고 있습니다.",
  " …주가가 걸려 있습니다.",
  " …증거는 이미 나왔습니다.",
];

const QUESTION_SOFTENERS: string[] = [
  " …기세가 좋으시네요. 그럼 이건 어떻습니까?",
  " …잘하고 있습니다. 다음 질문입니다.",
];

type PoolSet = {
  miss: Record<string, string[]>;
  good: Record<string, string[]>;
  intensifiers: string[];
  softeners: string[];
};

const POOLS: Record<"en" | "ja", PoolSet> = {
  en: {
    miss: {
      default: [
        "Do you call that an apology?",
        "Answer the question, please.",
        "No sincerity at all.",
      ],
      streak: [
        "Three misses in a row. Is this deliberate?",
        "Your head isn't bowing. Shoulder injury?",
        "Front page tomorrow at this rate. Keep going?",
      ],
      angerHigh: [
        "The room is stirring. Outrage just passed 80!",
        "Public outrage is critical. Give us an answer!",
      ],
      stockCrash: [
        "The stock is crashing! Shareholders are watching!",
        "Just sold the stock. Explain yourself.",
      ],
    },
    good: {
      default: ["I feel the sincerity.", "Apology accepted."],
      streak: [
        "PERFECT streak! The room's mood is shifting.",
        "\"Forgiven at that angle\" — comments are pouring in!",
      ],
      comeback: [
        "Different from before. Have you reflected?",
        "Now THAT's a proper bow.",
      ],
    },
    intensifiers: [
      " …Still making excuses?",
      " …The nation is listening.",
      " …The stock price is on the line.",
      " …The evidence is already out.",
    ],
    softeners: [
      " …Good momentum. Then how about this?",
      " …Well done. Next question.",
    ],
  },
  ja: {
    miss: {
      default: [
        "それが謝罪ですか？",
        "質問に答えてください。",
        "誠意がありませんね。",
      ],
      streak: [
        "3連続で外しましたね。わざとですか？",
        "頭が下がっていませんよ？肩でも痛いんですか？",
        "このままでは明日の一面ですよ。続けますか？",
      ],
      angerHigh: [
        "会場がざわついています。怒りが80を超えました！",
        "国民の怒りが限界です。答えてください！",
      ],
      stockCrash: [
        "株価が暴落中です！株主が見ていますよ！",
        "株を売りました。言い訳してみてください。",
      ],
    },
    good: {
      default: ["真心を感じます。", "謝罪、認めます。"],
      streak: [
        "PERFECT連続！会場の空気が変わってきました。",
        "「その角度なら許す」…コメントが来ています！",
      ],
      comeback: [
        "さっきとは違いますね。反省しましたか？",
        "やっと頭が下がってきましたね。",
      ],
    },
    intensifiers: [
      " …まだ言い訳しますか？",
      " …国民が聞いていますよ。",
      " …株価がかかっていますよ。",
      " …証拠はすでに出ています。",
    ],
    softeners: [
      " …いい調子ですね。ではこれはどうですか？",
      " …よくやっています。次の質問です。",
    ],
  },
};

function pools(lang: Lang): PoolSet | null {
  return lang === "ko" ? null : POOLS[lang];
}

function pick(arr: string[], seed: number): string {
  return arr[Math.abs(seed) % arr.length];
}

/** MISS/BAD 시 상황별 추궁 멘트 */
export function tauntForMiss(ctx: PressContext, seed = 0, lang: Lang = "ko"): string {
  const p = pools(lang);
  if (ctx.anger >= 80) return pick(p?.miss.angerHigh ?? MISS_TAUNTS.angerHigh, seed);
  if (ctx.stockDelta <= -0.15) return pick(p?.miss.stockCrash ?? MISS_TAUNTS.stockCrash, seed + 1);
  if (ctx.missStreak >= 2) return pick(p?.miss.streak ?? MISS_TAUNTS.streak, seed + ctx.missStreak);
  return pick(p?.miss.default ?? MISS_TAUNTS.default, seed);
}

/** PERFECT/GREAT 시 상황별 칭찬 멘트 */
export function praiseForHit(ctx: PressContext, seed = 0, lang: Lang = "ko"): string {
  const p = pools(lang);
  if (ctx.perfectStreak >= 5) return pick(p?.good.streak ?? GOOD_PRAISE.streak, seed);
  if (ctx.missStreak >= 3) return pick(p?.good.comeback ?? GOOD_PRAISE.comeback, seed + 1);
  return pick(p?.good.default ?? GOOD_PRAISE.default, seed + ctx.combo);
}

/** 정해진 질문에 상황별 꼬리 추가 (원문 보존 + 한 줄 덧씌우기) */
export function intensifyQuestion(baseText: string, ctx: PressContext, seed = 0, lang: Lang = "ko"): string {
  const p = pools(lang);
  // 표본이 부족할 때는 칭찬/추궁 어느 쪽도 근거가 없다 → 원문 유지
  if (ctx.judged < PRAISE_MIN_SAMPLE) return baseText;
  if (ctx.combo >= 20 || ctx.accuracy >= 0.9) {
    return baseText + pick(p?.softeners ?? QUESTION_SOFTENERS, seed);
  }
  if (ctx.missStreak >= 2 || ctx.anger >= 60) {
    return baseText + pick(p?.intensifiers ?? QUESTION_INTENSIFIERS, seed + ctx.missStreak);
  }
  return baseText;
}
