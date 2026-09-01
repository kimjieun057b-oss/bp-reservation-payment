// 고객용 헤더 내비게이션 - 예약/객실 페이지를 만들면 여기에 항목을 추가한다.
// 예: room: { title: "ROOM" }, reservation: { title: "RESERVATION", categories: [...] }
export const USER_CATEGORY : { [key: string]: { title: string; categories?: {name: string, url: string}[], banner?: string } } = {
}

// 관리자 사이드바 내비게이션 - 관리자 페이지를 만들면 여기에 항목을 추가한다.
// 예: reservation: { title: "예약 관리", categories: [{ name: "예약 리스트", url: "list" }] }
export const ADMIN_CATEGORY : { [key: string]: { title: string; categories?: {name: string, url: string}[], banner?: string }} = {
}
