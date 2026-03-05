from django.urls import path

from .views import ReviewDetailView, ReviewListCreateView

urlpatterns = [
    path("reviews/", ReviewListCreateView.as_view(), name="reviews-list-create"),
    path("reviews/<str:order_number>/", ReviewDetailView.as_view(), name="reviews-detail"),
]
