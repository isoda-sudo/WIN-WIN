---
name: analyze-codebase
description: Use when asked to analyze or understand a codebase area, file, feature, or architecture, including dependency tracing, usage search, and test coverage assessment.
---

# Analyze Codebase

## Overview
Provide a structured, evidence-based analysis of a target file, feature, or directory. Emphasize dependencies, usage sites, tests, and refactor opportunities.

## Workflow
1. Clarify scope and target. Confirm file path, feature name, or directory.
2. Gather structure. List relevant files and directories near the target.
3. Trace dependencies. Identify imports and exports for the target.
4. Find usage sites. Search for call sites and public entry points.
5. Check tests. Locate unit and e2e coverage for the target.
6. Summarize risks and improvements. Call out refactor or cleanup candidates.

If multiple independent investigations are needed, **REQUIRED SUB-SKILL:** dispatching-parallel-agents.

## Output Format
Use this template:

```markdown
## 分析結果: [対象]

### 📁 ファイル構造
[関連ファイル一覧]

### 🔗 依存関係
- 依存先: [import]
- 依存元: [使用箇所]

### 🧪 テスト状況
[テストファイル・カバレッジ]

### 💡 改善提案
[リファクタリング候補]
```

## Common Mistakes
- Skipping test discovery. Always check unit and e2e coverage.
- Listing files without explaining why they matter.
- Making suggestions without linking to evidence.
