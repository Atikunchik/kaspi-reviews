from django.urls import path

from .views import (
    AnalyticsChartView,
    AnalyticsProductDetailView,
    AnalyticsProductsView,
    ProductIdListView,
    ReviewDetailView,
    ReviewListCreateView,
)

urlpatterns = [
    path("reviews/", ReviewListCreateView.as_view(), name="reviews-list-create"),
    path("reviews/<str:order_number>/", ReviewDetailView.as_view(), name="reviews-detail"),
    path("products/ids/", ProductIdListView.as_view(), name="products-ids"),
    path("analytics/chart/", AnalyticsChartView.as_view(), name="analytics-chart"),
    path("analytics/products/", AnalyticsProductsView.as_view(), name="analytics-products"),
    path("analytics/products/<str:product_id>/detail/", AnalyticsProductDetailView.as_view(), name="analytics-product-detail"),
]
