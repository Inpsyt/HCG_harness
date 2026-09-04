// eslint-config-next 16 은 flat-config 네이티브 — FlatCompat(@eslint/eslintrc) 경유는 깨진다
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  // prisma generate 산출물 — 린트 대상이 아니다
  { ignores: ["lib/generated/"] },
  ...nextVitals,
  ...nextTs,
];

export default eslintConfig;
