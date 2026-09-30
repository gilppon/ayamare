import { ACTION_BY_LANE, bpmForStage } from "./constants";
import { buildDailyChart, getDailyKey } from "./daily";
import type { Chart, JournalistType, Note, QuestionEvent } from "./types";
import type { Lang } from "@/i18n/ui";

let noteId = 0;

function makeNote(bar: number, beat: number, lane: number, beatDur: number, holdBeats = 0, gimmick?: Note["gimmick"]): Note {
  return {
    id: noteId++,
    time: (bar * 4 + beat) * beatDur,
    lane: lane as 0 | 1 | 2 | 3,
    action: ACTION_BY_LANE[lane],
    hold: holdBeats * beatDur,
    gimmick,
  };
}

type Cell = [beat: number, lane: number, holdBeats?: number, gimmick?: Note["gimmick"]];

// Each entry is one bar. An empty array means a rest bar (count-in).
const BARS: Cell[][] = [
  [],
  [],
  // ── Section A · intro groove (15° / 45°)
  [
    [0, 0],
    [1, 1],
    [2, 0],
    [3, 1],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 1],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 0],
    [3, 0],
  ],
  [
    [0, 1],
    [1, 1],
    [2, 0],
    [3, 1],
  ],
  // ── Section B · holds + first 90°
  [
    [0, 1, 1],
    [2, 0],
    [3, 1],
  ],
  [
    [0, 0],
    [1, 1, 1],
    [3, 0],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 1],
    [3, 0],
  ],
  // ── Section C · faster, 8th notes
  [
    [0, 1],
    [0.5, 0],
    [1, 1],
    [2, 2],
    [3, 1],
  ],
  [
    [0, 2],
    [1, 1],
    [1.5, 0],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [2, 1],
    [2.5, 0],
    [3, 2],
  ],
  [
    [0, 2, 1],
    [1, 1],
    [2, 2],
    [3, 1],
  ],
  // ── Section D · DOGEZA climax
  [
    [0, 2],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 3],
    [1, 0],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 1],
    [3, 3, 1],
  ],
  // ── Section E · final rush
  [
    [0, 1],
    [0.5, 0],
    [1, 1],
    [1.5, 2],
    [2, 1],
    [2.5, 2],
    [3, 3],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 1],
    [3, 3],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [1.5, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  // ── Outro
  [[0, 3, 1]],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 3],
  ],
];

interface QSpec {
  bar: number;
  journalist: JournalistType;
  text: Record<Lang, string>;
}

function toEvents(specs: QSpec[], lang: Lang, beatDur: number): QuestionEvent[] {
  return specs.map((s) => ({
    time: (s.bar * 4 + 0) * beatDur,
    journalist: s.journalist,
    text: s.text[lang],
  }));
}

const QUESTIONS_SPEC: QSpec[] = [
  {
    bar: 2,
    journalist: "rookie",
    text: {
      ko: "어젯밤 공식 계정에 \u201C오늘 회식 개꿀\u201D이라는 글이 올라왔습니다. 사실입니까?",
      en: "Last night the official account posted \u201Cteam dinner was awesome.\u201D True?",
      ja: "昨夜、公式アカウントに「今日の飲み会サイコー」という投稿がありました。事実ですか？",
    },
  },
  {
    bar: 6,
    journalist: "economy",
    text: {
      ko: "이번 논란으로 주가가 14% 폭락했습니다. 주주들에게 드릴 말씀은?",
      en: "The stock crashed 14% over this scandal. Any words for shareholders?",
      ja: "この騒動で株価が14%暴落しました。株主の皆様に一言？",
    },
  },
  {
    bar: 10,
    journalist: "investigative",
    text: {
      ko: "내부 제보에 따르면 그 계정은 대표님 개인 계정이었다고 합니다. 맞습니까?",
      en: "A whistleblower says that was your personal account. Correct?",
      ja: "内部告発によると、あれは社長個人のアカウントだったそうですね？",
    },
  },
  {
    bar: 14,
    journalist: "veteran",
    text: {
      ko: "방금 전에는 \u201C담당 직원의 실수\u201D라고 하셨죠. 그 직원, 지금 이 자리에 있습니까?",
      en: "You just blamed \u201Ca staffer's mistake.\u201D Is that staffer here right now?",
      ja: "先ほど「担当社員のミス」とおっしゃいましたね。その社員は今ここにいますか？",
    },
  },
  {
    bar: 18,
    journalist: "boss",
    text: {
      ko: "자, 이제 솔직해지시죠. 인류는… 아니, 회사는 책임질 생각이 있습니까?",
      en: "Let's be honest now. Does humanity— I mean, the company intend to take responsibility?",
      ja: "さあ正直に。人類は…いえ、会社は責任を取る気がありますか？",
    },
  },
];

