import sys
from pathlib import Path

import webview

from app.api import Api
from app import history_store, paths


def main() -> None:
    paths.init()
    history_store.init_db()

    index = paths.index_html()
    if not index.is_file():
        print(
            "Frontend not built. Run:\n"
            "  cd frontend && npm install && npm run build",
            file=sys.stderr,
        )
        sys.exit(1)

    ffmpeg = paths.ffmpeg_binary()
    if ffmpeg is None:
        print(
            "Warning: bundled ffmpeg not found. Run scripts/fetch-ffmpeg.sh\n"
            "Whisper may fail if ffmpeg is not installed on your system.",
            file=sys.stderr,
        )

    url = index.as_uri()
    api = Api()

    window = webview.create_window(
        "Whispered",
        url=url,
        js_api=api,
        width=960,
        height=720,
        min_size=(640, 480),
    )

    webview.start(debug=False)


if __name__ == "__main__":
    main()
