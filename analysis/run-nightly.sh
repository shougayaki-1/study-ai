#!/bin/bash
# 夜間分析バッチのエントリポイント。
# 使用するヘッドレスCLIを STUDY_AI_AGENT_CLI で切り替えられる(デフォルト: claude)。
#   STUDY_AI_AGENT_CLI=claude ./analysis/run-nightly.sh   (Claude Code, デフォルト)
#   STUDY_AI_AGENT_CLI=codex  ./analysis/run-nightly.sh   (Codex CLIに乗り換えた場合)
#
# launchd の plist からはこのスクリプトを呼び出す形にしておくと、
# CLIを乗り換えたときに plist を書き換えず環境変数1つで切り替えられる。

set -euo pipefail
cd "$(dirname "$0")/.."

ENGINE="${STUDY_AI_AGENT_CLI:-claude}"
MODEL="${STUDY_AI_AGENT_MODEL:-default}"
PROMPT="$(cat analysis/nightly.md)"

case "$ENGINE" in
  claude)
    if [ "$MODEL" = "default" ]; then
      exec /usr/bin/caffeinate -i claude -p "$PROMPT" --allowedTools "Bash,Read"
    else
      exec /usr/bin/caffeinate -i claude -p "$PROMPT" --model "$MODEL" --allowedTools "Bash,Read"
    fi
    ;;
  codex)
    # Codex CLIのヘッドレス実行フラグはバージョンにより異なる場合がある。
    # 乗り換え時は `codex exec --help` で最新のオプション名を確認し、必要なら調整すること。
    if [ "$MODEL" = "default" ]; then
      exec /usr/bin/caffeinate -i codex exec "$PROMPT"
    else
      exec /usr/bin/caffeinate -i codex exec --model "$MODEL" "$PROMPT"
    fi
    ;;
  *)
    echo "未知の STUDY_AI_AGENT_CLI: $ENGINE (claude または codex を指定)" >&2
    exit 1
    ;;
esac