const BARS_STAGE2: Cell[][] = [
  [],
  [],
  // A · 인트로 그루브
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 1],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 2],
  ],
  // B · 홀드 + 90° 진입
  [
    [0, 0, 1],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 1],
    [3, 0],
  ],
  // C · 8분박자 몰아치기
  [
    [0, 1],
    [0.5, 0],
    [1, 2],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [1.5, 0],
    [2, 2],
    [3, 1],
  ],
  // D · 투명 웨이브
  [
    [0, 0, 0, "invisible"],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 1, 0, "invisible"],
    [1, 2, 0, "invisible"],
    [2, 0],
    [3, 1],
  ],
  // E · 가속 어썰트
  [
    [0, 2, 0, "speedUp"],
    [1, 1],
    [2, 3, 0, "speedUp"],
    [3, 2],
  ],
  [
    [0, 1, 0, "speedUp"],
    [1, 2, 0, "speedUp"],
    [2, 1],
    [3, 3],
  ],
  // F · 숨고르기 + 더블 홀드
  [
    [0, 3],
    [1, 1],
    [2, 2],
    [3, 0],
  ],
  [
    [0, 0, 2],
    [2, 3, 2],
  ],
  // G · 가짜 함정
  [
    [0, 1],
    [0.5, 2],
    [1, 0],
    [2, 1, 0, "fake"], // 치면 안되는 가짜 헛질문 기믹
    [3, 3],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 3],
    [3, 3],
  ],
  // H · 도게자 접근
  [
    [0, 3],
    [1, 2],
    [2, 1],
    [3, 0],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 3, 1],
    [3, 1],
  ],
  // I · 최종 러시
  [
    [0, 1],
    [0.5, 0],
    [1, 2],
    [1.5, 1],
    [2, 2],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 2],
    [0.5, 2],
    [1, 1],
    [2, 3],
    [3, 3, 1],
  ],
  // 마무리 도게자 + 아웃트로
  [
    [0, 3, 2],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 1],
    [3, 3],
  ],
];

const QUESTIONS_STAGE2_SPEC: QSpec[] = [
  {
    bar: 2,
    journalist: "investigative",
    text: {
      ko: "비자금 300억이 스위스 계좌로 흘러갔다는 정황이 포착됐습니다!",
      en: "30 billion in slush funds traced to a Swiss account!",
      ja: "裏金300億がスイスの口座に流れた疑いが浮上しました！",
    },
  },
  {
    bar: 8,
    journalist: "economy",
    text: {
      ko: "장중에 주가가 하한가 근처까지 밀렸습니다. 대책은 있습니까?",
      en: "The stock nearly hit rock bottom today. What's the plan?",
      ja: "株価がストップ安寸前まで売られました。対策はありますか？",
    },
  },
  {
    bar: 14,
    journalist: "veteran",
    text: {
      ko: "이건 단순한 실수가 아닙니다. 계획된 횡령 아닌가요?",
      en: "This was no accident. Planned embezzlement, wasn't it?",
      ja: "単なるミスではありません。計画的な横領では？",
    },
  },
  {
    bar: 18,
    journalist: "boss",
    text: {
      ko: "자, 최후통첩입니다. 횡령 혐의를 인정하십니까?",
      en: "Final warning. Do you admit the embezzlement charges?",
      ja: "さあ最後通告です。横領の容疑を認めますか？",
    },
  },
];

