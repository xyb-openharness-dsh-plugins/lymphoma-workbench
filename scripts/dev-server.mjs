#!/usr/bin/env node
/**
 * 本机启动（开发用，M5 之前的主要运行方式）。
 *
 * 用法：npm start [-- --port 8788]
 *   LYMBELL_DB  指定业务库路径，默认 ./workspace/lymbell.sqlite
 *   LYMBELL_KB  指定知识库路径，默认 ./knowledge/lymphoma-kb.sqlite
 *
 * 只监听 127.0.0.1；首次启动会在空库里写入演示档案（可用 --no-seed 跳过）。
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkbenchServer } from '../dsh/server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = Number(process.env.PORT || (portIdx >= 0 ? args[portIdx + 1] : 8788));

const dbPath = process.env.LYMBELL_DB || resolve(root, 'workspace/lymbell.sqlite');
const kbPath = process.env.LYMBELL_KB || resolve(root, 'knowledge/lymphoma-kb.sqlite');

mkdirSync(dirname(dbPath), { recursive: true });

const app = createWorkbenchServer({ dbPath, kbPath, seed: !args.includes('--no-seed') });
const server = await app.listen(port);

const close = () => {
  server.close();
  app.close();
  process.exit(0);
};
process.on('SIGINT', close);
process.on('SIGTERM', close);

console.log(`小铃铛 LymBell 本机工作台：http://127.0.0.1:${port}/`);
console.log(`  业务库 ${dbPath}`);
console.log(`  知识库 ${app.kb ? kbPath : `${kbPath}（未接入）`}`);
console.log('  Ctrl+C 停止');
