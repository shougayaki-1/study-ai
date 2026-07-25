#!/bin/bash
# 夜間分析バッチのエントリポイント(手動実行専用。自動スケジュール実行は未設定)。
# 使用するヘッドレスCLIを STUDY_AI_AGENT_CLI で切り替えられる(デフォルト: claude)。
#   STUDY_AI_AGENT_CLI=claude ./analysis/run-nightly.sh   (Claude Code, デフォルト)
#   STUDY_AI_AGENT_CLI=codex  ./analysis/run-nightly.sh   (Codex CLIに乗り換えた場合)
#
# analysis/nightly.md はどちらのCLIで実行しても同じ判断根拠(historical-context.mjsが返す
# 全履歴)を使うよう、ツール名非依存の書き方にしてある。CLIを切り替えても分析の質は変わらない。

set -euo pipefail
cd "$(dirname "$0")/.."

# launchd/cronからの実行はログインシェルを経由しないため、fnmが管理する
# per-shellのmultishellパス(`fnm env`で都度変わる)はPATHに乗らず claude/codex
# コマンドが見つからないことがある。fnmの`default`エイリアスはバージョンが
# 変わっても指す先が更新される安定パスなので、フォールバックとして追加する。
FNM_DEFAULT_BIN="$HOME/.local/share/fnm/aliases/default/bin"
if [ -d "$FNM_DEFAULT_BIN" ]; then
  export PATH="$FNM_DEFAULT_BIN:$PATH"
fi

# vaultヘルパ(analysis/helpers/vault/root.mjs)は process.env.STUDY_AI_VAULT_DIR を
# 直接参照し、analysis/.env を自動では読み込まない。手動実行・launchd実行のどちらでも
# バッチが正しくvaultを指すよう、未設定なら analysis/.env から読み出してexportする。
# (パスに空白や日本語を含みうるため、値は行の残り全体をそのまま代入する)
if [ -z "${STUDY_AI_VAULT_DIR:-}" ] && [ -f analysis/.env ]; then
  VAULT_DIR_LINE="$(grep -E '^STUDY_AI_VAULT_DIR=' analysis/.env | tail -n 1 || true)"
  if [ -n "$VAULT_DIR_LINE" ]; then
    export STUDY_AI_VAULT_DIR="${VAULT_DIR_LINE#STUDY_AI_VAULT_DIR=}"
  fi
fi

if [ -z "${STUDY_AI_VAULT_DIR:-}" ]; then
  echo "STUDY_AI_VAULT_DIR が未設定です。analysis/.env に設定するか環境変数で渡してください。" >&2
  exit 1
fi

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
    # codex exec はheadless実行時デフォルトで承認プロンプトなし(AskForApproval::Never)だが、
    # sandboxは既定でworkspace-write配下のネットワークアクセスを許可しないため、
    # helpers/*.mjs がSupabase REST APIをfetchできるよう明示的に有効化する。
    # (乗り換え時は `codex exec --help` で最新のオプション名を確認し、必要なら調整すること)
    if [ "$MODEL" = "default" ]; then
      exec /usr/bin/caffeinate -i codex exec \
        --sandbox workspace-write \
        --config sandbox_workspace_write.network_access=true \
        "$PROMPT"
    else
      exec /usr/bin/caffeinate -i codex exec \
        --sandbox workspace-write \
        --config sandbox_workspace_write.network_access=true \
        --model "$MODEL" "$PROMPT"
    fi
    ;;
  *)
    echo "未知の STUDY_AI_AGENT_CLI: $ENGINE (claude または codex を指定)" >&2
    exit 1
    ;;
esac
