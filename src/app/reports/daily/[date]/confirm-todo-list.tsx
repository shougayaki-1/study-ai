import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ConfirmTodo } from "@/lib/vault";

export default function ConfirmTodoList({
  todos,
}: {
  todos: ConfirmTodo[];
}) {
  if (todos.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        要確認TODO
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mb: 1 }}
      >
        閲覧専用(訂正はMac側の対話から)
      </Typography>
      <Stack spacing={1.5}>
        {todos.map((todo) => (
          <Paper key={todo.id} variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {todo.q}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {todo.options.map((option) => (
                <Chip key={option} label={option} variant="outlined" />
              ))}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
