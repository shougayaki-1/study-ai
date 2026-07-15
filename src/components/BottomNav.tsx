"use client";

import { usePathname, useRouter } from "next/navigation";
import Paper from "@mui/material/Paper";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import TodayIcon from "@mui/icons-material/Today";
import EditNoteIcon from "@mui/icons-material/EditNote";
import InsightsIcon from "@mui/icons-material/Insights";
import EventNoteIcon from "@mui/icons-material/EventNote";
import SettingsIcon from "@mui/icons-material/Settings";

const TABS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "記録", value: "/record", icon: <EditNoteIcon /> },
  { label: "分析", value: "/stats", icon: <InsightsIcon /> },
  { label: "予定", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "設定", value: "/settings", icon: <SettingsIcon /> },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  const current = TABS.find((t) => t.value === pathname)?.value ?? "/";

  return (
    <Paper
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        borderTop: "1px solid #eeeeee",
      }}
    >
      <BottomNavigation
        showLabels
        value={current}
        onChange={(_, newValue) => router.push(newValue)}
      >
        {TABS.map((tab) => (
          <BottomNavigationAction
            key={tab.value}
            label={tab.label}
            value={tab.value}
            icon={tab.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
