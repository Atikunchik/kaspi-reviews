import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY)
const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY)
const saveTokens = ({ access, refresh }) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, access)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}
const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

const authenticatedFetch = async (url, options = {}) => {
  const request = async (token) => {
    const headers = new Headers(options.headers || {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(url, { ...options, headers })
  }

  let response = await request(getAccessToken())
  if (response.status !== 401) return response

  const refresh = getRefreshToken()
  if (!refresh) return response

  const refreshResponse = await fetch('/api/auth/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!refreshResponse.ok) {
    clearTokens()
    return response
  }
  const refreshData = await refreshResponse.json()
  saveTokens({ access: refreshData.access, refresh })
  response = await request(refreshData.access)
  return response
}

function LogoutButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="logoutBtn"
      onClick={() => {
        clearTokens()
        navigate('/login')
      }}
    >
      <svg className="logoutIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 4h-3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="2" />
        <path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth="2" />
        <path d="M21 12H9" stroke="currentColor" strokeWidth="2" />
      </svg>
      Выйти
    </button>
  )
}

const getRawReviewValue = (review, key) => {
  if (!review?.review_dict) return ''
  return review.review_dict[key] ?? review.review_dict?.customer?.[key] ?? ''
}

const summaryValue = (review, key) => {
  const raw = getRawReviewValue(review, key)
  return raw === '' || raw === null || raw === undefined ? 'Нет данных' : raw
}

const getRatingMeta = (value) => {
  const rating = Number(value)
  if (!Number.isFinite(rating)) {
    return { text: 'Нет данных', className: 'ratingUnknown' }
  }
  if (rating >= 5) return { text: `${rating} · Отлично`, className: 'rating5' }
  if (rating >= 4) return { text: `${rating} · Хорошо`, className: 'rating4' }
  if (rating >= 3) return { text: `${rating} · Нормально`, className: 'rating3' }
  if (rating >= 2) return { text: `${rating} · Плохо`, className: 'rating2' }
  return { text: `${rating} · Очень плохо`, className: 'rating1' }
}

const dateToTs = (value) => {
  if (!value || typeof value !== 'string') return 0
  const parts = value.split('.')
  if (parts.length !== 3) return 0
  const [day, month, year] = parts.map((item) => Number(item))
  if (!day || !month || !year) return 0
  return new Date(year, month - 1, day).getTime()
}

const inputDateToTs = (value, isEndOfDay = false) => {
  if (!value) return 0
  const [year, month, day] = value.split('-').map((item) => Number(item))
  if (!year || !month || !day) return 0
  if (isEndOfDay) return new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
}

function ListPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderQuery, setOrderQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const navigate = useNavigate()

  const loadReviews = async () => {
    setLoading(true)
    setMessage('')
    try {
      const response = await authenticatedFetch('/api/reviews/')
      if (response.status === 401) {
        clearTokens()
        navigate('/login')
        return
      }
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage(data.detail ?? 'Не удалось загрузить список')
        return
      }
      const sorted = (Array.isArray(data) ? data : []).sort((a, b) => {
        const dateA = dateToTs(a?.review_dict?.date)
        const dateB = dateToTs(b?.review_dict?.date)
        return dateB - dateA
      })
      setReviews(sorted)
    } catch {
      setMessage('Бэкенд недоступен')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReviews()
  }, [navigate])

  const filteredReviews = useMemo(() => {
    const normalizedOrderQuery = orderQuery.trim().toLowerCase()
    const normalizedPhoneQuery = phoneQuery.trim().toLowerCase()
    const fromTs = inputDateToTs(dateFrom, false)
    const toTs = inputDateToTs(dateTo, true)

    return reviews.filter((review) => {
      if (statusFilter === 'viewed' && !review.is_reviewed) return false
      if (statusFilter === 'not_viewed' && review.is_reviewed) return false

      if (ratingFilter !== 'all') {
        const rating = Number(getRawReviewValue(review, 'rating'))
        if (!Number.isFinite(rating) || rating !== Number(ratingFilter)) return false
      }

      const reviewDateTs = dateToTs(getRawReviewValue(review, 'date'))
      if (fromTs && (!reviewDateTs || reviewDateTs < fromTs)) return false
      if (toTs && (!reviewDateTs || reviewDateTs > toTs)) return false

      const orderNumber = String(review.order_number ?? '').toLowerCase()
      if (normalizedOrderQuery && !orderNumber.includes(normalizedOrderQuery)) return false

      const phone = String(getRawReviewValue(review, 'phone_number') ?? '').toLowerCase()
      if (normalizedPhoneQuery && !phone.includes(normalizedPhoneQuery)) return false

      return true
    })
  }, [reviews, statusFilter, ratingFilter, dateFrom, dateTo, orderQuery, phoneQuery])

  return (
    <main className="page">
      <header className="topbar">
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Список отзывов</h1>
          <p className="sub">Нажмите на строку, чтобы открыть детали</p>
        </div>
        <button type="button" onClick={loadReviews} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
        <LogoutButton />
      </header>

      {message && <p className="banner">{message}</p>}

      <section className="panel">
        <div className="filters">
          <div className="filterItem">
            <label htmlFor="statusFilter">Статус</label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Все</option>
              <option value="viewed">Просмотрено</option>
              <option value="not_viewed">Не просмотрено</option>
            </select>
          </div>
          <div className="filterItem">
            <label htmlFor="ratingFilter">Оценка</label>
            <select
              id="ratingFilter"
              value={ratingFilter}
              onChange={(event) => setRatingFilter(event.target.value)}
            >
              <option value="all">Все</option>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </div>
          <div className="filterItem">
            <label htmlFor="dateFrom">Дата c</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="filterItem">
            <label htmlFor="dateTo">Дата по</label>
            <input id="dateTo" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="filterItem filterItemSearch">
            <label htmlFor="orderQuery">Поиск по заказу</label>
            <input
              id="orderQuery"
              type="text"
              placeholder="Например: 824349073"
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
            />
          </div>
          <div className="filterItem filterItemSearch">
            <label htmlFor="phoneQuery">Поиск по телефону</label>
            <input
              id="phoneQuery"
              type="text"
              placeholder="Например: +77777777777"
              value={phoneQuery}
              onChange={(event) => setPhoneQuery(event.target.value)}
            />
          </div>
          <div className="filterItem filterActions">
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all')
                setRatingFilter('all')
                setDateFrom('')
                setDateTo('')
                setOrderQuery('')
                setPhoneQuery('')
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Номер заказа</th>
                <th>Телефон</th>
                <th>Оценка</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredReviews.map((review) => (
                <tr key={review.order_number} className={!review.is_reviewed ? 'unreadRow' : ''}>
                  <td className={`mono ${!review.is_reviewed ? 'unreadText' : ''}`}>{review.order_number}</td>
                  <td>{summaryValue(review, 'phone_number')}</td>
                  <td>
                    <span className={`ratingBadge ${getRatingMeta(summaryValue(review, 'rating')).className}`}>
                      {getRatingMeta(summaryValue(review, 'rating')).text}
                    </span>
                  </td>
                  <td>{summaryValue(review, 'date')}</td>
                  <td>
                    <span className={`statusBadge ${review.is_reviewed ? 'read' : 'unread'}`}>
                      {review.is_reviewed ? 'Просмотрено' : 'Не просмотрено'}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => navigate(`/reviews/${review.order_number}`)}>
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredReviews.length && !loading && <p className="sub">Отзывы по фильтрам не найдены</p>}
        </div>
      </section>
    </main>
  )
}

