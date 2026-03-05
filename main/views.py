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

        query = {} if request.user.is_superuser else {"review_dict.merchant.code": merchant_id}
        reviews = [_serialize_document(doc) for doc in collection.find(query).sort("_id", 1)]
        return Response(reviews)

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

        query = {} if request.user.is_superuser else {"merchant_code": merchant_id}
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