const BARS_STAGE3: Cell[][] = [
  [],
  [],
  // A · 채팅 워밍업
  [
    [0, 1],
    [0.5, 2],
    [1, 0],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 2, 1],
    [1.5, 1],
    [2, 2, 0, "speedUp"],
    [3, 3],
  ],
  [
    [0, 0, 0, "invisible"],
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 2],
  ],
  // B · 가짜 함정 + 홀드
  [
    [0, 3],
    [1, 2],
    [2, 1, 0, "fake"],
    [3, 2],
  ],
  [
    [0, 1, 2],
    [2, 2],
    [3, 3, 1],
  ],
  // C · 8분박자 채팅 러시
  [
    [0, 2],
    [0.5, 1],
    [1, 0],
    [1.5, 1],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 1],
    [1, 2, 0, "invisible"],
    [2, 1],
    [3, 0],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [2, 3],
    [3, 2],
  ],
  [
    [0, 3, 1],
    [2, 1],
    [3, 2],
  ],
  // D · 혼돈 구간
  [
    [0, 2, 0, "speedUp"],
    [1, 1],
    [2, 0, 0, "invisible"],
    [3, 3],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 3, 0, "fake"],
    [3, 1],
  ],
  [
    [0, 0, 2],
    [2, 2, 1],
    [3, 3],
  ],
  [
    [0, 3],
    [0.5, 2],
    [1, 1],
    [2, 0],
    [3, 1],
  ],
  // E · 심야 텐션 상승
  [
    [0, 2],
    [1, 1, 0, "invisible"],
    [2, 2, 0, "speedUp"],
    [3, 3],
  ],
  [
    [0, 1, 1],
    [1.5, 0],
    [2, 3],
    [3, 2],
  ],
  // F · 클라이맥스 러시
  [
    [0, 2],
    [0.5, 1],
    [1, 2],
    [1.5, 0],
    [2, 1],
    [2.5, 2],
    [3, 3],
  ],
  [
    [0, 3],
    [1, 3],
    [2, 2],
    [3, 1],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 2],
    [3, 3, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 3],
  ],
  // 아웃트로
  [
    [0, 3, 2],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 1],
    [3, 3],
  ],
];

const QUESTIONS_STAGE3_SPEC: QSpec[] = [
  {
    bar: 2,
    journalist: "internet",
    text: {
      ko: "실시간 채팅 2만 명이 보고 있습니다! 슈퍼챗 질문 갑니다!",
      en: "20,000 watching live! Superchat question incoming!",
      ja: "同時視聴2万人が見ています！スパチャ質問いきます！",
    },
  },
  {
    bar: 4,
    journalist: "investigative",
    text: {
      ko: "어젯밤 생방송에서 하신 발언, 기억하십니까? 클립이 돌고 있습니다.",
      en: "Remember what you said on last night's stream? The clip is viral.",
      ja: "昨夜の配信での発言、覚えていますか？切り抜きが出回っていますよ。",
    },
  },
  {
    bar: 6,
    journalist: "veteran",
    text: {
      ko: "접속자가 3만 명을 넘었습니다. 이쯤에서 진심을 보여주시죠?",
      en: "Viewers just passed 30,000. Time to show some sincerity?",
      ja: "視聴者が3万人を超えました。そろそろ本気を見せてください？",
    },
  },
  {
    bar: 14,
    journalist: "boss",
    text: {
      ko: "자, 마지막입니다. 생방송으로 사과하시죠. 전 국민이 봅니다.",
      en: "Last one. Apologize live. The whole nation is watching.",
      ja: "さあ最後です。生放送で謝罪してください。全国民が見ています。",
    },
  },
];

