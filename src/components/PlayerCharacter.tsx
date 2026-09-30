import ManagerKim from "./ManagerKim";

interface PlayerCharacterProps {
  angle: number;
  dogeza: boolean;
  anger: number;
}

export default function PlayerCharacter({
  angle,
  dogeza,
  anger,
}: PlayerCharacterProps) {
  const sweating = anger >= 70;

  return (
    <div className={`relative h-full w-full select-none ${sweating ? "kim-nervous" : ""}`}>
      <ManagerKim
        angle={angle}
        dogeza={dogeza}
      />
      {sweating && (
        <div className="pointer-events-none absolute -top-3 right-8 animate-bounce text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          💦
        </div>
      )}
    </div>
  );
}
