#!/usr/bin/env bash
set -euo pipefail
if ! command -v flutter >/dev/null 2>&1; then
  sdk_dir="${FLUTTER_SDK_DIR:-/tmp/growgame-flutter-sdk}"
  if [ ! -x "$sdk_dir/bin/flutter" ]; then
    git clone --depth 1 --branch 3.47.9 https://github.com/flutter/flutter.git "$sdk_dir"
  fi
  export PATH="$sdk_dir/bin:$PATH"
fi
flutter pub get
flutter build web --no-web-resources-cdn \
  --dart-define=API_BASE_URL="${API_BASE_URL:-https://cropgrow-api.sangsangbar.com}"
node scripts/finalize-web.cjs
