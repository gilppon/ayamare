import {memo} from 'react';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Vintage Editorial Cartoon Style Manager Kim (빈티지 신문 풍자 만평 스타일 김부장)
 * 1번 시안의 땀 뻘뻘 흘리는 처절한 중년 부장 캐릭터를 디테일한 잉크 펜화 & 해칭으로 완벽 재현
 * NOTE: 매 프레임 angle이 바뀌므로 정적 아트워크는 memo로 분리해
 * 프레임당 리컨실리이를 transform 속성 2개로 제한한다.
 */

const EditorialHead = memo(function EditorialHead() {
  return (
    <g id="manager-kim-head">
      {/* 귀 (좌/우) */}
      <path d="M-52-168 C-68-175 -66-140 -50-145 Z" fill="#e8cfad" stroke="#231f20" strokeWidth="3" strokeLinejoin="round" />
      <path d="M-58-162 C-63-158 -61-149 -53-150" fill="none" stroke="#684f3c" strokeWidth="2" />
      <path d="M48-168 C64-175 62-140 46-145 Z" fill="#e8cfad" stroke="#231f20" strokeWidth="3" strokeLinejoin="round" />
      <path d="M54-162 C59-158 57-149 49-150" fill="none" stroke="#684f3c" strokeWidth="2" />

      {/* 목 & 목주름 */}
      <path d="M-22-118 L-25-88 L25-88 L22-118 Z" fill="#dbbe98" stroke="#231f20" strokeWidth="3" />
      {/* 목 해칭 음영 */}
      <path d="M-18-106 L-10-92 M-10-108 L-2-94 M-2-108 L6-94 M6-106 L14-92 M-15-97 L15-97" stroke="#8d6e53" strokeWidth="1.8" fill="none" />

      {/* 거대한 얼굴 윤곽 (처진 볼살, 턱밑살) */}
      <path
        d="M-50-175 C-56-218 -25-242 0-242 C25-242 56-218 50-175 C52-152 48-132 38-118 C28-104 15-98 0-98 C-15-98 -28-104 -38-118 C-48-132 -52-152 -50-175 Z"
        fill="#edd3b2"
        stroke="#231f20"
        strokeWidth="3.8"
        strokeLinejoin="round"
      />

      {/* 턱밑살 이중턱 라인 */}
      <path d="M-28-110 C-14-103 14-103 28-110" fill="none" stroke="#231f20" strokeWidth="2.5" />
      <path d="M-20-104 C-10-100 10-100 20-104" fill="none" stroke="#997357" strokeWidth="1.8" />

      {/* 듬성듬성 벗겨진 잔머리 & 젖어서 달라붙은 앞머리 가닥들 */}
      {/* 정수리 숱 없는 빗어넘긴 머리 베이스 */}
      <path
        d="M-48-185 C-55-225 -20-246 0-246 C20-246 55-225 48-185 C44-205 28-228 0-230 C-28-228 -44-205 -48-185 Z"
        fill="#2a2723"
        stroke="#1a1816"
        strokeWidth="2"
      />
      {/* 머리칼 해칭 스트로크 */}
      <path d="M-40-205 C-25-236 0-238 25-235 M-35-215 C-20-240 5-241 35-230 M-45-195 C-30-220 -10-230 10-232" fill="none" stroke="#3d3732" strokeWidth="2.5" />
      {/* 이마에 땀으로 찰싹 달라붙은 구불구불한 4가닥 앞머리 */}
      <path d="M-22-230 C-20-210 -30-198 -32-182 C-33-176 -29-178 -28-185 C-26-196 -16-208 -18-228" fill="#24211e" stroke="#161413" strokeWidth="1.5" />
      <path d="M-8-232 C-6-212 -12-198 -10-184 C-9-178 -6-180 -7-187 C-8-198 -2-212 -4-230" fill="#24211e" stroke="#161413" strokeWidth="1.5" />
      <path d="M8-232 C10-210 4-196 6-180 C7-175 10-176 9-183 C8-196 14-210 12-230" fill="#24211e" stroke="#161413" strokeWidth="1.5" />
      <path d="M24-228 C28-208 20-195 24-180 C25-174 29-176 27-184 C24-196 32-208 30-225" fill="#24211e" stroke="#161413" strokeWidth="1.5" />

      {/* 이마의 깊은 3단 주름 */}
      <path d="M-36-204 C-15-212 15-212 36-204" fill="none" stroke="#231f20" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-32-194 C-12-201 12-201 32-194" fill="none" stroke="#231f20" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-26-184 C-10-190 10-190 26-184" fill="none" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      {/* 이마 잔주름 해칭 */}
      <path d="M-20-200 L-16-196 M-5-200 L-1-196 M10-200 L14-196 M-12-190 L-8-186 M3-190 L7-186" stroke="#997558" strokeWidth="1.4" fill="none" />

      {/* 미간 찌푸림 주름 (내천자 川) */}
      <path d="M-8-176 C-10-164 -5-156 -6-150" fill="none" stroke="#231f20" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-1-178 C-2-165 -1-158 -1-150" fill="none" stroke="#231f20" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M6-176 C8-164 5-156 6-150" fill="none" stroke="#231f20" strokeWidth="2.2" strokeLinecap="round" />

      {/* 억울하고 처량한 팔자 눈썹 (굵은 잉크 터치) */}
      <path d="M-36-160 C-26-175 -8-172 -6-164" fill="none" stroke="#231f20" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M-34-162 C-25-173 -9-170 -7-163" fill="none" stroke="#483f36" strokeWidth="2" strokeLinecap="round" />
      <path d="M36-160 C26-175 8-172 6-164" fill="none" stroke="#231f20" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M34-162 C25-173 9-170 7-163" fill="none" stroke="#483f36" strokeWidth="2" strokeLinecap="round" />

      {/* 퀭한 다크서클 & 눈두덩이 그늘 */}
      <ellipse cx="-20" cy="-148" rx="16" ry="12" fill="#cca683" opacity="0.65" />
      <ellipse cx="20" cy="-148" rx="16" ry="12" fill="#cca683" opacity="0.65" />
      {/* 눈 밑 애교살 & 짙은 피로 주름 */}
      <path d="M-34-142 C-24-135 -14-136 -7-142" fill="none" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <path d="M-30-138 C-22-132 -14-133 -9-138" fill="none" stroke="#8d684d" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M34-142 C24-135 14-136 7-142" fill="none" stroke="#231f20" strokeWidth="2" strokeLinecap="round" />
      <path d="M30-138 C22-132 14-133 9-138" fill="none" stroke="#8d684d" strokeWidth="1.5" strokeLinecap="round" />

      {/* 눈동자 (공포에 질려 위로 치켜뜬 불안한 눈) */}
      <ellipse cx="-20" cy="-150" rx="11" ry="8.5" fill="#faf5eb" stroke="#231f20" strokeWidth="2.5" />
      <ellipse cx="20" cy="-150" rx="11" ry="8.5" fill="#faf5eb" stroke="#231f20" strokeWidth="2.5" />
      {/* 작게 수축된 떨리는 동공 & 동태눈빛 */}
      <ellipse cx="-19" cy="-152" rx="4" ry="4" fill="#201d1a" />
      <circle cx="-20.5" cy="-153.5" r="1.2" fill="#ffffff" />
      <ellipse cx="19" cy="-152" rx="4" ry="4" fill="#201d1a" />
      <circle cx="17.5" cy="-153.5" r="1.2" fill="#ffffff" />
      {/* 눈가 까마귀발 잔주름 */}
      <path d="M-32-152 L-40-155 M-33-148 L-41-147 M-31-144 L-38-140" stroke="#7a583e" strokeWidth="1.6" fill="none" />
      <path d="M32-152 L40-155 M33-148 L41-147 M31-144 L38-140" stroke="#7a583e" strokeWidth="1.6" fill="none" />

      {/* 뭉툭하고 빨개진 코 & 콧망울 */}
      <path
        d="M-3-156 C-2-142 -5-132 -9-128 C-13-124 -11-118 -2-118 C3-118 6-118 10-120 C14-123 11-127 8-129 C4-132 3-142 3-156 Z"
        fill="#e59f8a"
        stroke="#231f20"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* 콧구멍 & 코 음영 */}
      <ellipse cx="-4" cy="-122" rx="2.5" ry="1.8" fill="#5c3427" />
      <ellipse cx="4" cy="-122" rx="2.5" ry="1.8" fill="#5c3427" />
      <path d="M-7-126 C-4-124 4-124 7-126" fill="none" stroke="#231f20" strokeWidth="1.8" />

      {/* 깊게 패인 팔자주름 (볼처짐) */}
      <path d="M-17-130 C-26-124 -30-112 -28-98" fill="none" stroke="#231f20" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M-19-126 C-28-120 -31-108 -29-96" fill="none" stroke="#997558" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17-130 C26-124 30-112 28-98" fill="none" stroke="#231f20" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19-126 C28-120 31-108 29-96" fill="none" stroke="#997558" strokeWidth="1.5" strokeLinecap="round" />

      {/* 덜덜 떨리는 삐뚤어진 입술 (사과 직전의 비애) */}
      <path
        d="M-18-108 C-10-114 10-114 18-108 C14-102 6-100 0-100 C-6-100 -14-102 -18-108 Z"
        fill="#4a221b"
        stroke="#231f20"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      {/* 아랫입술 그림자 */}
      <path d="M-12-96 C-5-94 5-94 12-96" fill="none" stroke="#754b38" strokeWidth="2" strokeLinecap="round" />
      {/* 입안 굳게 다문 이빨 살짝 노출 */}
      <path d="M-11-107 C-4-109 4-109 11-107" stroke="#e8dfce" strokeWidth="2.5" fill="none" />

      {/* 볼의 펜화 해칭 음영 (Vintage Hatching) */}
      <path d="M-42-140 L-35-132 M-43-134 L-36-126 M-44-128 L-37-120 M-40-122 L-33-114" stroke="#a47d5e" strokeWidth="1.4" fill="none" />
      <path d="M42-140 L35-132 M43-134 L36-126 M44-128 L37-120 M40-122 L33-114" stroke="#a47d5e" strokeWidth="1.4" fill="none" />

      {/* 💦 비오듯 쏟아지는 입체 식은땀 방울들 (1번 이미지의 핵심!) */}
      {/* 이마 땀방울 1 */}
      <path d="M-30-220 C-36-212 -33-202 -28-202 C-23-202 -20-212 -26-220 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.6" />
      <circle cx="-29" cy="-205" r="1.2" fill="#ffffff" />
      {/* 이마 땀방울 2 */}
      <path d="M18-222 C12-214 15-204 20-204 C25-204 28-214 22-222 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.6" />
      <circle cx="19" cy="-207" r="1.2" fill="#ffffff" />
      {/* 이마 정중앙 땀방울 3 */}
      <path d="M-3-214 C-7-208 -5-200 -1-200 C3-200 5-208 1-214 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.4" />
      <circle cx="-2" cy="-203" r="0.9" fill="#ffffff" />

      {/* 관자놀이 흘러내리는 땀방울 4 */}
      <path d="M-46-172 C-53-162 -49-152 -43-152 C-37-152 -33-162 -40-172 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.8" />
      <circle cx="-44" cy="-155" r="1.4" fill="#ffffff" />
      {/* 오른쪽 관자놀이 땀방울 5 */}
      <path d="M46-172 C40-162 44-152 50-152 C56-152 60-162 53-172 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.8" />
      <circle cx="49" cy="-155" r="1.4" fill="#ffffff" />

      {/* 볼에서 뚝뚝 떨어지는 굵은 땀방울 6, 7 */}
      <path d="M-36-126 C-43-116 -40-106 -33-106 C-27-106 -24-116 -30-126 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.8" />
      <circle cx="-34" cy="-109" r="1.4" fill="#ffffff" />
      <path d="M38-124 C31-114 34-104 41-104 C47-104 51-114 44-124 Z" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1.8" />
      <circle cx="40" cy="-107" r="1.4" fill="#ffffff" />

      {/* 공중에 튀는 잔여 땀방울 스플래시 */}
      <path d="M-60-180 C-66-175 -64-168 -59-168 C-54-168 -52-175 -57-180 Z" fill="#9de2f5" stroke="#25758c" strokeWidth="1.3" />
      <path d="M60-178 C54-173 56-166 61-166 C66-166 68-173 63-178 Z" fill="#9de2f5" stroke="#25758c" strokeWidth="1.3" />
      <circle cx="-56" cy="-136" r="2.2" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1" />
      <circle cx="56" cy="-134" r="2.2" fill="#8ad4eb" stroke="#1d647a" strokeWidth="1" />
    </g>
  );
});

