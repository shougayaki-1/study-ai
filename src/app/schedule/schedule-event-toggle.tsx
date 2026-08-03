import Chip from "@mui/material/Chip";

export default function ScheduleEventToggle({ done }: { done: boolean }) {
  return (
    <Chip
      size="small"
      label={done ? "完了" : "未完了"}
      color={done ? "success" : "default"}
      variant={done ? "filled" : "outlined"}
    />
  );
}
