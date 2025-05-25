import { readFileSync } from 'fs';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { AgentProcess } from './process/agent_process.js';
import { mainProxy } from './process/main_proxy.js';
import { createMindServer } from './server/mind_server.js';
import settings from './settings.js';

interface Arguments {
  profiles?: string[];
  task_path?: string;
  task_id?: string;
}

interface AgentProfile {
  name: string;
  [key: string]: unknown;
}

function parseArguments(): Arguments {
  return yargs(hideBin(process.argv))
    .option('profiles', {
      type: 'array',
      describe: 'List of agent profile paths',
    })
    .option('task_path', {
      type: 'string',
      describe: 'Path to task file to execute',
    })
    .option('task_id', {
      type: 'string',
      describe: 'Task ID to execute',
    })
    .help()
    .alias('help', 'h')
    .parse() as Arguments;
}

function getProfiles(args: Arguments): string[] {
  return args.profiles || settings.profiles;
}

async function main(): Promise<void> {
  if (settings.host_mindserver) {
    createMindServer(settings.mindserver_port);
  }
  mainProxy.connect();

  const args = parseArguments();
  const profiles = getProfiles(args);
  console.log(profiles);
  const { load_memory, init_message } = settings;

  for (let i = 0; i < profiles.length; i++) {
    const agent_process = new AgentProcess();
    const profile = readFileSync(profiles[i], 'utf8');
    const agent_json: AgentProfile = JSON.parse(profile);
    mainProxy.registerAgent(agent_json.name, agent_process);
    agent_process.start(
      profiles[i],
      load_memory,
      init_message,
      i,
      args.task_path,
      args.task_id
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

try {
  void main();
} catch (error) {
  console.error('An error occurred:', error);
  process.exit(1);
}
