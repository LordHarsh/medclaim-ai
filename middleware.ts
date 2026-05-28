import { createNeonAuth } from "@neondatabase/auth/next/server";

const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});

export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: ["/claims/:path*", "/dashboard/:path*", "/onboarding/:path*"],
};
