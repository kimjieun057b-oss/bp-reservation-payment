// 고객용 헤더 내비게이션 - 예약/객실 페이지를 만들면 여기에 항목을 추가한다.
// 예: room: { title: "ROOM" }, reservation: { title: "RESERVATION", categories: [...] }
export const USER_CATEGORY : { [key: string]: { title: string; categories?: {name: string, url: string}[], banner?: string } } = {
    rooms: { title: "객실안내" },
    guide: { title: "이용안내" },
    "reservation-guide": { title: "예약안내" },
    reserve: { title: "실시간예약" },
    "my-reservations": { title: "예약조회" },
}

// 관리자 사이드바 내비게이션 - 관리자 페이지를 만들면 여기에 항목을 추가한다.
// 예: reservation: { title: "예약 관리", categories: [{ name: "예약 리스트", url: "list" }] }
export const ADMIN_CATEGORY : { [key: string]: { title: string; categories?: {name: string, url: string}[], banner?: string }} = {
    dashboard: {title: "대시보드"},
    reservations: {title: "예약 관리"},
    room_types: {title: "객실 관리"},
}
