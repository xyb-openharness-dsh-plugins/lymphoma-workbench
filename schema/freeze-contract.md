# schema 冻结合同

`schema/` 下的迁移一旦对外发布就不许改：改历史迁移 = 两台机器的库结构不一致 = 数据不可复现。
`scripts/check-schema.mjs` 逐条比对这里的 sha256 与磁盘文件，缺记录或哈希不符即 `npm run check` 失败。

**要改结构，就新增 `0002_*.sql`，并在此表追加一行。修改已列出的文件一律视为破坏合同。**

| 文件 | sha256 |
| --- | --- |
| `0001_initial.sql` | bdafda330b420ef21ca29fe06c3c490052b2fbfe06ce758db7bcf5ee7b430ee9 |
| `0002_import.sql` | 525a39da0101587ce8854649d062a7d255a0745cea944620ae9ff8a2c706229e |

## 记录规则

1. 文件名必须是 `NNNN_[a-z0-9_]+.sql`，序号递增不跳号。
2. 迁移文件里最后一行必须是 `PRAGMA user_version = N;`，N 与序号一致。
3. 哈希用 `shasum -a 256 schema/000N_*.sql` 取，不要手抄。
4. 只追加，不删除；如果某个迁移从未在任何机器上执行过且需要作废，另写新文件并在本表下方注明作废原因。
