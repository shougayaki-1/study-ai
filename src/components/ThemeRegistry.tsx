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
          // Mobile reserves the bottom bar; desktop reserves the permanent sidebar.
          pb: { xs: "calc(56px + env(safe-area-inset-bottom))", md: 0 },
          ml: { md: "224px" },
          minHeight: "100dvh",
        }}
      >
        {children}
      </Box>
      <BottomNav />
    </ThemeProvider>
  );
}
