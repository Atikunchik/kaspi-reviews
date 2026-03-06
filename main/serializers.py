from rest_framework import serializers


class ReviewWriteSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=255)
    review_dict = serializers.DictField(default=dict)
    is_reviewed = serializers.BooleanField(default=False, required=False)


class ReviewCommentSerializer(serializers.Serializer):
    minus = serializers.CharField(allow_blank=True)
    plus = serializers.CharField(allow_blank=True)
    text = serializers.CharField(allow_blank=True)


class ReviewFeedbackSerializer(serializers.Serializer):
    positive = serializers.IntegerField()
    voted = serializers.BooleanField()


class ReviewProductSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    category_code = serializers.CharField(source='categoryCode')
    category_name = serializers.CharField(source='categoryName')
    link = serializers.URLField()


class ReviewMerchantSerializer(serializers.Serializer):
    name = serializers.CharField()
    code = serializers.CharField()


class ReviewDictSerializer(serializers.Serializer):
    id = serializers.CharField()
    author = serializers.CharField()
    date = serializers.CharField()
    order_number = serializers.CharField(source='orderNumber')
    rating = serializers.IntegerField()
    comment = ReviewCommentSerializer()
    feedback = ReviewFeedbackSerializer()
    product = ReviewProductSerializer()
    merchant = ReviewMerchantSerializer()
    edited_by_customer = serializers.BooleanField(source='editedByCustomer')
    locale = serializers.CharField(allow_null=True, required=False)


class ReviewListRetrieveSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=255)
    is_reviewed = serializers.BooleanField()
    review_dict = ReviewDictSerializer()


class ProductIdListSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField(allow_blank=True, required=False)


class ProductListSerializer(serializers.Serializer):
    products = ProductIdListSerializer(many=True)
