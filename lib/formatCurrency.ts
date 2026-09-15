// 여러 컴포넌트에 흩어져 있던 `n.toLocaleString() + '원'` 포맷을 한 곳으로 모은다.
// null/undefined는 0원으로 취급해 호출부의 `?? 0` 방어 코드를 없앤다.
export function formatWon(amount: number | null | undefined): string {
    return `${(amount ?? 0).toLocaleString()}원`;
}
