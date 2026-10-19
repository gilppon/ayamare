/**
 * 채보 JSON 자산 재생성기.
 *
 * D 작업에서 `chart.ts` 의 하드코딩 데이터를 `src/game/charts/*.json` 으로 옮겼다.
 * 이 스크립트는 그 분리의 **역방향**이다 — canonical 데이터는 여전히 이전 커밋의
 * `chart.ts` 안에 있고, 여기서 JSON 을 다시 만들어 낸다.
 *
 * 언제 쓰나:
 *   - JSON 이 손상됐을 때 복구
 *   - 이전 커밋의 채보를 다시 가져오고 싶을 때
 *   - 다른 리팩터링 전 데이터 스냅샷을 만들 때
 *
 * ⚠️ 이 스크립트는 **쓰기 전용**이다. 정상적인 채보 수정은 JSON 을 직접 고치고
 * `chartMigration.test.ts` 가 무손실인지 검증하게 한다. JSON 을 이 스크립트로
 * 덮어쓰면 현재 코드에서 고친 내용이 사라진다.
 *
 * 실행: node scripts/extract-charts.mjs [기준 커밋] [--check]
 *   --check 는 파일을 쓰지 않고 현재 JSON 이 기준 커밋과 같은지만 비교한다 (CI 용)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
// `--check` 는 플래그이므로 ref 인자에서 제외한다 (위치에 상관없이)
const REF = args.find((a) => !a.startsWith("--")) ?? "2802392"; // 데이터 하드코딩 시대의 커밋

const STAGES = ["stage1", "stage2", "stage3", "stage4", "stage5"];
const BARS_NAMES = ["BARS", "BARS_STAGE2", "BARS_STAGE3", "BARS_STAGE4", "BARS_STAGE5"];
const Q_NAMES = [
  "QUESTIONS_SPEC",
  "QUESTIONS_STAGE2_SPEC",
  "QUESTIONS_STAGE3_SPEC",
  "QUESTIONS_STAGE4_SPEC",
  "QUESTIONS_STAGE5_SPEC",
];

const src = execFileSync("git", ["show", `${REF}:src/game/chart.ts`], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "ignore"],
});

/** `const NAME: T = [ ... ];` 를 괄호 균형으로 잘라낸다 (문자열 안 괄호는 무시) */
function extractConst(name) {
  const m = new RegExp(`^const ${name}(?::[^=]+)? = `, "m").exec(src);
  if (!m) throw new Error(`${REF} 에서 못 찾음: ${name}`);
  const start = src.indexOf("=", m.index) + 1;
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`괄호 불일치: ${name}`);
}

// 이전 chart.ts 의 리터럴은 순수 데이터라 평가해도 부작용이 없다.
const literal = (name) => new Function(`return ${extractConst(name)}`)();

const meta = literal("STAGE_META");
const outDir = join(root, "src/game/charts");

if (!CHECK_ONLY) mkdirSync(outDir, { recursive: true });

let drift = 0;
for (let i = 0; i < STAGES.length; i++) {
  const id = STAGES[i];
  const payload = {
    bars: literal(BARS_NAMES[i]),
    questions: literal(Q_NAMES[i]),
    meta: meta[id],
  };
  const json = JSON.stringify(payload, null, 2) + "\n";
  const path = join(outDir, `${id}.json`);

  if (CHECK_ONLY) {
    const current = readFileSync(path, "utf8");
    if (current !== json) {
      console.error(`✗ ${id}.json 이 ${REF} 와 다르다`);
      drift++;
    }
  } else {
    writeFileSync(path, json, "utf8");
    console.log(`${id}.json  bars=${payload.bars.length} questions=${payload.questions.length}`);
  }
}

if (CHECK_ONLY) {
  if (drift) {
    console.error(`\n${drift}개 자산이 ${REF} 와 불일치`);
    process.exit(1);
  }
  console.log(`OK — 5개 자산 모두 ${REF} 와 동일`);
}