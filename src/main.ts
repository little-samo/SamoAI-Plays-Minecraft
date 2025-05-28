import path from 'path';

import {
  WorldManager,
  LocationId,
  UserId,
  AgentId,
  Location,
  Agent as SamoAgent,
  LocationMessage,
  EntityType,
} from '@little-samo/samo-ai';
import {
  AgentStorage,
  GimmickStorage,
  ItemStorage,
  LocationStorage,
  UserStorage,
} from '@little-samo/samo-ai-repository-storage';
import { Bot } from 'mineflayer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { ActionManager } from './agent/action_manager.js';
import { containsCommand } from './agent/commands/const.js';
import { executeCommand, commandExists } from './agent/commands/index.js';
import { queryList } from './agent/commands/queries.js';
import { History } from './agent/history.js';
import { MemoryBank } from './agent/memory_bank.js';
import { initModes } from './agent/modes.js';
import { addBrowserViewer } from './agent/vision/browser_viewer.js';
import { VisionInterpreter } from './agent/vision/vision_interpreter.js';
import { Prompter } from './models/prompter.js';
import { mainProxy } from './process/main_proxy.js';
import { createMindServer } from './server/mind_server.js';
import settings from './settings.js';
import { initBot } from './utils/mcdata.js';

// Extended Bot type with mindcraft-specific properties
interface MindcraftBot extends Bot {
  output: string;
  interrupt_code: boolean;
  modes: {
    getMiniDocs: () => string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface Arguments {
  agents?: string;
  location?: string;
  task_path?: string;
  task_id?: string;
}

interface MinecraftAgent {
  id: AgentId;
  name: string;
  bot: MindcraftBot;
  prompter: Prompter;
  actions: ActionManager;
  history: History;
  memory_bank: MemoryBank;
  vision_interpreter?: VisionInterpreter;
  locationId: LocationId;
  userId: UserId;
  agentId: AgentId;
  locationStorage: LocationStorage;
  isIdle: () => boolean;
  clearBotLogs: () => void;
  updateContext: () => Promise<void>;
}

function parseArguments(): Arguments {
  return yargs(hideBin(process.argv))
    .option('agents', {
      alias: 'a',
      type: 'string',
      describe: 'agents to run (comma separated)',
      default: 'samo,nyx',
    })
    .option('location', {
      alias: 'l',
      type: 'string',
      describe: 'location for the agents',
      default: 'minecraft',
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

function buildContextFromAgent(agent: MinecraftAgent): string {
  let context = '';

  try {
    // Use existing queries to build context
    const statsQuery = queryList.find((q) => q.name === '!stats');
    const inventoryQuery = queryList.find((q) => q.name === '!inventory');
    const nearbyBlocksQuery = queryList.find((q) => q.name === '!nearbyBlocks');
    const entitiesQuery = queryList.find((q) => q.name === '!entities');

    if (statsQuery) {
      const statsResult = statsQuery.perform(agent);
      context += statsResult + '\n';
    }

    if (inventoryQuery) {
      const inventoryResult = inventoryQuery.perform(agent);
      context += inventoryResult + '\n';
    }

    if (nearbyBlocksQuery) {
      const blocksResult = nearbyBlocksQuery.perform(agent);
      context += blocksResult + '\n';
    }

    if (entitiesQuery) {
      const entitiesResult = entitiesQuery.perform(agent);
      context += entitiesResult + '\n';
    }

    // Add modes information
    if (agent.bot.modes && agent.bot.modes.getMiniDocs) {
      context += '\nMODES:\n' + agent.bot.modes.getMiniDocs() + '\n';
    }
  } catch (error) {
    console.error(`Error building context for ${agent.name}:`, error);
    context += `Error building context: ${error}\n`;
  }

  return context;
}

async function createMinecraftAgent(
  agentName: string,
  locationId: LocationId,
  userId: UserId,
  agentId: AgentId,
  locationStorage: LocationStorage,
  countId: number = 0
): Promise<MinecraftAgent> {
  console.log(`Creating Minecraft agent: ${agentName}`);

  // Create Minecraft bot - initBot returns a bot with extended properties
  const bot = initBot(agentName) as MindcraftBot;

  // Generate profile path from agent name - use models/agents directory
  const profilePath = path.join(
    process.cwd(),
    'models',
    'agents',
    `${agentName}.json`
  );

  // Initialize agent components (similar to original Agent class)
  const prompter = new Prompter({ name: agentName }, profilePath);
  const actions = new ActionManager({
    bot,
    clearBotLogs: () => {
      bot.output = '';
      bot.interrupt_code = false;
    },
  });
  const history = new History({ name: agentName } as { name: string });
  const memory_bank = new MemoryBank();

  const agent: MinecraftAgent = {
    id: agentId,
    name: agentName,
    bot,
    prompter,
    actions,
    history,
    memory_bank,
    locationId,
    userId,
    agentId,
    locationStorage,

    isIdle: () => !actions.executing,

    clearBotLogs: () => {
      bot.output = '';
      bot.interrupt_code = false;
    },

    updateContext: async () => {
      try {
        const contextString = buildContextFromAgent(agent);
        await locationStorage.updateLocationStateRendering(
          locationId,
          contextString
        );

        // Update image if vision is enabled
        if (settings.allow_vision && agent.vision_interpreter?.camera) {
          try {
            const filename = await agent.vision_interpreter.camera.capture();
            const imagePath = `${agent.vision_interpreter.fp}/${filename}.jpg`;
            await locationStorage.updateLocationStateImage(
              locationId,
              0,
              imagePath
            );
          } catch (error) {
            console.error(`Error capturing image for ${agentName}:`, error);
          }
        }
      } catch (error) {
        console.error(`Error updating context for ${agentName}:`, error);
      }
    },
  };

  // Setup bot event handlers
  bot.on('login', () => {
    console.log(`${agentName} logged into Minecraft!`);
  });

  bot.once('spawn', async () => {
    console.log(`${agentName} spawned in Minecraft!`);

    // Initialize modes and vision (like original Agent)
    initModes(agent as { name: string; bot: MindcraftBot });
    addBrowserViewer(bot, countId);

    // Wait for stabilization
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Initialize vision interpreter
    if (settings.allow_vision) {
      agent.vision_interpreter = new VisionInterpreter(
        agent as { name: string; bot: MindcraftBot },
        settings.allow_vision
      );
    }

    // Update initial context
    await agent.updateContext();

    // Send initial message
    if (settings.init_message) {
      await handleAgentMessage(agent, 'system', settings.init_message);
    }
  });

  // Handle incoming chat messages
  const handleMinecraftMessage = async (username: string, message: string) => {
    if (username === agentName) return;

    // Filter system messages (like original Agent)
    const ignore_messages = [
      'Set own game mode to',
      'Set the time to',
      'Set the difficulty to',
      'Teleported ',
      'Set the weather to',
      'Gamerule ',
    ];

    if (ignore_messages.some((m) => message.startsWith(m))) return;

    console.log(
      `${agentName} received Minecraft message from ${username}: ${message}`
    );

    try {
      // Add to WorldManager
      await WorldManager.instance.addLocationUserMessage(
        locationId,
        userId,
        username,
        message
      );

      // Handle with agent
      await handleAgentMessage(agent, username, message);

      // Trigger location update
      await locationStorage.updateLocationStatePauseUpdateUntil(
        locationId,
        new Date(Date.now() + 500)
      );
    } catch (error) {
      console.error(`Error handling message for ${agentName}:`, error);
    }
  };

  bot.on('chat', handleMinecraftMessage);
  bot.on('whisper', handleMinecraftMessage);

  // Handle bot errors
  bot.on('error', (err: Error) => {
    console.error(`Minecraft bot error for ${agentName}:`, err);
  });

  bot.on('end', (reason: string) => {
    console.warn(`Minecraft bot ${agentName} disconnected:`, reason);
  });

  bot.on('kicked', (reason: string) => {
    console.warn(`Minecraft bot ${agentName} was kicked:`, reason);
  });

  return agent;
}

async function handleAgentMessage(
  agent: MinecraftAgent,
  source: string,
  message: string
): Promise<boolean> {
  console.log(`${agent.name} handling message from ${source}: ${message}`);

  let used_command = false;

  // Check for message.action format first
  let actionToExecute: string | null = null;
  try {
    const messageObj = JSON.parse(message);
    if (messageObj.action) {
      actionToExecute = messageObj.action;
      console.log(`${agent.name} found action in message: ${actionToExecute}`);
    }
  } catch {
    // Not JSON, check for regular commands
    actionToExecute = containsCommand(message);
  }

  if (actionToExecute) {
    if (!commandExists(actionToExecute)) {
      console.log(`${agent.name}: Command '${actionToExecute}' does not exist`);
      return false;
    }

    console.log(`${agent.name} executing action: ${actionToExecute}`);
    try {
      const commandMessage = actionToExecute.startsWith('!')
        ? actionToExecute
        : `!${actionToExecute}`;
      const execute_res = await executeCommand(
        agent as {
          name: string;
          bot: MindcraftBot;
          actions: ActionManager;
          history: History;
          memory_bank: MemoryBank;
        },
        commandMessage
      );

      if (execute_res) {
        await routeResponse(agent, source, execute_res);
      }

      // Update context after action
      await agent.updateContext();
      used_command = true;
    } catch (error) {
      console.error(`Error executing command ${actionToExecute}:`, error);
      return false;
    }
  } else {
    // No command found, just log
    console.log(`${agent.name}: No action found in message, logging only`);
  }

  // Add to history and generate response (like original Agent)
  await agent.history.add(source, message);

  if (!used_command) {
    // Generate AI response
    const historyData = agent.history.getHistory();
    const response = await agent.prompter.promptConvo(historyData);

    if (response && response.trim().length > 0) {
      await agent.history.add(agent.name, response);
      await routeResponse(agent, source, response);
    }
  }

  // Update context after handling message
  await agent.updateContext();
  return used_command;
}

async function routeResponse(
  agent: MinecraftAgent,
  to_player: string,
  message: string
) {
  console.log(`${agent.name} responding to ${to_player}: ${message}`);

  // Send to WorldManager
  await WorldManager.instance.addLocationAgentMessage(
    agent.locationId,
    agent.agentId,
    agent.name,
    message
  );

  // Also send to Minecraft if it's not a command response
  if (!containsCommand(message)) {
    await openChat(agent, message);
  }
}

async function openChat(agent: MinecraftAgent, message: string) {
  // Clean message for Minecraft (like original Agent)
  const cleanMessage = message.replaceAll('\n', ' ');

  if (settings.only_chat_with.length > 0) {
    for (const username of settings.only_chat_with) {
      agent.bot.whisper(username, cleanMessage);
    }
  } else {
    agent.bot.chat(cleanMessage);
  }
}

async function setupAgentMessageMonitoring(agent: MinecraftAgent) {
  let lastMessageCount = 0;

  // Monitor WorldManager for agent responses and send to Minecraft
  const checkForAgentMessages = async () => {
    try {
      const messagesState =
        await agent.locationStorage.getOrCreateLocationMessagesState(
          agent.locationId
        );

      if (messagesState?.messages?.length > lastMessageCount) {
        const newMessages = messagesState.messages.slice(lastMessageCount);

        for (const message of newMessages) {
          // Only process messages from this specific agent
          if (
            message.name === agent.name &&
            message.message &&
            !message.message.startsWith('!')
          ) {
            console.log(
              `Sending ${agent.name} WorldManager message to Minecraft: ${message.message}`
            );
            await openChat(agent, message.message);
          }
        }

        lastMessageCount = messagesState.messages.length;
      }
    } catch (error) {
      console.error(`Error checking agent messages for ${agent.name}:`, error);
    }
  };

  setInterval(checkForAgentMessages, 1000);
}

async function main(): Promise<void> {
  console.log('Starting SamoAI Minecraft Bot System...');

  // Initialize storage systems
  const agentStorage = new AgentStorage(
    path.join(process.cwd(), 'models', 'agents'),
    path.join(process.cwd(), 'states', 'agents')
  );
  const gimmickStorage = new GimmickStorage(
    path.join(process.cwd(), 'states', 'gimmicks')
  );
  const itemStorage = new ItemStorage(
    path.join(process.cwd(), 'states', 'items')
  );
  const locationStorage = new LocationStorage(
    path.join(process.cwd(), 'models', 'locations'),
    path.join(process.cwd(), 'states', 'locations')
  );
  const userStorage = new UserStorage(
    path.join(process.cwd(), 'models', 'users'),
    path.join(process.cwd(), 'states', 'users')
  );

  // Initialize WorldManager
  WorldManager.initialize({
    agentRepository: agentStorage,
    gimmickRepository: gimmickStorage,
    itemRepository: itemStorage,
    locationRepository: locationStorage,
    userRepository: userStorage,
  });

  // Start mindserver if configured
  if (settings.host_mindserver) {
    createMindServer(settings.mindserver_port);
    mainProxy.connect();
  }

  const args = parseArguments();
  const agentNames = args.agents!.split(',').map((name) => name.trim());
  const locationName = args.location!.trim();

  console.log(`Initializing agents: ${agentNames.join(', ')}`);
  console.log(`Location: ${locationName}`);

  // Initialize storage with agents and location
  await locationStorage.initialize([locationName]);
  await agentStorage.initialize(agentNames);

  // Get location and user IDs
  const locationId = Number(locationStorage.getLocationIds()[0]) as LocationId;
  const userId = 1 as UserId;

  // Initialize location state (like cli.ts)
  const locationState =
    await locationStorage.getOrCreateLocationState(locationId);

  // Clear existing users and agents
  for (const locationUserId of locationState.userIds) {
    await locationStorage.removeLocationStateUserId(locationId, locationUserId);
  }
  for (const locationAgentId of locationState.agentIds) {
    await locationStorage.removeLocationStateAgentId(
      locationId,
      locationAgentId
    );
  }

  // Add the user
  await locationStorage.addLocationStateUserId(locationId, userId);

  // Create Minecraft agents
  const agents: MinecraftAgent[] = [];
  const agentIds = agentStorage.getAgentIds();

  for (let i = 0; i < agentNames.length; i++) {
    const agentName = agentNames[i];
    const agentId = agentIds[i];

    // Add agent to location
    await locationStorage.addLocationStateAgentId(locationId, agentId);

    // Create Minecraft agent
    const agent = await createMinecraftAgent(
      agentName,
      locationId,
      userId,
      agentId,
      locationStorage,
      i
    );
    agents.push(agent);

    // Register with mainProxy if mindserver is enabled
    if (settings.host_mindserver) {
      mainProxy.registerAgent(agentName, {
        stop: () => agent.bot.end(),
        continue: () => {
          console.log(`Continuing agent ${agentName}`);
        },
      });
    }

    // Setup message monitoring
    await setupAgentMessageMonitoring(agent);

    // Wait between connections
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('Starting update loop...');

  // Main update loop (like cli.ts)
  while (true) {
    try {
      const locationState =
        await locationStorage.getOrCreateLocationState(locationId);
      const now = new Date();

      if (
        locationState.pauseUpdateUntil &&
        new Date(locationState.pauseUpdateUntil) <= now
      ) {
        await WorldManager.instance.updateLocation(userId, locationId, {
          preAction: async (location: Location) => {
            // Setup event handlers for agent thinking/responses
            location.on(
              'agentExecuteNextActions',
              async (samoAgent: SamoAgent) => {
                const agent = agents.find(
                  (a) => a.name === samoAgent.model.name
                );
                if (agent) {
                  console.log(`${agent.name} is thinking...`);
                }
              }
            );

            // Setup messageAdded event handler for processing agent actions
            location.on(
              'messageAdded',
              async (_loc: Location, message: LocationMessage) => {
                // Skip user messages and empty messages
                if (message.entityType !== EntityType.Agent) {
                  return;
                }

                // Find the agent that should handle this message
                const targetAgent = agents.find(
                  (a) => a.id === message.entityId
                );
                if (!targetAgent) {
                  return;
                }

                console.log(
                  `Processing agent message for ${targetAgent.name}: ${message.message} (${message.action})`
                );

                if (!message.action) {
                  return;
                }

                // Check if message contains an action
                const actionToExecute = message.action;

                if (!commandExists(actionToExecute)) {
                  console.log(`Command '${actionToExecute}' does not exist`);
                  return;
                }

                console.log(
                  `${targetAgent.name} executing WorldManager action: ${actionToExecute}`
                );
                try {
                  const commandMessage = actionToExecute.startsWith('!')
                    ? actionToExecute
                    : `!${actionToExecute}`;
                  const execute_res = await executeCommand(
                    targetAgent as {
                      name: string;
                      bot: MindcraftBot;
                      actions: ActionManager;
                      history: History;
                      memory_bank: MemoryBank;
                    },
                    commandMessage
                  );

                  if (execute_res) {
                    // Send result back to WorldManager
                    await WorldManager.instance.addLocationAgentMessage(
                      locationId,
                      targetAgent.agentId,
                      targetAgent.name,
                      execute_res
                    );
                  }

                  // Update context after action
                  await targetAgent.updateContext();
                } catch (error) {
                  console.error(
                    `Error executing WorldManager command ${actionToExecute}:`,
                    error
                  );
                }
              }
            );
          },
          handleSave: async (save) => {
            await save;
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Update loop error:', error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

try {
  void main();
} catch (error) {
  console.error('An error occurred:', error);
  process.exit(1);
}
