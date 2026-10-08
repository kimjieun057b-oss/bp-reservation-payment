import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface AddonSelection {
    addon_option_id: string;
    quantity: number;
}

// 선택한 부가옵션을 예약에 스냅샷(이름/가격)으로 붙이고, 그 합계를 reservations.total_price에
// 더한다. total_price에 합산해두면 환불 계산(calculatePolicyRefund)과 전화 예약 확정 시
// payments에 남기는 금액(confirmPhoneBooking)이 옵션 포함 금액을 그대로 따라간다.
export async function attachAddonOptions(reservationId: string, selections: AddonSelection[]): Promise<number> {
    const validSelections = selections.filter(
        (s) => typeof s.addon_option_id === "string" && Number.isInteger(s.quantity) && s.quantity > 0
    );
    if (validSelections.length === 0) return 0;

    const ids = [...new Set(validSelections.map((s) => s.addon_option_id))];
    const { data: catalogOptions, error: catalogError } = await supabaseAdmin
        .from("addon_options")
        .select("id, name, price")
        .in("id", ids);

    if (catalogError) throw new Error(catalogError.message);

    const catalogById = new Map((catalogOptions ?? []).map((o) => [o.id, o]));
    const rows = validSelections
        .filter((s) => catalogById.has(s.addon_option_id))
        .map((s) => {
            const option = catalogById.get(s.addon_option_id)!;
            return {
                reservation_id: reservationId,
                addon_option_id: s.addon_option_id,
                name: option.name,
                price: option.price,
                quantity: s.quantity,
            };
        });

    if (rows.length === 0) return 0;

    const { error: insertError } = await supabaseAdmin.from("reservation_options").insert(rows);
    if (insertError) throw new Error(insertError.message);

    const optionsTotal = rows.reduce((sum, r) => sum + r.price * r.quantity, 0);

    const { data: reservation, error: fetchError } = await supabaseAdmin
        .from("reservations")
        .select("total_price")
        .eq("id", reservationId)
        .single();

    if (fetchError || !reservation) {
        throw new Error(fetchError?.message ?? "예약을 찾을 수 없습니다.");
    }

    const { error: updateError } = await supabaseAdmin
        .from("reservations")
        .update({ total_price: reservation.total_price + optionsTotal, updated_at: new Date().toISOString() })
        .eq("id", reservationId);

    if (updateError) throw new Error(updateError.message);

    return optionsTotal;
}