function DetailPage() {
  const { orderNumber } = useParams()
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const data = review?.review_dict ?? {}
  const comment = data.comment ?? {}
  const feedback = data.feedback ?? {}
  const product = data.product ?? {}
  const merchant = data.merchant ?? {}
  const display = (value) => {
    if (value === null || value === undefined || value === '') return 'Нет данных'
    if (value === true) return 'Да'
    if (value === false) return 'Нет'
    return String(value)
  }
  const ratingMeta = getRatingMeta(summaryValue(review, 'rating'))

  useEffect(() => {
    const loadDetail = async () => {
      if (!orderNumber) return
      setLoading(true)
      setMessage('')
      try {
        const response = await authenticatedFetch(`/api/reviews/${encodeURIComponent(orderNumber)}/`)
        if (response.status === 401) {
          clearTokens()
          navigate('/login')
          return
        }
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          setMessage(data.detail ?? 'Не удалось загрузить детали отзыва')
          setReview(null)
          return
        }
        setReview(data)
      } catch {
        setMessage('Бэкенд недоступен')
        setReview(null)
      } finally {
        setLoading(false)
      }
    }
    loadDetail()
  }, [orderNumber, navigate])

  return (
    <main className="page">
      <header className="topbar">
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Детали отзыва</h1>
          <p className="sub mono">Заказ: {orderNumber}</p>
        </div>
        <Link to="/" className="linkBtn">
          Назад к списку
        </Link>
        <LogoutButton />
      </header>

      {message && <p className="banner">{message}</p>}

      <section className="panel detailPanel">
        {loading && <p className="sub">Загрузка деталей...</p>}
        {!loading && review && (
          <div className="detailGrid">
            <article className="detailCard">
              <h3>Кратко</h3>
              <dl className="metaList">
                <dt>Оценка</dt>
                <dd>
                  <span className={`ratingBadge ${ratingMeta.className}`}>{ratingMeta.text}</span>
                </dd>
                <dt>Дата</dt>
                <dd>{summaryValue(review, 'date')}</dd>
                <dt>Телефон</dt>
                <dd>{summaryValue(review, 'phone_number')}</dd>
                <dt>Статус</dt>
                <dd>
                  <span className={`statusBadge ${review.is_reviewed ? 'read' : 'unread'}`}>
                    {review.is_reviewed ? 'Просмотрено' : 'Не просмотрено'}
                  </span>
                </dd>
              </dl>
            </article>
            <article className="detailCard">
              <h3>Общее</h3>
              <dl>
                <dt>ID</dt>
                <dd className="mono">{display(data.id)}</dd>
                <dt>Номер заказа</dt>
                <dd className="mono">{display(data.orderNumber)}</dd>
                <dt>Автор</dt>
                <dd>{display(data.author)}</dd>
                <dt>Дата</dt>
                <dd>{display(data.date)}</dd>
                <dt>Оценка</dt>
                <dd>
                  <span className={`ratingBadge ${getRatingMeta(data.rating).className}`}>
                    {getRatingMeta(data.rating).text}
                  </span>
                </dd>
                <dt>Локаль</dt>
                <dd>{display(data.locale)}</dd>
              </dl>
            </article>
            <article className="detailCard detailCardWide">
              <h3>Комментарий</h3>
              <dl>
                <dt>Плюсы</dt>
                <dd>{display(comment.plus)}</dd>
                <dt>Минусы</dt>
                <dd>{display(comment.minus)}</dd>
                <dt>Текст</dt>
                <dd>{display(comment.text)}</dd>
              </dl>
            </article>
            <article className="detailCard">
              <h3>Реакции</h3>
              <dl>
                <dt>Положительные</dt>
                <dd>{display(feedback.positive)}</dd>
                <dt>Голосовал</dt>
                <dd>{display(feedback.voted)}</dd>
                <dt>Можно редактировать</dt>
                <dd>{display(data.editable)}</dd>
                <dt>Изменен клиентом</dt>
                <dd>{display(data.editedByCustomer)}</dd>
              </dl>
            </article>
            <article className="detailCard detailCardWide">
              <h3>Товар</h3>
              <dl>
                <dt>ID</dt>
                <dd className="mono">{display(product.id)}</dd>
                <dt>Название</dt>
                <dd>{display(product.name)}</dd>
                <dt>Код категории</dt>
                <dd>{display(product.categoryCode)}</dd>
                <dt>Категория</dt>
                <dd>{display(product.categoryName)}</dd>
                <dt>Ссылка</dt>
                <dd>
                  {product.link ? (
                    <a href={product.link} target="_blank" rel="noreferrer">
                      {product.link}
                    </a>
                  ) : (
                    'Нет данных'
                  )}
                </dd>
              </dl>
            </article>
            <article className="detailCard">
              <h3>Продавец</h3>
              <dl>
                <dt>Название</dt>
                <dd>{display(merchant.name)}</dd>
                <dt>Код</dt>
                <dd>{display(merchant.code)}</dd>
              </dl>
            </article>
          </div>
        )}
      </section>
    </main>
  )
}

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (getAccessToken()) navigate('/')
  }, [navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage('Неверный логин или пароль')
        return
      }
      saveTokens({ access: data.access, refresh: data.refresh })
      navigate('/')
    } catch {
      setMessage('Бэкенд недоступен')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <section className="panel authPanel">
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Вход</h1>
          <p className="sub">Авторизуйтесь для доступа к отзывам</p>
        </div>
        {message && <p className="banner">{message}</p>}
        <form onSubmit={handleSubmit} className="authForm">
          <div className="filterItem">
            <label htmlFor="username">Логин</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="filterItem">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  )
}

function RequireAuth({ children }) {
  if (!getAccessToken()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <ListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reviews/:orderNumber"
        element={
          <RequireAuth>
            <DetailPage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
