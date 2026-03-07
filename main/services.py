import logging
import os
import time

import requests
from django.conf import settings
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

_mongo_client = None


def _get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        logger.info("Connecting to MongoDB: %s", settings.MONGODB_URI)
        try:
            _mongo_client = MongoClient(settings.MONGODB_URI)
            logger.info("MongoDB connection established")
        except Exception as e:
            logger.error("Failed to connect to MongoDB: %s", e, exc_info=True)
            raise
    return _mongo_client


class MongoReviewCollectionService:
    def __init__(self):
        self.collection = _get_mongo_client()[settings.MONGODB_DB_NAME][settings.MONGODB_COLLECTION_NAME]

    def exists(self, order_number: str) -> bool:
        return self.collection.count_documents({"_id": order_number}, limit=1) > 0

    def create(self, order_number: str, review_dict: dict) -> bool:
        payload = {
            "_id": order_number,
            "is_reviewed": False,
            "review_dict": review_dict or {},
        }
        try:
            self.collection.insert_one(payload)
        except DuplicateKeyError:
            return False
        return True

    def save_if_not_exists(self, order_number: str, review_dict: dict) -> bool:
        if self.exists(order_number=order_number):
            return False
        return self.create(order_number=order_number, review_dict=review_dict)


class MongoProductIdCollectionService:
    def __init__(self):
        self.collection = _get_mongo_client()[settings.MONGODB_DB_NAME][settings.MONGODB_PRODUCT_IDS_COLLECTION_NAME]

    def save(self, product_id: str, product_name: str = "", merchant_code: str = "") -> bool:
        if not product_id or not merchant_code:
            return False
        doc_id = f"{merchant_code}:{product_id}"
        self.collection.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "product_id": str(product_id),
                    "name": product_name or "",
                    "merchant_code": merchant_code,
                }
            },
            upsert=True,
        )
        return True

    def list_items(self) -> list[dict]:
        return list(self.collection.find().sort("_id", 1))


mongo_review_service = MongoReviewCollectionService()
mongo_product_id_service = MongoProductIdCollectionService()


class KaspiShopParserClient:
    HEADERS = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
        "Origin": "https://kaspi.kz",
        "Referer": "https://kaspi.kz/",
        "Sec-CH-UA": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"macOS"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/143.0.0.0 Safari/537.36",
        "X-Auth-Version": "3",
    }

    BASE_URL = "https://kaspi.kz/yml"

    def get_all_reviews(self, merchant: str = "1Fit", limit: int = 10) -> list:
        headers = {**self.HEADERS, "Cookie": os.getenv("KASPI_COOKIE", "")}
        url = f"https://kaspi.kz/yml/review-view/api/v1/reviews/merchant/{merchant}?limit={limit}&page=0&sort=DATE&days=365"
        logger.info("Kaspi API → GET %s", url)
        start = time.monotonic()
        try:
            response = requests.get(url=url, headers=headers, timeout=30)
            elapsed = time.monotonic() - start
            logger.info(
                "Kaspi API ← status=%d elapsed=%.2fs merchant=%s",
                response.status_code, elapsed, merchant,
            )
            if not response.ok:
                logger.error(
                    "Kaspi API non-2xx: status=%d merchant=%s body=%s",
                    response.status_code, merchant, response.text[:300],
                )
            return response.json()
        except requests.exceptions.Timeout:
            logger.error("Kaspi API timeout after %.2fs: %s", time.monotonic() - start, url)
            raise
        except requests.exceptions.RequestException as e:
            logger.error("Kaspi API request failed: %s", e, exc_info=True)
            raise

    def parse_all_reviews(self, limit: int = 10) -> list:
        merchants_ids = [
            mid.strip()
            for mid in os.getenv("KASPI_MERCHANT_IDS", "").split(",")
            if mid.strip()
        ]
        logger.info("Starting review parse for %d merchant(s): %s", len(merchants_ids), merchants_ids)
        for merchant_id in merchants_ids:
            try:
                reviews = self.get_all_reviews(merchant_id, limit)["data"]
                logger.info("Fetched %d reviews for merchant %s", len(reviews), merchant_id)
                created_count = 0
                for review in reviews:
                    created = mongo_review_service.save_if_not_exists(
                        order_number=review["orderNumber"],
                        review_dict=review,
                    )
                    if created:
                        created_count += 1
                        product = review.get("product", {}) or {}
                        product_id = str(product.get("id", "")).strip()
                        product_name = str(product.get("name", "")).strip()
                        merchant_code = str(review.get("merchant", {}).get("code", "")).strip()
                        mongo_product_id_service.save(
                            product_id=product_id,
                            product_name=product_name,
                            merchant_code=merchant_code,
                        )
                logger.info("Saved %d new review(s) for merchant %s", created_count, merchant_id)
            except Exception as e:
                logger.error("Failed to parse reviews for merchant %s: %s", merchant_id, e, exc_info=True)

kaspi_shop_shop_parser = KaspiShopParserClient()