const BARS_STAGE4: Cell[][] = [
  [],
  [],
  // A · 폭로전 개시 (140BPM, 바로 8분박자)
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [2, 1],
    [2.5, 0],
    [3, 2],
  ],
  [
    [0, 2, 1],
    [1, 1],
    [1.5, 0],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 1],
    [0.5, 2],
    [1, 0, 0, "invisible"],
    [2, 1],
    [3, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [2.5, 1],
    [3, 3],
  ],
  // B · 홀드 압박
  [
    [0, 1, 2],
    [2, 2],
    [2.5, 1],
    [3, 0],
  ],
  [
    [0, 2, 0, "speedUp"],
    [1, 1],
    [1.5, 2],
    [2, 3],
    [3, 1],
  ],
  [
    [0, 0, 0, "invisible"],
    [0.5, 1],
    [1, 2],
    [2, 3, 0, "fake"],
    [3, 2],
  ],
  [
    [0, 3],
    [1, 2],
    [2, 1],
    [2.5, 0],
    [3, 3, 1],
  ],
  // C · 증인 러시
  [
    [0, 1],
    [0.5, 0],
    [1, 1],
    [1.5, 2],
    [2, 0],
    [2.5, 1],
    [3, 2],
  ],
  [
    [0, 2, 1],
    [1, 1, 0, "invisible"],
    [2, 2, 0, "speedUp"],
    [3, 3],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2],
    [1.5, 3],
    [2, 2],
    [3, 1],
  ],
  [
    [0, 3, 2],
    [2, 1],
    [2.5, 0],
    [3, 2],
  ],
  // D · 반격 구간
  [
    [0, 2, 0, "speedUp"],
    [0.5, 1],
    [1, 0, 0, "invisible"],
    [2, 2],
    [3, 3],
  ],
  [
    [0, 1],
    [1, 2],
    [2, 0, 0, "fake"],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 0, 2],
    [1, 1],
    [2, 2, 1],
    [3, 0],
  ],
  [
    [0, 3],
    [0.5, 2],
    [1, 1],
    [1.5, 0],
    [2, 2],
    [3, 3],
  ],
  // E · 최종 폭로 러시
  [
    [0, 1],
    [0.5, 2],
    [1, 0],
    [1.5, 1],
    [2, 3],
    [2.5, 2],
    [3, 3, 1],
  ],
  [
    [0, 3],
    [0.5, 3],
    [1, 2],
    [2, 1],
    [2.5, 0],
    [3, 3],
  ],
  [
    [0, 2],
    [1, 1],
    [1.5, 0],
    [2, 2],
    [3, 3, 2],
  ],
  [
    [0, 1],
    [0.5, 2],
    [1, 0],
    [2, 1],
    [3, 3],
  ],
  // 아웃트로
  [
    [0, 3, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
    [3, 3],
  ],
];

const QUESTIONS_STAGE4_SPEC: QSpec[] = [
  {
    bar: 2,
    journalist: "internet",
    text: {
      ko: "익명 게시판에 내부 문건이 올라왔습니다! 본인 작성 맞습니까?",
      en: "Leaked internal docs just hit the forums! Did you write these?",
      ja: "匿名掲示板に内部文書が出ました！あなたが書いたんですか？",
    },
  },
  {
    bar: 8,
    journalist: "investigative",
    text: {
      ko: "제보자가 실명으로 나서겠다고 합니다. 그래도 부인하시겠습니까?",
      en: "The whistleblower is going on record. Still denying?",
      ja: "告発者が実名で出ると言っています。それでも否定しますか？",
    },
  },
  {
    bar: 14,
    journalist: "veteran",
    text: {
      ko: "140BPM으로 몰아붙이겠습니다. 횡령 자금의 최종 행선지는?",
      en: "Coming at 140BPM. Where did the embezzled funds end up?",
      ja: "140BPMで攻めます。横領資金の最終的な行き先は？",
    },
  },
  {
    bar: 19,
    journalist: "boss",
    text: {
      ko: "증거는 충분합니다. 자백하시겠습니까, 파멸하시겠습니까?",
      en: "The evidence is complete. Confess, or be destroyed?",
      ja: "証拠は十分です。自白しますか、破滅しますか？",
    },
  },
];

