import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import Flask, Response, jsonify, render_template, request


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
NODE_API_URL = os.environ.get("SPENDWISE_NODE_API", "http://127.0.0.1:3000").rstrip("/")
API_TIMEOUT_SECONDS = 10

app = Flask(
    __name__,
    template_folder=str(PUBLIC_DIR),
    static_folder=str(PUBLIC_DIR),
    static_url_path="",
)


@app.get("/")
@app.get("/comparison")
@app.get("/budgets")
@app.get("/savings-goals")
@app.get("/calendar")
def index():
    return render_template("index.html")


@app.route("/api/<path:api_path>", methods=["GET", "POST", "PUT", "DELETE"])
def proxy_api(api_path: str) -> Response | tuple[Response, int]:
    encoded_path = quote(api_path, safe="/")
    target_url = f"{NODE_API_URL}/api/{encoded_path}"
    if request.query_string:
        target_url = f"{target_url}?{request.query_string.decode('ascii')}"

    headers: dict[str, str] = {}
    if request.content_type:
        headers["Content-Type"] = request.content_type
    if request.headers.get("Accept"):
        headers["Accept"] = request.headers["Accept"]

    upstream_request = Request(
        target_url,
        data=request.get_data() or None,
        headers=headers,
        method=request.method,
    )
    try:
        with urlopen(upstream_request, timeout=API_TIMEOUT_SECONDS) as upstream:
            return _response_from_upstream(
                upstream.read(),
                upstream.status,
                upstream.headers.get("Content-Type"),
            )
    except HTTPError as error:
        return _response_from_upstream(
            error.read(),
            error.code,
            error.headers.get("Content-Type"),
        )
    except (URLError, TimeoutError):
        return jsonify({"error": "Node.js API is unavailable. Start the backend with `npm start`."}), 502


def _response_from_upstream(
    body: bytes,
    status: int,
    content_type: str | None,
) -> Response:
    return Response(
        body,
        status=status,
        content_type=content_type or "application/json; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )


if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=False,
    )