const EditorialTorso = memo(function EditorialTorso() {
  return (
    <g id="manager-kim-torso" stroke="#231f20" strokeLinejoin="round" strokeLinecap="round">
      {/* 양복 자켓 본체 (구겨진 짙은 네이비/차콜) */}
      <path
        d="M-42 6 L-52-78 C-50-98 -24-106 -12-106 L16-106 C38-98 48-78 46-52 L36 6 Z"
        fill="#2e3a47"
        strokeWidth="3.8"
      />

      {/* 자켓 주름 해칭 텍스처 */}
      <path d="M-46-60 L-34-48 M-48-46 L-36-34 M-45-32 L-35-20 M-40-16 L-32-6" stroke="#1c242c" strokeWidth="2.2" fill="none" />
      <path d="M42-50 L30-40 M40-36 L28-26 M36-22 L26-14 M32-8 L24-2" stroke="#1c242c" strokeWidth="2.2" fill="none" />

      {/* 땀에 젖어 깃이 꺾인 와이셔츠 */}
      <path d="M-15-106 L0-50 L18-106" fill="#f4ebd9" strokeWidth="2.8" />
      <path d="M-4-75 L0-50 L4-75" stroke="#a29580" strokeWidth="1.8" fill="none" />

      {/* 비뚤어지고 구겨진 와인색 넥타이 */}
      <path
        d="M-2-104 L8-100 L4-88 L14-48 L3-36 L-6-48 L-1-88 L-6-100 Z"
        fill="#99382e"
        strokeWidth="2.6"
      />
      {/* 넥타이 주름선 */}
      <path d="M-1-84 L6-76 M1-68 L9-60 M-3-52 L5-44" stroke="#5c201a" strokeWidth="1.8" fill="none" />

      {/* 양복 라펠(깃) & 음영 */}
      <path d="M-26-106 L-32-74 L-15-68 L-24-54 L0-32 L12-84" fill="#3b4856" strokeWidth="3" />
      <path d="M26-102 L36-76 L22-68 L32-56 L0-32" fill="#3b4856" strokeWidth="3" />

      {/* 삐딱하게 달린 사원증 (공백의 사원증) */}
      <path d="M-34-62 L-14-62 L-14-36 L-34-36 Z" fill="#e8dfce" strokeWidth="2.2" />
      <path d="M-28-36 L-20-36 L-20-62 L-28-62" fill="#d1c5b0" stroke="none" />
      <path d="M-24-68 L-24-62" stroke="#5a564c" strokeWidth="2.4" />
      {/* 사원증 릴 클립 */}
      <ellipse cx="-24" cy="-70" rx="3.5" ry="2.5" fill="#4d535e" strokeWidth="1.2" />

      {/* 마이크를 양손으로 꼭 쥐고 있는 팔과 손 (불안에 떠는 자세) */}
      {/* 왼팔 (자켓 소매) */}
      <path d="M-36-48 L-42-20 L-10-10 L-6-24 L-26-34 L-20-64 Z" fill="#34414f" strokeWidth="3" />
      <path d="M-38-34 L-28-28 M-36-22 L-26-18" stroke="#1f2730" strokeWidth="2" fill="none" />
      {/* 오른팔 (자켓 소매) */}
      <path d="M34-62 L44-28 L24-12 L18-24 L28-38 L18-58 Z" fill="#313e4b" strokeWidth="3" />
      <path d="M38-42 L28-34 M34-28 L26-22" stroke="#1f2730" strokeWidth="2" fill="none" />

      {/* 땀에 젖어 꽉 쥔 두 손 */}
      <path d="M-8-26 C8-36 18-26 22-16 L12-8 L-8-12 Z" fill="#dbbe98" strokeWidth="2.6" />
      <path d="M-2-20 L8-16 M-1-14 L9-10 M12-22 L18-14" stroke="#8d6e53" strokeWidth="1.8" fill="none" />

      {/* 🎙️ 쥐고 있는 마이크 헤드 & 본체 (디테일한 펜화) */}
      {/* 마이크 손잡이 */}
      <path d="M6-24 L16-64 L26-60 L16-20 Z" fill="#2a2e33" strokeWidth="2.6" />
      {/* 마이크 헤드 (철망 그릴) */}
      <ellipse cx="21" cy="-72" rx="10" ry="14" fill="#586361" strokeWidth="2.6" transform="rotate(15 21 -72)" />
      {/* 마이크 그릴 메쉬 격자 해칭 */}
      <path d="M14-78 L28-74 M13-73 L27-69 M15-67 L26-64" stroke="#a3aba8" strokeWidth="1.5" />
      <path d="M17-82 L24-64 M21-82 L27-66" stroke="#a3aba8" strokeWidth="1.5" />

      {/* 마이크 케이블 (아래로 꼬이며 늘어짐) */}
      <path d="M9-16 Q-22 30 24 50 Q56 70 8 92" fill="none" stroke="#1a1c1e" strokeWidth="2.8" />
    </g>
  );
});

