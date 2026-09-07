import NomalLoginForm from "@/components/auth/NomalLoginForm";

// 관리자 로그인 페이지
export default function AdminLoginPage () {
    return (
        <section>
            <div>
              <div>
                {/* <h2>ADMIN LOGIN</h2>
                <p>관리자 로그인</p> */}
              </div>
              <div>
                <NomalLoginForm/>
              </div>
            </div>
        </section>
    )
}
