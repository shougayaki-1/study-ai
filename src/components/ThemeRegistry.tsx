"use client";

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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          // Reserve the fixed bottom navigation and the device safe area.
          pb: "calc(56px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </Box>
      <BottomNav />
    </ThemeProvider>
  );
}
