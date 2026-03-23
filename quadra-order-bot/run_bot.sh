#!/bin/bash
# quadra-order-bot 自動再起動ラッパー
# 終了したら5秒後に再起動。50MB超えでログローテーション。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$SCRIPT_DIR/bot.log"
MAX_LOG_MB=50

while true; do
    # ログローテーション（50MB超えたら退避）
    if [ -f "$LOG_FILE" ]; then
        LOG_MB=$(du -m "$LOG_FILE" 2>/dev/null | cut -f1)
        if [ "${LOG_MB:-0}" -gt "$MAX_LOG_MB" ]; then
            ARCHIVE="$LOG_FILE.$(date '+%Y%m%d_%H%M%S').old"
            mv "$LOG_FILE" "$ARCHIVE"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ログローテーション: $ARCHIVE" >> "$LOG_FILE"
            # 古いアーカイブを3つ以上保持しない
            ls -t "$SCRIPT_DIR"/bot.log.*.old 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null
        fi
    fi

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Bot起動 ===" >> "$LOG_FILE"
    python3 "$SCRIPT_DIR/bot.py" >> "$LOG_FILE" 2>&1
    EXIT_CODE=$?
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] === Bot終了 (exit: $EXIT_CODE) 5秒後に再起動 ===" >> "$LOG_FILE"
    sleep 5
done