const EditorialLegs = memo(function EditorialLegs({dogeza = false}: {dogeza?: boolean}) {
  if (dogeza) {
    return (
      <g id="manager-kim-dogeza-legs" stroke="#231f20" strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
        {/* 바닥에 엎드려 꿇은 양복 바지와 무릎 */}
        <path d="M-36-8 L-82 24 L-12 38 L36 18 L24-6 Z" fill="#28333e" />
        {/* 바지 주름 해칭 */}
        <path d="M-60 14 L-48 22 M-48 8 L-36 18 M-34 2 L-22 14" stroke="#161c22" strokeWidth="2.2" fill="none" />
        {/* 바닥에 꺾인 구두 뒷축과 발바닥 */}
        <path d="M-80 22 L-106 14 L-110 28 L-80 38 L-60 34 Z" fill="#1c1e20" />
        <path d="M-102 18 L-84 26" stroke="#484f54" strokeWidth="2" fill="none" />
        {/* 바닥에 짓이겨진 양말 */}
        <path d="M-78 30 L-68 34" stroke="#8a7962" strokeWidth="3" fill="none" />
      </g>
    );
  }

  return (
    <g id="manager-kim-standing-legs" stroke="#231f20" strokeWidth="3.8" strokeLinejoin="round" strokeLinecap="round">
      {/* 주눅 들어 모아선 쭈글쭈글한 양복 바지 다리 */}
      <path
        d="M-32 0 L-36 44 L-30 82 L-8 84 L-2 40 L6 84 L28 84 L36 38 L30 0 Z"
        fill="#2b3642"
      />
      {/* 무릎과 정강이 주름 해칭 */}
      <path d="M-30 28 L-16 36 M-28 44 L-14 52 M-26 60 L-12 66" stroke="#171e25" strokeWidth="2" fill="none" />
      <path d="M26 26 L12 34 M24 42 L10 50 M22 58 L8 64" stroke="#171e25" strokeWidth="2" fill="none" />

      {/* 짝짝이 양말 노출 (처량한 디테일) */}
      <path d="M-28 80 L-28 92 L-9 92 L-9 80" fill="#9c8a6f" strokeWidth="2" />
      <path d="M8 81 L9 93 L28 93 L27 81" fill="#4d7370" strokeWidth="2" />

      {/* 낡아서 광택 죽은 검정 구두 */}
      <path d="M-29 90 L-42 98 C-40 108 -6 105 -7 90 Z" fill="#1e2124" />
      <path d="M9 91 L8 104 C48 108 50 99 28 91 Z" fill="#1e2124" />
      <path d="M-36 96 C-24 94 -16 93 -10 93" stroke="#525b63" strokeWidth="1.8" fill="none" />
      <path d="M12 94 C20 94 30 95 40 98" stroke="#525b63" strokeWidth="1.8" fill="none" />
    </g>
  );
});

