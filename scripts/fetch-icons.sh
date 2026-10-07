#!/usr/bin/env bash
# Rebuilds src/fonts/material-symbols-rounded.woff2 with only the icons the app uses.
# Run it after adding a new <Icon name="..."> (add the name to ICONS below).
set -euo pipefail
cd "$(dirname "$0")/.."

ICONS=(
  account_balance_wallet add add_circle autorenew bar_chart calendar_today cancel check chevron_left
  chevron_right close cloud_done cloud_off cloud_sync cloud_upload contrast currency_exchange
  dashboard_customize delete directions_bus donut_small drag_handle equal error expand_less expand_more
  filter_list handshake history home insert_chart ios_share link_off local_mall location_on more_horiz
  north_east payments pie_chart progress_activity receipt_long restaurant schedule search search_off
  settings south_west swap_horiz swap_vert sync sync_problem table_view toll tune work
)
names=$(IFS=,; echo "${ICONS[*]}")
# Safari's user agent makes Google Fonts answer with woff2
ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
css=$(curl -fsS -A "$ua" "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400..500,0..1,0&icon_names=${names}&display=block")
url=$(grep -oE 'https://fonts.gstatic.com[^)]+' <<<"$css")
curl -fsS -A "$ua" -o src/fonts/material-symbols-rounded.woff2 "$url"
echo "saved $(wc -c <src/fonts/material-symbols-rounded.woff2) bytes"
