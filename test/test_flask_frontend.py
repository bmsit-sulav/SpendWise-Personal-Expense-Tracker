import io
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import flask_frontend


class FakeUpstreamResponse:
    def __init__(self, body, status=200, content_type="application/json"):
        self.body = body
        self.status = status
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exception_type, exception, traceback):
        return False

    def read(self):
        return self.body


class FlaskFrontendTests(unittest.TestCase):
    def setUp(self):
        flask_frontend.app.config["TESTING"] = True
        self.client = flask_frontend.app.test_client()

    def test_renders_the_existing_spendwise_page_and_assets(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn(b"SpendWise", page.data)
        self.assertIn(b"Savings goals", page.data)

        for route in ["/comparison", "/forecasting", "/assistant", "/budgets", "/savings-goals", "/calendar"]:
            feature_page = self.client.get(route)
            self.assertEqual(feature_page.status_code, 200)
            self.assertIn(b"page-route.js", feature_page.data)

        script = self.client.get("/app.js")
        self.assertEqual(script.status_code, 200)
        self.assertIn(b"/api/savings-goals", script.data)
        self.assertIn(b"/api/expense-forecast", script.data)
        self.assertIn(b"/api/financial-assistant", script.data)
        script.close()

    @patch("flask_frontend.urlopen")
    def test_forwards_api_path_query_and_method_to_node(self, open_url):
        open_url.return_value = FakeUpstreamResponse(b"[]")

        response = self.client.get("/api/expenses?month=2026-11")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])
        upstream_request = open_url.call_args.args[0]
        self.assertEqual(
            upstream_request.full_url,
            f"{flask_frontend.NODE_API_URL}/api/expenses?month=2026-11",
        )
        self.assertEqual(upstream_request.method, "GET")

    @patch("flask_frontend.urlopen")
    def test_forwards_json_body_and_upstream_status(self, open_url):
        open_url.return_value = FakeUpstreamResponse(b'{"id":"goal-1"}', status=201)
        payload = b'{"name":"Laptop"}'

        response = self.client.post(
            "/api/savings-goals",
            data=payload,
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json(), {"id": "goal-1"})
        upstream_request = open_url.call_args.args[0]
        self.assertEqual(upstream_request.data, payload)
        self.assertEqual(upstream_request.method, "POST")

    @patch("flask_frontend.urlopen")
    def test_preserves_upstream_json_errors(self, open_url):
        error_body = b'{"error":"Invalid goal"}'
        open_url.side_effect = HTTPError(
            "http://127.0.0.1/api/savings-goals",
            400,
            "Bad Request",
            {"Content-Type": "application/json"},
            io.BytesIO(error_body),
        )

        response = self.client.post("/api/savings-goals", json={})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {"error": "Invalid goal"})

    @patch("flask_frontend.urlopen", side_effect=URLError("connection refused"))
    def test_reports_when_node_backend_is_unavailable(self, open_url):
        response = self.client.get("/api/expenses")

        self.assertEqual(response.status_code, 502)
        self.assertIn("Node.js API is unavailable", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()