export default memo(function ManagerKim({
  angle = 0,
  dogeza = false,
  debug = false,
  target = 45,
  ghost = false,
}: {
  angle?: number;
  dogeza?: boolean;
  debug?: boolean;
  target?: number;
  ghost?: boolean;
}) {
  const pose = dogeza ? 108 : angle;
  const lang = useSettingsStore((s) => s.lang);
  const ariaLabel =
    lang === "ko"
      ? `김부장 ${dogeza ? "도게자" : `${Math.round(angle)}도 사과`} 자세`
      : lang === "en"
      ? `Manager Kim, ${dogeza ? "dogeza" : `${Math.round(angle)}-degree apology`} pose`
      : `金部長、${dogeza ? "土下座" : `${Math.round(angle)}度謝罪`}ポーズ`;

  return (
    <svg
      className={'manager-kim ' + (ghost ? 'ghost-kim' : '')}
      viewBox="0 0 600 450"
      role="img"
      aria-label={ariaLabel}
    >
      {/* 바닥 그림자 (처량하게 드리워진 그림자) */}
      <ellipse
        cx="284"
        cy="394"
        rx={dogeza ? 116 : 80}
        ry={12}
        fill="#26231c"
        opacity="0.32"
      />

      {/* 캐릭터 본체 (루트 골반 기준 렌더링).
          NOTE: 구버전의 빈티지 필터(url(#) 누락으로 미적용되던 데드코드)는 제거.
          회전 transform만 매 프레임 갱신되고 아트워크는 memo로 고정된다. */}
      <g transform={`translate(260 ${dogeza ? 344 : 291})`}>
        {/* 하체 */}
        <EditorialLegs dogeza={dogeza} />

        {/* 상체 (각도에 따라 정밀 회전) */}
        <g transform={`rotate(${pose})`}>
          <EditorialTorso />
          <EditorialHead />
        </g>

        {/* 디버그 오버레이 */}
        {debug && (
          <g fill="none" strokeWidth="2">
            <path d="M0 30V-250" stroke="#db4e3e" strokeDasharray="7 5" />
            <path d="M0 0V-230" transform={`rotate(${pose})`} stroke="#3ce0cb" />
            <path d="M0 0V-220" transform={`rotate(${target})`} stroke="#efc447" strokeDasharray="5 5" />
            <circle r="9" fill="#df4634" stroke="#fff" />
            <rect x="-60" y="-230" width="118" height="135" transform={`rotate(${pose})`} stroke="#66dcba" strokeDasharray="5 4" />
            <text x="-145" y="-230" fill="#fff" stroke="none" fontSize="16">
              골반 기준 {Math.round(pose)}° / 목표 {target}° ±4°
            </text>
          </g>
        )}
      </g>
    </svg>
  );
});
