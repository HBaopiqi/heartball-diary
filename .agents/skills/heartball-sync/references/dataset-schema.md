# 资料格式

复制最新原文整理包中的完整 `dataset`，保留所有未知字段，再替换受影响日期的整理结果。不要按下面的字段清单重新构造原始来源对象。顶层为：

```json
{
  "schemaVersion": 2,
  "syncedAt": "2026-01-12T18:00:00+08:00",
  "queryEnd": "2026-01-12T18:00:00+08:00",
  "today": "2026-01-12",
  "stats": {},
  "days": [],
  "raw": [],
  "topics": []
}
```

以上时间是格式示例，实际值来自原文同步材料，不填写当前写作时间冒充同步时间。

## 原始来源 `raw`

每个来源原样保留 `id`（`memory-原始ID` 或 `note-原始ID`）、`sourceId`（原始ID）、已有的 `originalId`、`source`（memory/note）、`date`、`dates`（已知跨日日期）、`start`、`end`、`rawText`、`originalTitle`、`originalSummary` 和已有的 `sourceHash`（来源版本）。完整原话放 `rawText`，设备自动摘要放 `originalSummary`。来源内容或版本修订必须先由本地服务同步，再重新取得整理包；导入回顾不能改写这些字段。

整理后补充 `title`、`text`、`category`、`reviewDisposition`、`filteredReason`。类别为学习、创作、生活、交流或其他；审阅类型为 included/context/filtered。空白和背景示例可过滤，但原始来源仍保留。不得换用作者的来源 ID 或示例 ID。

## 每日 `days`

每项包含 `date`、`review`、`synthesis`、`events`、`coverage`、`rawCount`、`filteredCount`。

- `review` 与 `synthesis.overview` 相同，为当天综合概览。
- `synthesis.sections`：`{title,text,sourceIds}` 数组。
- `synthesis.progress` 和 `nextActions`：`{text,sourceIds}` 数组。
- `synthesis.sourceIds`：当天全部原始来源 ID，包括跨日来源和过滤来源。
- `synthesis.coverageNote`：当日资料范围和必要证据限制。
- `coverage`：`sourceCount`、`reviewedSourceCount`、`memoryCount`、`noteCount`、`sentenceCount`，从实际来源计算。

每个要点引用的来源必须属于当天，且实际支撑其结论。不要为了填满栏目制造内容。

## 事件与主题

`events` 保留 `id`、`source`、`title`、`text`、`category`、`start`、`end`、`status`、`sourceIds`、`rawText`、`originalSummary`、`topics` 和 `timeBasis: "recording"`。`status` 为已记录、计划或听课与讨论。来源 ID 与已有收藏关联，应保持稳定。

`topics` 为 `{id,title,summary,events}` 数组；主题事件附带 `date`。从事件重新计算，不预填作者个人的学习或项目主题。顶层 `stats` 根据实际数据计算，不能声称未读来源已审阅。

参照 `scripts/create-demo.mjs` 可查看完整结构；其中内容是虚构排版示例，不能当作用户经历。若本地服务版本提供更严格的导入校验，以运行中的校验错误为准修复资料，不绕过校验。
