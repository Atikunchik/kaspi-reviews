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
    categoryCode = serializers.CharField()
    categoryName = serializers.CharField()
    link = serializers.URLField()


class ReviewMerchantSerializer(serializers.Serializer):
    name = serializers.CharField()
    code = serializers.CharField()


class ReviewDictSerializer(serializers.Serializer):
    id = serializers.CharField()
    author = serializers.CharField()
    date = serializers.CharField()
    orderNumber = serializers.CharField()
    rating = serializers.IntegerField()
    comment = ReviewCommentSerializer()
    feedback = ReviewFeedbackSerializer()
    product = ReviewProductSerializer()
    merchant = ReviewMerchantSerializer()
    editable = serializers.BooleanField()
    editedByCustomer = serializers.BooleanField()
    locale = serializers.CharField(allow_null=True, required=False)


class ReviewListRetrieveSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=255)
    is_reviewed = serializers.BooleanField()
    review_dict = ReviewDictSerializer()
