from django.conf import settings
from drf_spectacular.utils import extend_schema
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ReviewListRetrieveSerializer, ReviewWriteSerializer

client = MongoClient(settings.MONGODB_URI)
collection = client[settings.MONGODB_DB_NAME][settings.MONGODB_COLLECTION_NAME]


def _serialize_document(document: dict) -> dict:
    return {
        "order_number": document["_id"],
        "is_reviewed": bool(document.get("is_reviewed", False)),
        "review_dict": document.get("review_dict", {}),
    }


class ReviewListCreateView(APIView):
    @extend_schema(
        operation_id="reviews_list",
        responses={200: ReviewListRetrieveSerializer(many=True)},
    )
    def get(self, request):
        reviews = [_serialize_document(doc) for doc in collection.find().sort("_id", 1)]
        return Response(reviews)

    @extend_schema(
        operation_id="reviews_create",
        request=ReviewWriteSerializer,
        responses={201: ReviewListRetrieveSerializer},
    )
    def post(self, request):
        serializer = ReviewWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {
            "_id": serializer.validated_data["order_number"],
            "is_reviewed": serializer.validated_data.get("is_reviewed", False),
            "review_dict": serializer.validated_data.get("review_dict", {}),
        }
        try:
            collection.insert_one(payload)
        except DuplicateKeyError:
            return Response(
                {"detail": "order_number already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        created = collection.find_one({"_id": payload["_id"]})
        return Response(_serialize_document(created), status=status.HTTP_201_CREATED)


class ReviewDetailView(APIView):
    @extend_schema(
        operation_id="reviews_retrieve",
        responses={200: ReviewListRetrieveSerializer},
    )
    def get(self, request, order_number: str):
        review = collection.find_one({"_id": order_number})
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
        serializer = ReviewWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["order_number"] != order_number:
            return Response(
                {"detail": "order_number in body must match URL."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._update(order_number, {"review_dict": data.get("review_dict", {})})

    @extend_schema(
        operation_id="reviews_partial_update",
        request=ReviewWriteSerializer,
        responses={200: ReviewListRetrieveSerializer},
    )
    def patch(self, request, order_number: str):
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
        return self._update(order_number, update_data)

    @extend_schema(
        operation_id="reviews_delete",
        responses={204: None},
    )
    def delete(self, request, order_number: str):
        result = collection.delete_one({"_id": order_number})
        if result.deleted_count == 0:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _update(self, order_number: str, data: dict):
        if not data:
            return Response({"detail": "No data provided."}, status=status.HTTP_400_BAD_REQUEST)
        result = collection.update_one({"_id": order_number}, {"$set": data})
        if result.matched_count == 0:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        updated = collection.find_one({"_id": order_number})
        return Response(_serialize_document(updated), status=status.HTTP_200_OK)
