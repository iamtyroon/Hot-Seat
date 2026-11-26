process.env.VERCEL = '1';
process.env.HOTSEAT_ARENA_WORKER = '1';

const [{ serverApp, runDeterministicArenaTick }, { samplePublisherLeaseHours }, { closeStorage, hasDurableStorage, tryAcquireArenaWorkerLock }] = await Promise.all([
  import('../server.ts'),
  import('../src/gameAds/routes.ts'),
  import('../src/server/storage.ts'),
]);

if (!hasDurableStorage) throw new Error('Arena Daemon requires Neon durable storage.');
await serverApp;

let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  while (!stopping) {
    const lock = await tryAcquireArenaWorkerLock();
    if (!lock) {
      await wait(3500);
      continue;
    }
    try {
      while (!stopping) {
        try {
          await lock.ping();
          await runDeterministicArenaTick();
          await samplePublisherLeaseHours();
        } catch (error) {
          console.error('Arena Daemon tick failed:', error);
          if (error instanceof Error && /connection|closed|terminated|socket/i.test(error.message)) break;
        }
        await wait(3500);
      }
    } finally {
      await lock.release();
    }
  }
} finally {
  await closeStorage();
}
