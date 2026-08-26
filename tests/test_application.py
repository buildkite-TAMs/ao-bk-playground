"""Black-box tests for the NASA Image Explorer.

The application must be running before this suite is executed. Override APP_URL
and API_URL when the services are not exposed on their local Compose ports.
"""

import json
import os
import unittest
from datetime import date, timedelta
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


APP_URL = os.getenv("APP_URL", "http://localhost:8080").rstrip("/")
API_URL = os.getenv("API_URL", "http://localhost:3000").rstrip("/")
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "5"))
RUN_LIVE_NASA_TEST = os.getenv("RUN_LIVE_NASA_TEST", "").lower() in {
    "1",
    "true",
    "yes",
}


class IdCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, _tag, attrs):
        element_id = dict(attrs).get("id")
        if element_id:
            self.ids.add(element_id)


def get(base_url, path, query=None):
    url = f"{base_url}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    request = Request(url, headers={"Accept": "application/json, text/html"})
    try:
        response = urlopen(request, timeout=HTTP_TIMEOUT)
    except HTTPError as error:
        return error.code, error.headers, error.read()

    with response:
        return response.status, response.headers, response.read()


def decode_json(body):
    return json.loads(body.decode("utf-8"))


class FrontendTests(unittest.TestCase):
    def test_home_page_contains_required_controls(self):
        status, headers, body = get(APP_URL, "/")

        self.assertEqual(status, 200)
        self.assertIn("text/html", headers.get_content_type())

        parser = IdCollector()
        parser.feed(body.decode("utf-8"))
        self.assertTrue(
            {
                "apod-date-form",
                "apod-date",
                "nasa-image",
                "nasa-video",
                "image-error",
                "retry-image",
            }.issubset(parser.ids)
        )

    def test_frontend_assets_are_served(self):
        for path, content_type, expected_text in (
            ("/render.js", "application/javascript", "renderNasaImage"),
            ("/styles.css", "text/css", ".image-card"),
        ):
            with self.subTest(path=path):
                status, headers, body = get(APP_URL, path)
                self.assertEqual(status, 200)
                self.assertEqual(headers.get_content_type(), content_type)
                self.assertIn(expected_text, body.decode("utf-8"))


class ApiTests(unittest.TestCase):
    def test_root_endpoint_is_available(self):
        status, _headers, body = get(API_URL, "/")

        self.assertEqual(status, 200)
        self.assertIn("Hello this is a new appp", body.decode("utf-8"))

    def test_rejects_invalid_apod_dates_without_calling_nasa(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()

        for invalid_date in ("not-a-date", "1995-06-15", "2024-02-30", tomorrow):
            with self.subTest(date=invalid_date):
                status, headers, body = get(
                    API_URL,
                    "/api/nasaimage",
                    {"date": invalid_date},
                )
                payload = decode_json(body)

                self.assertEqual(status, 400)
                self.assertEqual(headers.get_content_type(), "application/json")
                self.assertFalse(payload["success"])
                self.assertEqual(
                    payload["error"],
                    "Date must be between 1995-06-16 and today",
                )

    @unittest.skipUnless(
        RUN_LIVE_NASA_TEST,
        "set RUN_LIVE_NASA_TEST=1 to call the live NASA-backed endpoint",
    )
    def test_nasa_endpoint_returns_normalized_image_data(self):
        status, headers, body = get(
            API_URL,
            "/api/nasaimage",
            {"date": "2024-01-01"},
        )
        payload = decode_json(body)

        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "application/json")
        self.assertTrue(payload["success"])

        image = payload["item"]
        self.assertEqual(image["date"], "2024-01-01")
        self.assertTrue(image["title"])
        self.assertTrue(image["explanation"])
        self.assertIn(image["mediaType"], {"image", "video"})

        for field in ("mediaUrl", "imageUrl", "hdImageUrl"):
            self.assertIn(urlparse(image[field]).scheme, {"http", "https"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
