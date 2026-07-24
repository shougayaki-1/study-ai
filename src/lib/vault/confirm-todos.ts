export type ConfirmTodo = { id: string; q: string; options: string[]; default: string; ref?: string };

const PREFIX = "- [ ] ";

export function parseConfirmTodos(body: string): ConfirmTodo[] {
  const todos: ConfirmTodo[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    const fields: Record<string, string> = {};
    for (const part of line.slice(PREFIX.length).split(" | ")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      fields[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!fields.id) continue;
    todos.push({
      id: fields.id,
      q: fields.q,
      options: fields.options ? fields.options.split(" / ") : [],
      default: fields.default,
      ref: fields.ref,
    });
  }
  return todos;
}
