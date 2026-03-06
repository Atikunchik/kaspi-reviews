# Architecture & Django Best Practices

> Reference doc — load with `@docs/architecture.md` when designing or reviewing backend code.

---

## Project Layout

```
config/          # Django project config (settings, urls, wsgi, asgi)
main/            # Main app — models, views, serializers, services, urls
docs/            # Architecture and task docs
frontend/        # React SPA (Vite)
manage.py
requirements.txt
.env             # Never commit — see .env.example
```

---

## Layer Responsibilities

### models.py — Data Shape
- Define database structure only. No business logic.
- Always define `__str__`.
- Always add `created_at = DateTimeField(auto_now_add=True)` and `updated_at = DateTimeField(auto_now=True)`.
- Register every model in `admin.py`.

### serializers.py — Validation & Shape
- Use `ModelSerializer` when possible; list `fields` explicitly — never `fields = '__all__'`.
- Use plain `Serializer` for non-model shapes (e.g. MongoDB documents).
- Serializers validate input and shape output — nothing more.
- Write separate serializers for read vs. write if they differ significantly.

### services.py — Business Logic
- All business logic lives here, not in views.
- Services are plain Python classes or functions — no Django request/response objects.
- A service can call other services, the ORM, or external APIs.
- Keep each service class focused on one resource/concern.

```python
# Good
class ReviewService:
    def get_filtered(self, merchant_id, filters): ...
    def create(self, order_number, data): ...

# Bad — logic inline in view
def get(self, request):
    docs = collection.aggregate([...])  # belongs in services.py
```

### views.py — HTTP Layer Only
- Accept request, call a service, return response.
- No aggregation pipelines, no raw DB queries, no business rules.
- Use `APIView` or DRF generic views.
- Always use `permission_classes`.
- Use `get_object_or_404` for Django ORM lookups — never raw `.get()`.

```python
# Good
def get(self, request):
    data = review_service.get_filtered(merchant_id, request.query_params)
    return Response(data)

# Bad
def get(self, request):
    pipeline = [{"$match": ...}, {"$group": ...}]  # move to services.py
    result = collection.aggregate(pipeline)
    return Response(result)
```

### urls.py — Routing Only
- App routes stay in `main/urls.py`.
- `config/urls.py` only includes app URLconfs and project-level endpoints (admin, auth, schema).

---

## Settings

- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` always come from environment variables.
- Never hard-code secrets. Use `os.environ['KEY']` (raises on missing) for required vars, `os.getenv('KEY', default)` for optional ones.
- Group settings by concern: Django core → CORS → DB → Auth → Third-party.
- Keep a `.env.example` with every required key documented.

---

## Authentication

- JWT via `djangorestframework-simplejwt`.
- All API endpoints require `IsAuthenticated` unless explicitly public.
- Token obtain: `POST /api/auth/token/`
- Token refresh: `POST /api/auth/token/refresh/`

---

## MongoDB Usage (this project)

- SQLite handles Django auth/sessions; MongoDB stores reviews and products.
- Centralise all MongoDB connections in `services.py` via a lazy singleton client.
- Never open a `MongoClient` directly in views.
- Use `_id` as the natural key (e.g. `order_number`).
- Aggregation pipelines are service-layer code — build them in `services.py`.

```python
# services.py — one shared client
_mongo_client = None

def _get_mongo_client():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(settings.MONGODB_URI)
    return _mongo_client
```

---

## API Design

- Use noun-based, plural resource URLs: `/api/reviews/`, `/api/products/ids/`.
- Nested resource actions go under the parent: `/api/analytics/products/<id>/detail/`.
- Return consistent shapes:
  - List endpoints: `{ results: [...], total, page, page_size }`
  - Detail endpoints: the object directly.
  - Errors: `{ detail: "..." }` (DRF default).
- HTTP status codes:
  - `200` — success (GET, PATCH, PUT)
  - `201` — created (POST)
  - `204` — deleted (DELETE)
  - `400` — validation error
  - `403` — permission denied
  - `404` — not found

---

## Query Performance

- Use `select_related` / `prefetch_related` to eliminate N+1 on ORM queries.
- For MongoDB: build aggregation pipelines rather than fetching and filtering in Python.
- Add `db_index=True` to fields that are frequently filtered on.
- Paginate all list endpoints — never return unbounded collections.

---

## Error Handling

- Let DRF handle serializer validation errors (`raise_exception=True`).
- Catch only specific exceptions — never bare `except Exception`.
- Return `{ detail: "..." }` messages consistent with DRF convention.
- Log unexpected errors; don't swallow them silently.

---

## Security

- `DEBUG=False` in production — enforced via env var.
- `ALLOWED_HOSTS` set explicitly from env — never `["*"]` in production.
- `CORS_ALLOWED_ORIGINS` set explicitly — never `CORS_ALLOW_ALL_ORIGINS = True` in production.
- Never commit `.env` files. Add secrets via environment or secret manager.
- All write endpoints validate ownership before mutating (merchant scoping).
- Throttle all endpoints — configured in `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]`.

---

## Testing

- Test file: `main/tests.py` (split into `test_views.py`, `test_services.py` as app grows).
- Use `APIClient` from DRF for endpoint tests.
- Every endpoint must have tests for:
  - Happy path (correct input, correct response)
  - Validation error (bad input → 400)
  - Not found (missing resource → 404)
  - Permission denied (wrong user/merchant → 403)

```python
from rest_framework.test import APIClient
from django.test import TestCase

class ReviewListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # create user, authenticate, set up fixtures

    def test_list_returns_200(self): ...
    def test_list_requires_auth(self): ...
    def test_list_scoped_to_merchant(self): ...
```

---

## Migrations

- Run `makemigrations` after every model change.
- Never edit a migration that has already been applied in production — add a new one.
- Migration naming: Django auto-names them; add a meaningful name for clarity:
  `python manage.py makemigrations --name add_merchant_profile`.
- Commit migrations alongside the model change in the same PR.

---

## Adding a New Feature (checklist)

1. **Model** — add/modify fields, run `makemigrations`.
2. **Service** — implement business logic in `services.py`.
3. **Serializer** — define input validation and output shape.
4. **View** — thin HTTP handler that calls the service.
5. **URL** — register route in `main/urls.py`.
6. **Admin** — register new models in `admin.py`.
7. **Tests** — cover happy path + error cases.
8. **`.env.example`** — add any new environment variables.
