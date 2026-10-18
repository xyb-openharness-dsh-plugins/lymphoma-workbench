/**
 * 资料目录校验（A21 / A22 同款：不猜路径、不静默建目录）。
 *
 * 拒绝：根目录、用户主目录根、桌面根、下载根、系统临时与日志目录。
 * 允许：主目录下再深一层的目录（例如 ~/Documents/LymBell）。
 * 目录不存在时返回 exists = false，由调用方决定是否创建——不在这里偷偷 mkdir。
 */
import { homedir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';

export function validateWorkspacePath(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('资料目录为空');
  if (!isAbsolute(raw)) throw new Error('请填绝对路径（以 / 开头）');

  const path = resolve(raw);
  const home = resolve(homedir());
  const denied = [
    ['/', '根目录'],
    [home, '用户主目录根'],
    [`${home}${sep}Desktop`, '桌面根'],
    [`${home}${sep}Downloads`, '下载目录根'],
    [sep + 'tmp', '系统临时目录'],
    [sep + 'var', '系统日志目录'],
  ];
  for (const [p, why] of denied) {
    if (path === p) throw new Error(`不能选${why}（${p}）：业务数据要放在自己建的目录里`);
  }
  return { path, home, ok: true };
}
