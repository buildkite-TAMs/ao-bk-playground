"""Wait until the frontend and API are ready to accept test traffic."""

import os
import time
from urllib.error import URLError
from urllib.request import urlopen


APP_URL = os.getenv("APP_URL", "http://localhost:8080")
API_URL = os.getenv("API_URL", "http://localhost:3000")
ATTEMPTS = int(os.getenv("READINESS_ATTEMPTS", "30"))
RETRY_DELAY = float(os.getenv("READINESS_RETRY_DELAY", "1"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "5"))


def wait_for_service(url):
    for _attempt in range(ATTEMPTS):
        try:
            with urlopen(url, timeout=HTTP_TIMEOUT) as response:
                if response.status == 200:
                    return
        except URLError:
            pass

        time.sleep(RETRY_DELAY)

    raise RuntimeError(f"Service did not become ready: {url}")


def main():
    for url in (APP_URL, API_URL):
        wait_for_service(url)
        print(f"Service is ready: {url}")


if __name__ == "__main__":
    main()
