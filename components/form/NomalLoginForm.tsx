"use client";
import { useCallback, useState } from "react"
import Toast from "../common/Toast";

export interface NomalLoginFormProps {
    admin_id : string;
    password_hash : string;
}

export default function NomalLoginForm() {
    // 2. login-ID/PW
    // table : user_admin table에서 ID/PW 연동

    const [form, setForm] = useState<NomalLoginFormProps>({
        admin_id: "", password_hash: ""
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [vaild, setVaild] = useState<string | null>(null);

    const onChangeForm = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm((prev) => ({
            ...prev,
            [name]: value
        }));
    }, []);

    const onSubminForm = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (loading) return;

        if (!form.admin_id.trim()) {
            setVaild("아이디를 입력해주세요.")
            return;
        }

        if (!form.password_hash.trim()) {
            setVaild("비밀번호를 입력해주세요.")
            return;
        }

        try {
            setLoading(true);
            const response = await fetch('/api/login/id', {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    admin_id: form.admin_id,
                    password_hash: form.password_hash
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '로그인에 실패했습니다.');
            }

            // 로그인 성공 시 관리자 메인 또는 홈으로 이동
            window.location.href = '/admin';
            setLoading(false);

        } catch (err: any) {
            setVaild(err.message);
            setForm({ admin_id: "", password_hash: "" })
        } finally {
            setLoading(false);
        }

    }, [form])

    return (
        <>
            <form onSubmit={onSubminForm} className="space-y-4">
                <div>
                    <label htmlFor="admin_id" className="form-label">아이디</label>
                    <input
                        type="text"
                        id="admin_id"
                        name="admin_id"
                        placeholder="아이디를 입력해주세요"
                        onChange={onChangeForm}
                        value={form.admin_id}
                        className="form-input"
                    />
                </div>
                <div>
                    <label htmlFor="password_hash" className="form-label">비밀번호</label>
                    <input
                        type="password"
                        id="password_hash"
                        name="password_hash"
                        placeholder="비밀번호를 입력해주세요"
                        onChange={onChangeForm}
                        value={form.password_hash}
                        className="form-input"
                    />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                    {loading ? "로그인 중..." : "로그인"}
                </button>
            </form>
            <Toast vaild={vaild} setVaild={setVaild} />
        </>
    )
}