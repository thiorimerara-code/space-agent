import { setServerConfigParam } from "./lib/server_config.js";

function parseSetArgs(args) {
  const paramName = String(args[0] || "").trim();
  const value = args.slice(1).join(" ");

  if (!paramName || !value) {
    throw new Error('Usage: node space set <param> <value>');
  }

  return {
    paramName,
    value
  };
}

export const help = {
  name: "set",
  summary: "Validate and write a server config parameter to the project .env file.",
  usage: ["node space set <param> <value>"],
  description:
    "Validates the value against commands/params.yaml, then writes the parameter into the project .env file used by the local server.",
  arguments: [
    {
      name: "<param>",
      description: "Server config parameter name such as HOST or PORT."
    },
    {
      name: "<value>",
      description: "Value to validate and store in .env."
    }
  ],
  examples: ["node space set HOST 127.0.0.1", "node space set PORT 3100"]
};

export async function execute(context) {
  const { paramName, value } = parseSetArgs(context.args);
  const entry = await setServerConfigParam(context.projectRoot, context.commandsDir, paramName, value);

  console.log(`Set ${entry.name}=${entry.value}`);
  return 0;
}
