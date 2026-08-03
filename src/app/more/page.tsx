import ArticleIcon from "@mui/icons-material/Article";
import SettingsIcon from "@mui/icons-material/Settings";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";

const MORE_LINKS = [
  {
    href: "/reports",
    label: "レポート",
    description: "日次・週次のレポートを見る",
    icon: <ArticleIcon />,
  },
  {
    href: "/settings",
    label: "設定",
    description: "夜間分析バッチの起動プロンプト・ログアウト",
    icon: <SettingsIcon />,
  },
];

export default function MorePage() {
  return (
    <Box sx={{ p: 2, pb: 10, maxWidth: { xs: 560, md: 960 }, mx: "auto" }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        その他
      </Typography>
      <Stack spacing={1}>
        {MORE_LINKS.map((item) => (
          <Paper
            key={item.href}
            component={Link}
            href={item.href}
            variant="outlined"
            sx={{
              p: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              textDecoration: "none",
              color: "text.primary",
            }}
          >
            {item.icon}
            <Box>
              <Typography variant="body1">{item.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.description}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
