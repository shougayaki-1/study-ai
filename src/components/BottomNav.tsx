"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Toolbar from "@mui/material/Toolbar";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import TodayIcon from "@mui/icons-material/Today";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ListAltIcon from "@mui/icons-material/ListAlt";
import InsightsIcon from "@mui/icons-material/Insights";
import EventNoteIcon from "@mui/icons-material/EventNote";
import SettingsIcon from "@mui/icons-material/Settings";
import MenuIcon from "@mui/icons-material/Menu";
import ArticleIcon from "@mui/icons-material/Article";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";

const NAV_ITEMS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "記録", value: "/record", icon: <EditNoteIcon /> },
  { label: "履歴", value: "/records", icon: <ListAltIcon /> },
  { label: "分析", value: "/stats", icon: <InsightsIcon /> },
  { label: "予定", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "レポート", value: "/reports", icon: <ArticleIcon /> },
  { label: "カルテ", value: "/karte", icon: <MedicalInformationIcon /> },
  { label: "設定", value: "/settings", icon: <SettingsIcon /> },
];

const MOBILE_TABS = NAV_ITEMS.slice(0, 4);
const EXTRA_ITEMS = NAV_ITEMS.slice(4);
const DRAWER_WIDTH = 224;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  if (pathname === "/login") return null;

  const current = NAV_ITEMS.find((t) => t.value === pathname)?.value ?? "/";
  const navigate = (value: string) => {
    setMenuOpen(false);
    router.push(value);
  };

  const navList = (items: typeof NAV_ITEMS) => (
    <List sx={{ px: 1 }}>
      {items.map((item) => (
        <ListItemButton key={item.value} selected={current === item.value} onClick={() => navigate(item.value)} sx={{ borderRadius: 1 }}>
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.label} />
        </ListItemButton>
      ))}
    </List>
  );

  return (
    <>
      <Drawer variant="permanent" sx={{ display: { xs: "none", md: "block" }, width: DRAWER_WIDTH, "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}>
        <Toolbar><Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>Study AI</Box></Toolbar>
        <Divider />
        {navList(NAV_ITEMS)}
      </Drawer>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} sx={{ display: { xs: "block", md: "none" } }}>
        <Box sx={{ width: 264 }} role="presentation">
          <Toolbar><Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>メニュー</Box></Toolbar>
          <Divider />
          {navList(EXTRA_ITEMS)}
        </Box>
      </Drawer>

      <Box sx={{ display: { xs: "block", md: "none" }, position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10, borderTop: "1px solid #eeeeee", bgcolor: "background.paper", pb: "env(safe-area-inset-bottom)" }}>
        <BottomNavigation showLabels value={MOBILE_TABS.some((tab) => tab.value === current) ? current : false} onChange={(_, newValue) => navigate(newValue)} sx={{ minHeight: 56 }}>
          {MOBILE_TABS.map((tab) => <BottomNavigationAction key={tab.value} label={tab.label} value={tab.value} icon={tab.icon} />)}
        </BottomNavigation>
      </Box>
      <Box sx={{ display: { xs: "flex", md: "none" }, position: "fixed", right: 8, bottom: "calc(64px + env(safe-area-inset-bottom))", zIndex: 11 }}>
        <IconButton aria-label="メニューを開く" onClick={() => setMenuOpen(true)} sx={{ bgcolor: "background.paper", boxShadow: 2 }}><MenuIcon /></IconButton>
      </Box>
    </>
  );
}
