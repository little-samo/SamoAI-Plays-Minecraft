export const commandRegex =
  /!(\w+)(?:\(((?:-?\d+(?:\.\d+)?|true|false|"[^"]*")(?:\s*,\s*(?:-?\d+(?:\.\d+)?|true|false|"[^"]*"))*)\))?/;
export const argRegex = /-?\d+(?:\.\d+)?|true|false|"[^"]*"/g;

export function containsCommand(message) {
  const commandMatch = message.match(commandRegex);
  if (commandMatch) return '!' + commandMatch[1];
  return null;
}
