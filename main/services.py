import requests
from django.conf import settings
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError


class MongoReviewCollectionService:
    def __init__(self):
        client = MongoClient(settings.MONGODB_URI)
        self.collection = client[settings.MONGODB_DB_NAME][settings.MONGODB_COLLECTION_NAME]

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


mongo_review_service = MongoReviewCollectionService()


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
        "Cookie": "_hjSessionUser_283363=eyJpZCI6IjdmZTFmZjVkLTczYzUtNTk3ZS1hMWUxLWJkMzJmODlkZGMxZSIsImNyZWF0ZWQiOjE3NDQ3MzY3NjE3ODksImV4aXN0aW5nIjp0cnVlfQ==; _ga=GA1.1.526450475.1752216040; _ym_uid=1756805442863961326; _ym_d=1756805442; _ga_HGJ9W4QQ44=GS2.1.s1756805441$o1$g0$t1756805455$j46$l0$h0; amp_efc83b=cB9x-fHL6Kh8ljMEKkKxrl...1jbfej3gi.1jbfej3gj.5.0.5; mc-session=1768886455.244.25654.501009|825e5f3659dba1ed7b5d7b2cbf5f1012; mc-sid=2260e5fa-7ee9-4bb0-b2b7-beab55722067; _clck=1ttxaen%5E2%5Eg34%5E0%5E2211; _clsk=oa0b4d%5E1769674899059%5E9%5E1%5Ej.clarity.ms%2Fcollect; _ga_0R30CM934D=GS2.1.s1769674810$o14$g1$t1769674960$j60$l0$h0; _hjSession_283363=eyJpZCI6ImM1MWFmMjA3LWJiZmQtNGMzYS1hMjFjLTlkMTQ2Nzk1MmRmYiIsImMiOjE3Njk2NzQ5Njg3NzMsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MX0=; amp_6e9c16=s2yzQVKaxpVN-TdPGrTytp...1jg4d4jr7.1jg4ec63b.ke.0.ke",
    }

    BASE_URL = "https://kaspi.kz/yml"

    def get_all_reviews(self, limit: int = 10) -> list:
        url = f"https://kaspi.kz/yml/review-view/api/v1/reviews/merchant/1Fit?limit={limit}&page=0&sort=DATE&days=100"
        response = requests.get(
            url=url,
            headers=self.HEADERS,
        )
        return response.json()

    def parse_all_reviews(self, limit: int = 10) -> list:
        reviews = self.get_all_reviews(limit)["data"]
        for review in reviews:
            mongo_review_service.save_if_not_exists(
                order_number=review["orderNumber"],
                review_dict=review,
            )
