import { memo } from "react";
import ManagerKim, { type ManagerKimHandle } from "./ManagerKim";

interface PlayerCharacterProps {
  /**
   * P-01: 포즈 각도는 더 이상 prop 이 아니다.
   * 게임 루프가 `ref.setPose(angle, dogeza)` 로 회전만 직접 갱신하므로
   * 이 컴포넌트와 100여 개 SVG path 는 리렌더되지 않는다.
   */
  kimRef: React.Ref<ManagerKimHandle>;
  dogeza: boolean;
  anger: number;
}

export default memo(function PlayerCharacter({
  kimRef,
  dogeza,
  anger,
}: PlayerCharacterProps) {
  const sweating = anger >= 70;

  return (
    <div className={`relative h-full w-full select-none ${sweating ? "kim-nervous" : ""}`}>
      <ManagerKim ref={kimRef} dogeza={dogeza} />
      {sweating && (
        <div className="pointer-events-none absolute -top-3 right-8 animate-bounce text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          💦
        </div>
      )}
    </div>
  );
});
