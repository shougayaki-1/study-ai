"use client";

import TodayIcon from "@mui/icons-material/Today";
import EventNoteIcon from "@mui/icons-material/EventNote";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import ListAltIcon from "@mui/icons-material/ListAlt";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "今日", value: "/", icon: <TodayIcon /> },
  { label: "計画", value: "/schedule", icon: <EventNoteIcon /> },
  { label: "学習状態", value: "/karte", icon: <MedicalInformationIcon /> },
  { label: "記録", value: "/records", icon: <ListAltIcon /> },
  { label: "その他", value: "/more", icon: <MoreHorizIcon /> },
];

const DRAWER_WIDTH = 224;

function isActive(pathname: string, value: string): boolean {
  if (value === "/") return pathname === "/";
  if (value === "/more") {
    return (
      pathname === "/more" ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/settings")
    );
  }
  return pathname === value || pathname.startsWith(`${value}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  const current =
    NAV_ITEMS.find((item) => isActive(pathname, item.value))?.value ?? "";
  const navigate = (value: string) => router.push(value);

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: DRAWER_WIDTH,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        <Toolbar>
          <Box component="span" sx={{ fontWeight: 700, fontSize: 18 }}>
            Study AI
          </Box>
        </Toolbar>
        <Divider />
        <List sx={{ px: 1 }}>
          {NAV_ITEMS.map((item) => (
            <ListItemButton
              key={item.value}
              selected={current === item.value}
              onClick={() => navigate(item.value)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box
        sx={{
          display: { xs: "block", md: "none" },
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          borderTop: "1px solid #eeeeee",
          bgcolor: "background.paper",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation
          showLabels
          value={current || false}
          onChange={(_, newValue) => navigate(newValue)}
          sx={{ minHeight: 56 }}
        >
          {NAV_ITEMS.map((item) => (
            <BottomNavigationAction
              key={item.value}
              label={item.label}
              value={item.value}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      </Box>
    </>
  );
}
