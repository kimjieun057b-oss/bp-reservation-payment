"use client";
import { useCallback, useState } from "react"
import Toast from "../ui/Toast";
import { createClient } from "@/lib/supabase/client";

export interface NomalLoginFormProps {
    email : string;
    password : string;
}

export default function NomalLoginForm() {
    // Supabase Auth 로그인 (관리자 계정은 공개 가입 없이 service role로만 발급됨)

    const [form, setForm] = useState<NomalLoginFormProps>({
        email: "", password: ""
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

        if (!form.email.trim()) {
            setVaild("이메일을 입력해주세요.")
            return;
        }

        if (!form.password.trim()) {
            setVaild("비밀번호를 입력해주세요.")
            return;
        }

        try {
            setLoading(true);
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({
                email: form.email,
                password: form.password,
            });

            if (error) {
                throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
            }

            // 로그인 성공 시 관리자 메인으로 이동 (미들웨어가 새 세션 쿠키를 읽도록 전체 리로드)
            window.location.href = '/admin/dashboard';

        } catch (err: any) {
            setVaild(err.message);
            setForm({ email: "", password: "" })
        } finally {
            setLoading(false);
        }

    }, [form, loading])

    return (
        <>
            <form onSubmit={onSubminForm} className="space-y-4">
                <div>
                    <label htmlFor="email" className="form-label">이메일</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="이메일을 입력해주세요"
                        onChange={onChangeForm}
                        value={form.email}
                        className="form-input"
                    />
                </div>
                <div>
                    <label htmlFor="password" className="form-label">비밀번호</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        placeholder="비밀번호를 입력해주세요"
                        onChange={onChangeForm}
                        value={form.password}
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