const BARS_STAGE5: Cell[][] = [
  [],
  [],
  // A · 청문회 개시 (150BPM, 숨 돌릴 틈 없음)
  [
    [0, 3],
    [0.5, 2],
    [1, 1],
    [1.5, 0],
    [2, 1],
    [2.5, 2],
    [3, 3],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2, 1],
    [2, 1],
    [2.5, 0],
    [3, 2],
  ],
  [
    [0, 2, 0, "speedUp"],
    [0.5, 1],
    [1, 0, 0, "invisible"],
    [2, 2],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 1],
    [0.5, 2],
    [1, 3, 0, "fake"],
    [2, 2],
    [2.5, 1],
    [3, 0],
  ],
  // B · 선서 압박
  [
    [0, 0, 2],
    [1, 1],
    [1.5, 2],
    [2, 3],
    [2.5, 2],
    [3, 1],
  ],
  [
    [0, 2],
    [0.5, 1, 0, "invisible"],
    [1, 0],
    [1.5, 1],
    [2, 2, 0, "speedUp"],
    [2.5, 3],
    [3, 2],
  ],
  [
    [0, 3, 1],
    [1, 2],
    [1.5, 1],
    [2, 0, 0, "fake"],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 1],
    [0.5, 0],
    [1, 2],
    [1.5, 1],
    [2, 3],
    [2.5, 2],
    [3, 3, 1],
  ],
  // C · 전방위 심문
  [
    [0, 2, 0, "invisible"],
    [0.5, 1],
    [1, 0],
    [1.5, 2, 0, "speedUp"],
    [2, 1],
    [2.5, 3],
    [3, 2],
  ],
  [
    [0, 3],
    [0.5, 2],
    [1, 1, 2],
    [2, 0],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 0],
    [0.5, 1],
    [1, 2, 0, "fake"],
    [1.5, 3],
    [2, 2],
    [2.5, 1],
    [3, 0],
  ],
  [
    [0, 1, 0, "speedUp"],
    [0.5, 2],
    [1, 3],
    [1.5, 2, 0, "invisible"],
    [2, 1],
    [2.5, 0],
    [3, 3, 1],
  ],
  // D · 휴식 없는 추궁
  [
    [0, 2],
    [0.5, 1],
    [1, 0],
    [1.5, 1],
    [2, 2],
    [2.5, 3],
    [3, 3],
  ],
  [
    [0, 3, 2],
    [1, 2],
    [2, 1],
    [2.5, 0],
    [3, 1],
  ],
  [
    [0, 0, 0, "invisible"],
    [0.5, 1],
    [1, 2, 0, "speedUp"],
    [1.5, 3, 0, "fake"],
    [2, 2],
    [2.5, 1],
    [3, 0],
  ],
  [
    [0, 3],
    [0.5, 3],
    [1, 2],
    [1.5, 1],
    [2, 0],
    [2.5, 1],
    [3, 2],
  ],
  // E · 최종 심판 러시
  [
    [0, 2],
    [0.5, 1],
    [1, 0],
    [1.5, 2],
    [2, 3],
    [2.5, 1],
    [3, 3, 1],
  ],
  [
    [0, 3],
    [0.5, 2],
    [1, 1, 0, "invisible"],
    [1.5, 0],
    [2, 2, 0, "speedUp"],
    [2.5, 1],
    [3, 3],
  ],
  [
    [0, 1],
    [0.5, 0],
    [1, 2],
    [1.5, 3, 0, "fake"],
    [2, 2],
    [2.5, 1],
    [3, 0],
  ],
  [
    [0, 3],
    [0.5, 2],
    [1, 1],
    [1.5, 0],
    [2, 3],
    [2.5, 2],
    [3, 3, 2],
  ],
  // F · 판결
  [
    [0, 2],
    [0.5, 1],
    [1, 0],
    [1.5, 2],
    [2, 1],
    [2.5, 3],
    [3, 3],
  ],
  [
    [0, 3, 2],
  ],
  [
    [0, 1],
    [0.5, 2],
    [1, 0],
    [2, 1],
    [2.5, 2],
    [3, 3],
  ],
];

const QUESTIONS_STAGE5_SPEC: QSpec[] = [
  {
    bar: 2,
    journalist: "boss",
    text: {
      ko: "국민청문회를 시작합니다. 150BPM으로 묻겠습니다. 각오됐습니까?",
      en: "This national hearing is now open. 150BPM questions. Ready?",
      ja: "国民聴聞会を開きます。150BPMで問います。覚悟はいいですか？",
    },
  },
  {
    bar: 8,
    journalist: "investigative",
    text: {
      ko: "증인 12명, 증거 300쪽. 어디서부터 해명하시겠습니까?",
      en: "Twelve witnesses, 300 pages of evidence. Where will you begin?",
      ja: "証人12名、証拠300ページ。どこから釈明しますか？",
    },
  },
  {
    bar: 14,
    journalist: "veteran",
    text: {
      ko: "거짓말 탐지기가 가동 중입니다. 심박이 벌써 150이네요?",
      en: "The lie detector is on. Your heart is already at 150?",
      ja: "嘘発見器が作動中です。心拍数、もう150ですね？",
    },
  },
  {
    bar: 20,
    journalist: "boss",
    text: {
      ko: "최후진술입니다. 인류 앞에서, 마지막 사과를 하십시오!",
      en: "Final statement. Before all humanity — your last apology, NOW!",
      ja: "最終陳述です。人類の前で、最後の謝罪をどうぞ！",
    },
  },
];

