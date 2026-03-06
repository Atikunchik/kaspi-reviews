# main/ — Django App Rules

## App Layout
```
main/
├── models.py        # DB models
├── serializers.py   # DRF serializers
├── views.py         # API views (keep thin)
├── services.py      # Business logic lives here
├── urls.py          # URL patterns for this app
├── admin.py         # Admin registration
└── tests.py         # Tests (split into test_*.py files as app grows)
```

## Models
- Always define `__str__` on every model
- Add `created_at = models.DateTimeField(auto_now_add=True)` to new models
- Add `updated_at = models.DateTimeField(auto_now=True)` to new models
- Register every model in `admin.py`

## Views & Serializers
- Keep views thin — put business logic in `services.py`
- Use `ModelSerializer`; define `fields` explicitly, never `fields = '__all__'`
- Use `get_object_or_404` in views — never raw `.get()`
- Use `select_related` / `prefetch_related` to prevent N+1 queries

## URL Wiring
- App URLs are included in `config/urls.py`
- Keep URL patterns in `main/urls.py`, not in `config/urls.py` directly

## Tests
- Test: happy path · validation error · not found (404) · permission denied
- Use `APIClient` from DRF for endpoint tests
