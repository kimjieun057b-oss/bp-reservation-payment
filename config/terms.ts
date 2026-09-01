// 업종별로 달라지는 용어를 한 곳에서 관리한다.
// 캠핑장 -> "사이트", 펜션/풀빌라 -> "객실" 처럼 UNIT_LABEL 값만 바꾸면
// 이 상수를 참조하는 모든 화면/메시지에 그대로 반영된다.
export const UNIT_LABEL = "객실";

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

function hasBatchim(word: string): boolean {
    const lastChar = word.charCodeAt(word.length - 1);
    if (lastChar < HANGUL_BASE || lastChar > HANGUL_LAST) return false;
    return (lastChar - HANGUL_BASE) % 28 !== 0;
}

// 받침 유무에 따라 조사를 자동으로 골라 붙인다.
// 예: josa(UNIT_LABEL, "을", "를") -> UNIT_LABEL이 "객실"이면 "객실을", "사이트"면 "사이트를"
export function josa(word: string, withBatchim: string, withoutBatchim: string) {
    return word + (hasBatchim(word) ? withBatchim : withoutBatchim);
}
