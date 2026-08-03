import type { Metadata, Viewport } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import Box from "@mui/material/Box";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ThemeRegistry from "@/components/ThemeRegistry";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Study AI",
  description: "受験生向け学習管理アプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "study-ai",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#3f51b5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <AppRouterCacheProvider options={{ enableCssLayer: false }}>
          <ThemeRegistry>
            <Box sx={{ display: "flex" }}>
              <BottomNav />
              <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
                {children}
              </Box>
            </Box>
          </ThemeRegistry>
        </AppRouterCacheProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
