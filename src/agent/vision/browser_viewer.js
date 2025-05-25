import prismarineViewer from 'prismarine-viewer';

import settings from '../../settings.js';

const mineflayerViewer = prismarineViewer.mineflayer;

export function addBrowserViewer(bot, count_id) {
  if (settings.show_bot_views)
    mineflayerViewer(bot, { port: 3000 + count_id, firstPerson: true });
}
