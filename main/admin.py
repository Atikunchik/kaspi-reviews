from django.contrib import admin

from .models import UserMerchantProfile


@admin.register(UserMerchantProfile)
class UserMerchantProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "merchant_id")
    search_fields = ("user__username", "merchant_id")