const STAGE_META: Record<string, { title: Record<Lang, string>; subtitle: Record<Lang, string> }> = {
  stage2: {
    title: { ko: "STAGE 2 — 비자금 게이트", en: "STAGE 2 — Slush Fund Gate", ja: "STAGE 2 — 裏金ゲート" },
    subtitle: { ko: "숨겨진 기믹과 몰아치는 질문들", en: "Hidden gimmicks and rapid-fire questions", ja: "隠しギミックと怒涛の質問" },
  },
  stage3: {
    title: { ko: "STAGE 3 — 심야 생방송", en: "STAGE 3 — Midnight Livestream", ja: "STAGE 3 — 深夜生放送" },
    subtitle: { ko: "채팅 2만 명 앞에서의 속죄", en: "Atonement before 20,000 chatters", ja: "2万人の前での贖罪" },
  },
  stage4: {
    title: { ko: "STAGE 4 — 내부고발", en: "STAGE 4 — Whistleblower", ja: "STAGE 4 — 内部告発" },
    subtitle: { ko: "140BPM 폭로전", en: "140BPM exposé battle", ja: "140BPM暴露戦" },
  },
  stage5: {
    title: { ko: "STAGE 5 — 국민청문회", en: "STAGE 5 — National Hearing", ja: "STAGE 5 — 国民聴聞会" },
    subtitle: { ko: "150BPM 최종 심판", en: "150BPM final judgment", ja: "150BPM最終審判" },
  },
  stage1: {
    title: { ko: "STAGE 1 — 공식 계정 사고", en: "STAGE 1 — Official Account Incident", ja: "STAGE 1 — 公式アカウント事件" },
    subtitle: { ko: "SNS 실수부터 인류의 책임까지", en: "From an SNS slip to humanity's burden", ja: "SNSのミスから人類の責任まで" },
  },
};

const BARS_BY_STAGE: Record<string, Cell[][]> = {
  stage1: BARS,
  stage2: BARS_STAGE2,
  stage3: BARS_STAGE3,
  stage4: BARS_STAGE4,
  stage5: BARS_STAGE5,
};

const QUESTIONS_BY_STAGE: Record<string, QSpec[]> = {
  stage1: QUESTIONS_SPEC,
  stage2: QUESTIONS_STAGE2_SPEC,
  stage3: QUESTIONS_STAGE3_SPEC,
  stage4: QUESTIONS_STAGE4_SPEC,
  stage5: QUESTIONS_STAGE5_SPEC,
};

export function buildChart(stageId: string = "stage1", lang: Lang = "ko"): Chart {
  if (stageId === "daily" || stageId.startsWith("daily:")) {
    const key = stageId.includes(":") ? stageId.split(":")[1] : getDailyKey();
    return buildDailyChart(key, lang);
  }
  const notes: Note[] = [];
  const bpm = bpmForStage(stageId);
  const beatDur = 60 / bpm;
  const bars = BARS_BY_STAGE[stageId] ?? BARS;
  const specs = QUESTIONS_BY_STAGE[stageId] ?? QUESTIONS_SPEC;
  const questions = toEvents(specs, lang, beatDur);

  bars.forEach((cells, bar) => {
    for (const [beat, lane, hold = 0, gimmick] of cells) {
      notes.push(makeNote(bar, beat, lane, beatDur, hold, gimmick));
    }
  });

  const last = notes[notes.length - 1] || notes[0];
  const duration = last ? last.time + Math.max(last.hold, 0) + 2.4 : 10;
  const meta = STAGE_META[stageId] ?? STAGE_META.stage1;

  return {
    title: meta.title[lang],
    subtitle: meta.subtitle[lang],
    bpm,
    notes,
    questions,
    duration,
    version: 2,
  };
}
