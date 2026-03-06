import re
from datetime import datetime, timedelta

from django.conf import settings
from drf_spectacular.utils import extend_schema
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserMerchantProfile
from .serializers import ProductListSerializer, ReviewListRetrieveSerializer, ReviewWriteSerializer

client = MongoClient(settings.MONGODB_URI)
collection = client[settings.MONGODB_DB_NAME][settings.MONGODB_COLLECTION_NAME]
product_ids_collection = client[settings.MONGODB_DB_NAME][settings.MONGODB_PRODUCT_IDS_COLLECTION_NAME]


def _serialize_document(document: dict) -> dict:
    return {
        "order_number": document["_id"],
        "is_reviewed": bool(document.get("is_reviewed", False)),
        "review_dict": document.get("review_dict", {}),
    }


def _get_user_merchant_id(user) -> str:
    if user.is_superuser:
        return ""
    try:
        return user.merchant_profile.merchant_id
    except UserMerchantProfile.DoesNotExist:
        return ""


class ReviewListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="reviews_list",
        responses={200: ReviewListRetrieveSerializer(many=True)},
    )
    def get(self, request):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        status_filter = request.query_params.get("status", "all")
        ratings_str = request.query_params.get("ratings", "")
        min_positive_str = request.query_params.get("min_positive", "")
        product_ids_str = request.query_params.get("product_ids", "")
        date_from_str = request.query_params.get("date_from", "")
        date_to_str = request.query_params.get("date_to", "")
        order_query = request.query_params.get("order_number", "").strip()
        phone_query = request.query_params.get("phone", "").strip()
        product_name_query = request.query_params.get("product_name", "").strip()
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = max(1, min(500, int(request.query_params.get("page_size", 20))))
        except (ValueError, TypeError):
            page_size = 20

        base_match = {} if request.user.is_superuser else {"review_dict.merchant.code": merchant_id}

        if status_filter == "viewed":
            base_match["is_reviewed"] = True
        elif status_filter == "not_viewed":
            base_match["is_reviewed"] = False

        if product_ids_str:
            product_ids = [p.strip() for p in product_ids_str.split(",") if p.strip()]
            int_ids = [int(p) for p in product_ids if p.isdigit()]
            base_match["review_dict.product.id"] = {"$in": product_ids + int_ids}

        if order_query:
            base_match["_id"] = {"$regex": re.escape(order_query), "$options": "i"}

        if phone_query:
            phone_regex = {"$regex": re.escape(phone_query), "$options": "i"}
            base_match["$or"] = [
                {"review_dict.phone_number": phone_regex},
                {"review_dict.customer.phone_number": phone_regex},
            ]

        if product_name_query:
            base_match["review_dict.product.name"] = {"$regex": re.escape(product_name_query), "$options": "i"}

        if min_positive_str:
            try:
                min_positive = int(min_positive_str)
                if min_positive > 0:
                    base_match["review_dict.feedback.positive"] = {"$gte": min_positive}
            except (ValueError, TypeError):
                pass

        rating_ints = [
            int(r) for r in ratings_str.split(",")
            if r.strip().isdigit() and 1 <= int(r.strip()) <= 5
        ] if ratings_str else []

        pipeline = [{"$match": base_match}]
        pipeline.append({
            "$addFields": {
                "parsed_date": {
                    "$dateFromString": {
                        "dateString": "$review_dict.date",
                        "format": "%d.%m.%Y",
                        "onError": None,
                        "onNull": None,
                    }
                },
                "rating_int": {
                    "$convert": {
                        "input": "$review_dict.rating",
                        "to": "int",
                        "onError": None,
                        "onNull": None,
                    }
                },
            }
        })

        second_match = {}
        if rating_ints:
            second_match["rating_int"] = {"$in": rating_ints}

        date_cond = {}
        if date_from_str:
            try:
                date_cond["$gte"] = datetime.strptime(date_from_str, "%Y-%m-%d")
            except ValueError:
                pass
        if date_to_str:
            try:
                date_cond["$lte"] = datetime.strptime(date_to_str, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59
                )
            except ValueError:
                pass
        if date_cond:
            second_match["parsed_date"] = date_cond

        if second_match:
            pipeline.append({"$match": second_match})

        pipeline.append({"$sort": {"parsed_date": -1}})

        skip = (page - 1) * page_size
        pipeline.append({
            "$facet": {
                "total": [{"$count": "count"}],
                "data": [{"$skip": skip}, {"$limit": page_size}],
            }
        })

        facet_result = list(collection.aggregate(pipeline))
        facet = facet_result[0] if facet_result else {"total": [], "data": []}
        total = facet["total"][0]["count"] if facet["total"] else 0

        return Response({
            "results": [_serialize_document(doc) for doc in facet["data"]],
            "total": total,
            "page": page,
            "page_size": page_size,
        })

    @extend_schema(
        operation_id="reviews_create",
        request=ReviewWriteSerializer,
        responses={201: ReviewListRetrieveSerializer},
    )
    def post(self, request):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        serializer = ReviewWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {
            "_id": serializer.validated_data["order_number"],
            "is_reviewed": serializer.validated_data.get("is_reviewed", False),
            "review_dict": serializer.validated_data.get("review_dict", {}),
        }
        payload_merchant_code = str(payload["review_dict"].get("merchant", {}).get("code", "")).strip()
        if not request.user.is_superuser and payload_merchant_code != merchant_id:
            return Response({"detail": "You can create only reviews for your merchant."}, status=403)

        try:
            collection.insert_one(payload)
        except DuplicateKeyError:
            return Response(
                {"detail": "order_number already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_id = str(payload["review_dict"].get("product", {}).get("id", "")).strip()
        product_name = str(payload["review_dict"].get("product", {}).get("name", "")).strip()
        if product_id and payload_merchant_code:
            product_ids_collection.update_one(
                {"_id": f"{payload_merchant_code}:{product_id}"},
                {"$set": {"product_id": product_id, "name": product_name, "merchant_code": payload_merchant_code}},
                upsert=True,
            )

        created = collection.find_one({"_id": payload["_id"]})
        return Response(_serialize_document(created), status=status.HTTP_201_CREATED)


class ReviewDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="reviews_retrieve",
        responses={200: ReviewListRetrieveSerializer},
    )
    def get(self, request, order_number: str):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        query = {"_id": order_number}
        if not request.user.is_superuser:
            query["review_dict.merchant.code"] = merchant_id

        review = collection.find_one(query)
        if not review:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not review.get("is_reviewed", False):
            collection.update_one({"_id": order_number}, {"$set": {"is_reviewed": True}})
            review["is_reviewed"] = True
        return Response(_serialize_document(review))

    @extend_schema(
        operation_id="reviews_update",
        request=ReviewWriteSerializer,
        responses={200: ReviewListRetrieveSerializer},
    )
    def put(self, request, order_number: str):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        serializer = ReviewWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["order_number"] != order_number:
            return Response(
                {"detail": "order_number in body must match URL."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.is_superuser:
            payload_merchant_code = str(data.get("review_dict", {}).get("merchant", {}).get("code", "")).strip()
            if payload_merchant_code != merchant_id:
                return Response({"detail": "You can update only reviews for your merchant."}, status=403)
        return self._update(order_number, {"review_dict": data.get("review_dict", {})}, merchant_id, request.user.is_superuser)

    @extend_schema(
        operation_id="reviews_partial_update",
        request=ReviewWriteSerializer,
        responses={200: ReviewListRetrieveSerializer},
    )
    def patch(self, request, order_number: str):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        serializer = ReviewWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "order_number" in data and data["order_number"] != order_number:
            return Response(
                {"detail": "order_number in body must match URL."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_data = {}
        if "review_dict" in data:
            update_data["review_dict"] = data["review_dict"]
        if "is_reviewed" in data:
            update_data["is_reviewed"] = data["is_reviewed"]
        if not request.user.is_superuser and "review_dict" in update_data:
            payload_merchant_code = str(update_data["review_dict"].get("merchant", {}).get("code", "")).strip()
            if payload_merchant_code and payload_merchant_code != merchant_id:
                return Response({"detail": "You can update only reviews for your merchant."}, status=403)
        return self._update(order_number, update_data, merchant_id, request.user.is_superuser)

    @extend_schema(
        operation_id="reviews_delete",
        responses={204: None},
    )
    def delete(self, request, order_number: str):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        query = {"_id": order_number}
        if not request.user.is_superuser:
            query["review_dict.merchant.code"] = merchant_id
        result = collection.delete_one(query)
        if result.deleted_count == 0:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update(self, order_number: str, data: dict, merchant_id: str, is_superuser: bool):
        if not data:
            return Response({"detail": "No data provided."}, status=status.HTTP_400_BAD_REQUEST)

        query = {"_id": order_number}
        if not is_superuser:
            query["review_dict.merchant.code"] = merchant_id
        result = collection.update_one(query, {"$set": data})
        if result.matched_count == 0:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        updated = collection.find_one(query)
        return Response(_serialize_document(updated), status=status.HTTP_200_OK)


def _build_analytics_pipeline(base_match, period_days, date_from_str, date_to_str, rating_ints=None):
    """Return aggregation pipeline stages: match → parse fields → filter by date/rating."""
    pipeline = [{"$match": base_match}]

    pipeline.append({
        "$addFields": {
            "parsed_date": {
                "$dateFromString": {
                    "dateString": "$review_dict.date",
                    "format": "%d.%m.%Y",
                    "onError": None,
                    "onNull": None,
                }
            },
            "rating_int": {
                "$convert": {
                    "input": "$review_dict.rating",
                    "to": "int",
                    "onError": None,
                    "onNull": None,
                }
            },
        }
    })

    # Date condition — take the most restrictive $gte of period_days and date_from
    gte_candidates = []
    if period_days != "all":
        try:
            gte_candidates.append(datetime.utcnow() - timedelta(days=int(period_days)))
        except (ValueError, TypeError):
            pass
    if date_from_str:
        try:
            gte_candidates.append(datetime.strptime(date_from_str, "%Y-%m-%d"))
        except ValueError:
            pass

    date_cond = {}
    if gte_candidates:
        date_cond["$gte"] = max(gte_candidates)
    if date_to_str:
        try:
            date_cond["$lte"] = datetime.strptime(date_to_str, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
        except ValueError:
            pass

    valid_ratings = rating_ints if rating_ints else [1, 2, 3, 4, 5]
    second_match = {"rating_int": {"$in": valid_ratings}}
    second_match["parsed_date"] = date_cond if date_cond else {"$ne": None}

    pipeline.append({"$match": second_match})
    return pipeline


class AnalyticsChartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        period_days = request.query_params.get("period_days", "30")
        group_by = request.query_params.get("group_by", "day")
        product_ids_str = request.query_params.get("product_ids", "")
        ratings_str = request.query_params.get("ratings", "")
        date_from_str = request.query_params.get("date_from", "")
        date_to_str = request.query_params.get("date_to", "")

        product_ids = [p.strip() for p in product_ids_str.split(",") if p.strip()]
        rating_ints = [
            int(r) for r in ratings_str.split(",")
            if r.strip().isdigit() and 1 <= int(r.strip()) <= 5
        ]

        base_match = {} if request.user.is_superuser else {"review_dict.merchant.code": merchant_id}
        if product_ids:
            int_ids = [int(p) for p in product_ids if p.isdigit()]
            base_match["review_dict.product.id"] = {"$in": product_ids + int_ids}

        pipeline = _build_analytics_pipeline(
            base_match, period_days, date_from_str, date_to_str, rating_ints or None
        )
        pipeline.append({"$project": {"parsed_date": 1, "rating_int": 1}})

        docs = list(collection.aggregate(pipeline))

        buckets = {}
        for doc in docs:
            dt = doc.get("parsed_date")
            rating = doc.get("rating_int")
            if not dt or not rating:
                continue

            if group_by == "month":
                bucket_dt = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                label = f"{bucket_dt.month:02d}.{bucket_dt.year}"
                key = f"m-{int(bucket_dt.timestamp())}"
                ts = int(bucket_dt.timestamp())
            elif group_by == "week":
                week_start = (dt - timedelta(days=dt.weekday())).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                label = f"Неделя {week_start.day:02d}.{week_start.month:02d}.{week_start.year}"
                key = f"w-{int(week_start.timestamp())}"
                ts = int(week_start.timestamp())
            else:
                bucket_dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                label = f"{bucket_dt.day:02d}.{bucket_dt.month:02d}.{bucket_dt.year}"
                key = f"d-{int(bucket_dt.timestamp())}"
                ts = int(bucket_dt.timestamp())

            if key not in buckets:
                buckets[key] = {
                    "key": key, "label": label, "ts": ts,
                    "total": 0, "ratings": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
                }
            buckets[key]["total"] += 1
            buckets[key]["ratings"][rating] = buckets[key]["ratings"].get(rating, 0) + 1

        result = sorted(buckets.values(), key=lambda x: x["ts"])
        return Response(result)


class AnalyticsProductsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        period_days = request.query_params.get("period_days", "30")
        date_from_str = request.query_params.get("date_from", "")
        date_to_str = request.query_params.get("date_to", "")
        rating_op = request.query_params.get("rating_op", "lt")
        rating_threshold_str = request.query_params.get("rating_threshold", "5")
        min_reviews_str = request.query_params.get("min_reviews", "1")
        sort_by = request.query_params.get("sort_by", "avg")
        sort_dir = request.query_params.get("sort_dir", "asc")

        try:
            rating_threshold = float(rating_threshold_str)
        except (ValueError, TypeError):
            rating_threshold = None
        try:
            min_reviews = max(1, int(min_reviews_str))
        except (ValueError, TypeError):
            min_reviews = 1

        base_match = {} if request.user.is_superuser else {"review_dict.merchant.code": merchant_id}

        pipeline = _build_analytics_pipeline(base_match, period_days, date_from_str, date_to_str)
        pipeline.append({
            "$project": {
                "rating_int": 1,
                "product_id": {"$toString": "$review_dict.product.id"},
                "product_name": "$review_dict.product.name",
            }
        })

        docs = list(collection.aggregate(pipeline))

        products = {}
        for doc in docs:
            pid = str(doc.get("product_id", "") or "").strip()
            if not pid or pid in ("None", ""):
                continue
            pname = str(doc.get("product_name", "") or "").strip() or pid
            rating = doc.get("rating_int")
            if not rating:
                continue
            if pid not in products:
                products[pid] = {
                    "id": pid, "name": pname, "count": 0, "sum": 0,
                    "ratings": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
                }
            products[pid]["count"] += 1
            products[pid]["sum"] += rating
            products[pid]["ratings"][rating] = products[pid]["ratings"].get(rating, 0) + 1

        result = [
            {**p, "avg": round(p["sum"] / p["count"], 4)}
            for p in products.values()
        ]

        result = [p for p in result if p["count"] >= min_reviews]

        if rating_threshold is not None:
            op_map = {
                "lt":  lambda a, t: a <  t,
                "lte": lambda a, t: a <= t,
                "gt":  lambda a, t: a >  t,
                "gte": lambda a, t: a >= t,
            }
            op_fn = op_map.get(rating_op, op_map["lt"])
            result = [p for p in result if op_fn(p["avg"], rating_threshold)]

        reverse = sort_dir == "desc"
        key_fns = {
            "avg":   lambda p: p["avg"],
            "count": lambda p: p["count"],
            "name":  lambda p: p["name"].lower(),
        }
        result.sort(key=key_fns.get(sort_by, key_fns["avg"]), reverse=reverse)

        total_reviews = sum(p["count"] for p in result)
        overall_avg = (
            round(sum(p["avg"] * p["count"] for p in result) / total_reviews, 4)
            if total_reviews > 0 else None
        )

        return Response({
            "products": result,
            "summary": {
                "product_count": len(result),
                "total_reviews": total_reviews,
                "overall_avg": overall_avg,
            },
        })


class AnalyticsProductDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, product_id: str):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        period_days = request.query_params.get("period_days", "all")
        group_by = request.query_params.get("group_by", "day")
        date_from_str = request.query_params.get("date_from", "")
        date_to_str = request.query_params.get("date_to", "")

        base_match = {} if request.user.is_superuser else {"review_dict.merchant.code": merchant_id}
        product_ids_filter = [product_id]
        try:
            product_ids_filter.append(int(product_id))
        except (ValueError, TypeError):
            pass
        base_match["review_dict.product.id"] = {"$in": product_ids_filter}

        pipeline = _build_analytics_pipeline(base_match, period_days, date_from_str, date_to_str)
        pipeline.append({"$project": {"parsed_date": 1, "rating_int": 1}})

        docs = list(collection.aggregate(pipeline))

        buckets = {}
        for doc in docs:
            dt = doc.get("parsed_date")
            rating = doc.get("rating_int")
            if not dt or not rating:
                continue
            if group_by == "month":
                bucket_dt = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                label = f"{bucket_dt.month:02d}.{bucket_dt.year}"
                key = f"m-{int(bucket_dt.timestamp())}"
                ts = int(bucket_dt.timestamp())
            elif group_by == "week":
                week_start = (dt - timedelta(days=dt.weekday())).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                label = f"Нед. {week_start.day:02d}.{week_start.month:02d}.{week_start.year}"
                key = f"w-{int(week_start.timestamp())}"
                ts = int(week_start.timestamp())
            else:
                bucket_dt = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                label = f"{bucket_dt.day:02d}.{bucket_dt.month:02d}.{bucket_dt.year}"
                key = f"d-{int(bucket_dt.timestamp())}"
                ts = int(bucket_dt.timestamp())

            if key not in buckets:
                buckets[key] = {"key": key, "label": label, "ts": ts, "sum": 0, "count": 0}
            buckets[key]["sum"] += rating
            buckets[key]["count"] += 1

        result = sorted(buckets.values(), key=lambda x: x["ts"])
        return Response([
            {"key": b["key"], "label": b["label"], "ts": b["ts"],
             "avg": round(b["sum"] / b["count"], 4), "count": b["count"]}
            for b in result
        ])


class ProductIdListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="products_ids_list",
        responses={200: ProductListSerializer},
    )
    def get(self, request):
        merchant_id = _get_user_merchant_id(request.user)
        if not merchant_id and not request.user.is_superuser:
            return Response({"detail": "merchant_id is not configured for this user."}, status=403)

        search = request.query_params.get("search", "").strip()
        query = {} if request.user.is_superuser else {"merchant_code": merchant_id}
        if search:
            query["name"] = {"$regex": re.escape(search), "$options": "i"}
        products = [
            {"id": doc.get("product_id", ""), "name": doc.get("name", "")}
            for doc in product_ids_collection.find(query).sort("product_id", 1)
        ]

        if not products and not request.user.is_superuser:
            legacy_products = collection.aggregate(
                [
                    {"$match": {"review_dict.merchant.code": merchant_id}},
                    {
                        "$group": {
                            "_id": "$review_dict.product.id",
                            "name": {"$first": "$review_dict.product.name"},
                        }
                    },
                    {"$sort": {"_id": 1}},
                ]
            )
            products = []
            for item in legacy_products:
                product_id = str(item.get("_id", "")).strip()
                if not product_id:
                    continue
                name = str(item.get("name", "")).strip()
                product_ids_collection.update_one(
                    {"_id": f"{merchant_id}:{product_id}"},
                    {"$set": {"product_id": product_id, "name": name, "merchant_code": merchant_id}},
                    upsert=True,
                )
                products.append({"id": product_id, "name": name})
        return Response({"products": products})
