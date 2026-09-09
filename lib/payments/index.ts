export * from "./PaymentProvider";
// 현재 기본 구현체는 PortOne(토스페이먼츠 경유) 하나뿐이다.
// 신규 PG사를 추가할 때는 PaymentProvider를 구현하는 파일만 추가하고 여기서 교체하면 된다(FR-5).
export { portoneProvider as paymentProvider } from "./PortoneProvider";
