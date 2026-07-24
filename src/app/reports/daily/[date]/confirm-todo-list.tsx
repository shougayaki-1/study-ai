"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import type { ConfirmTodo } from "@/lib/vault";
import { submitCorrection } from "../_lib/actions";

export default function ConfirmTodoList({
  reportPath,
  date,
  todos,
}: {
  reportPath: string;
  date: string;
  todos: ConfirmTodo[];
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (todos.length === 0) return null;

  const choose = (todo: ConfirmTodo, choice: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await submitCorrection({ reportPath, date, todo, choice });
        setResolved((prev) => ({ ...prev, [todo.id]: choice }));
      } catch {
        setError("訂正を保存できませんでした。");
      }
    });
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        要確認TODO
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack spacing={1.5}>
        {todos.map((todo) => {
          const chosen = resolved[todo.id];
          return (
            <Paper key={todo.id} variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {todo.q}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {todo.options.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    color={chosen === option ? "primary" : "default"}
                    onClick={() => choose(todo, option)}
                    disabled={isPending}
                  />
                ))}
              </Stack>
              {chosen && (
                <Typography variant="caption" color="success.main" sx={{ display: "block", mt: 1 }}>
                  「{chosen}」で訂正を送信しました
                </Typography>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
