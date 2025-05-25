export function getCommandDocs(agent) {
  const typeTranslations = {
    //This was added to keep the prompt the same as before type checks were implemented.
    //If the language model is giving invalid inputs changing this might help.
    float: 'number',
    int: 'number',
    BlockName: 'string',
    ItemName: 'string',
    boolean: 'bool',
  };
  let docs = `\n*COMMAND DOCS\n You can use the following commands to perform actions and get information about the world. 
    Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.\n
    Do not use codeblocks. Use double quotes for strings. Only use one command in each response, trailing commands and comments will be ignored.\n`;
  for (let command of commandList) {
    if (agent.blocked_actions.includes(command.name)) {
      continue;
    }
    docs += command.name + ': ' + command.description + '\n';
    if (command.params) {
      docs += 'Params:\n';
      for (let param in command.params) {
        docs += `${param}: (${typeTranslations[command.params[param].type] ?? command.params[param].type}) ${command.params[param].description}\n`;
      }
    }
  }
  return docs + '*\n';
}
