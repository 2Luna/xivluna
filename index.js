import fs from 'fs';
import fetch from 'node-fetch';

// Konfiguration
const config = {
  extraTag: 'xivluna',
  metaFile: './meta.json',
  outputFile: './repo.json',
  userAgent: 'xivluna/1.0.0',
  maxRetries: 3,
  retryDelay: 1000 // in ms
};

// Globale Variablen
const reposMeta = JSON.parse(fs.readFileSync(config.metaFile, 'utf8'));
const final = [];

// Hilfsfunktionen
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, options, retries = config.maxRetries) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      if (i < retries - 1) {
        console.warn(`Retrying fetch (${i + 1}/${retries})...`);
        await delay(config.retryDelay);
      } else {
        throw error;
      }
    }
  }
}

async function recoverPlugin(internalName) {
  if (!fs.existsSync(config.outputFile)) {
    console.error("!!! Tried to recover plugin when repo isn't generated");
    process.exit(1);
  }

  const oldRepo = JSON.parse(fs.readFileSync(config.outputFile, 'utf8'));
  const plugin = oldRepo.find(x => x.InternalName === internalName);
  if (!plugin) {
    console.error(`!!! Plugin ${internalName} not found in old repo`);
    process.exit(1);
  }

  final.push(plugin);
  console.log(`Recovered ${internalName} from last manifest`);
}

async function processRepo(meta) {
  console.log(`Fetching ${meta.repo}...`);
  try {
    const repo = await fetchWithRetries(meta.repo, {
      headers: {
        'user-agent': config.userAgent,
      }
    });

    for (const internalName of meta.plugins) {
      const plugin = repo.find(x => x.InternalName === internalName);
      if (!plugin) {
        console.warn(`!!! Plugin ${internalName} not found in ${meta.repo}`);
        await recoverPlugin(internalName);
        continue;
      }

      // Inject our custom tag
      const tags = plugin.Tags || [];
      if (!tags.includes(config.extraTag)) {
        tags.push(config.extraTag);
      }
      plugin.Tags = tags;

      final.push(plugin);
    }
  } catch (e) {
    console.error(`!!! Failed to fetch ${meta.repo}`);
    console.error(e);
    for (const plugin of meta.plugins) {
      await recoverPlugin(plugin);
    }
  }
}

async function main() {
  const tasks = reposMeta.map(meta => processRepo(meta));
  await Promise.all(tasks);

  fs.writeFileSync(config.outputFile, JSON.stringify(final, null, 2));
  console.log(`Wrote ${final.length} plugins to ${config.outputFile}.`);
}

// Start the main process
main().catch(e => {
  console.error('Unexpected error occurred:', e);
  process.exit(1);
});
