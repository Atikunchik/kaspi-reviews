from django.contrib.auth import get_user_model
from django.db import models


class UserMerchantProfile(models.Model):
    user = models.OneToOneField(get_user_model(), on_delete=models.CASCADE, related_name="merchant_profile")
    merchant_id = models.CharField(max_length=255, db_index=True)

    def __str__(self) -> str:
        return f"{self.user.username} -> {self.merchant_id}"
