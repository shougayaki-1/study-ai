"use client";

import { usePathname } from "next/navigation";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import theme from "@/theme";
import BottomNav from "@/components/BottomNav";

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hasNav = pathname !== "/login";

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          // Mobile reserves the bottom bar; desktop reserves the permanent sidebar.
          // ナビゲーションが表示されないページ(ログイン画面など)では余白を確保しない。
          pb: hasNav ? { xs: "calc(56px + env(safe-area-inset-bottom))", md: 0 } : 0,
          ml: hasNav ? { md: "224px" } : 0,
          minHeight: "100dvh",
        }}
      >
        {children}
      </Box>
      <BottomNav />
    </ThemeProvider>
  );
}
