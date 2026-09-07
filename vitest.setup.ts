import { config } from "dotenv";

// Next.js와 달리 vitest는 .env를 자동으로 읽지 않으므로 직접 로드한다.
config({ path: ".env" });
