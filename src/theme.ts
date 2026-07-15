import { createTheme } from "@mui/material/styles";

// ライトテーマ固定・ミニマル(白背景・余白多め・装飾控えめ)
const theme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
    primary: {
      main: "#3f51b5",
    },
    secondary: {
      main: "#00897b",
    },
    warning: {
      main: "#f9a825",
    },
    error: {
      main: "#e53935",
    },
    divider: "#eeeeee",
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      "Roboto",
      '"Hiragino Sans"',
      '"Hiragino Kaku Gothic ProN"',
      '"Noto Sans JP"',
      "Meiryo",
      "sans-serif",
    ].join(","),
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: "#ffffff",
          color: "#171717",
          borderBottom: "1px solid #eeeeee",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
});

export default theme;
