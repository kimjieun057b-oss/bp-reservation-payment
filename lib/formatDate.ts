const pad = (n: number) => String(n).padStart(2, "0");

// date 컬럼(check_in/check_out) 전용. timestamptz 값에는 쓰지 말 것 - 로컬 자정 근처에서
// 문자열 슬라이스만으로는 하루가 어긋날 수 있다(formatLocalDate 참고).
export const formatDateOnly = (value: string) => value.slice(0, 10).replaceAll("-", ".");

// timestamptz 컬럼(created_at 등) 전용. 문자열을 그대로 자르면 UTC 기준 날짜가 나와
// 로컬 자정 근처에서 하루가 어긋날 수 있어, Date 객체의 로컬 getter로 변환한다.
export const formatLocalDate = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
};

// timestamptz 컬럼(checked_in_at/checked_out_at 등)의 시:분.
export const formatLocalTime = (value: string) => {
    const date = new Date(value);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
