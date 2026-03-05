import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

function DateInput({ id, value, onChange, placeholder = 'Дата' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const today = new Date()

  const selected = value ? new Date(value + 'T00:00:00') : null
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleOpen = () => {
    if (selected) { setViewYear(selected.getFullYear()); setViewMonth(selected.getMonth()) }
    setOpen((o) => !o)
  }

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear((y) => y - 1)) : setViewMonth((m) => m - 1)
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear((y) => y + 1)) : setViewMonth((m) => m + 1)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDay = (() => { const d = new Date(viewYear, viewMonth, 1).getDay(); return d === 0 ? 6 : d - 1 })()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7

  const selectDay = (day) => {
    const m = String(viewMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    onChange({ target: { value: `${viewYear}-${m}-${d}` } })
    setOpen(false)
  }

  const isSelected = (day) => selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day
  const isToday = (day) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day

  const displayValue = value ? value.split('-').reverse().join('.') : ''

  return (
    <div ref={ref} className={`dateInputWrap ${open ? 'isOpen' : ''}`}>
      <button type="button" id={id} className="dateInputTrigger" onClick={handleOpen}>
        <svg className="dateInputIcon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {displayValue
          ? <span className="dateInputText">{displayValue}</span>
          : <span className="dateInputPlaceholder">{placeholder}</span>
        }
      </button>
      {value && (
        <button type="button" className="dateInputClear" onClick={() => onChange({ target: { value: '' } })} aria-label="Очистить">
          ×
        </button>
      )}

      {open && (
        <div className="datePicker">
          <div className="datePickerHeader">
            <button type="button" className="datePickerNav" onClick={() => setViewYear((y) => y - 1)} title="Пред. год">«</button>
            <button type="button" className="datePickerNav" onClick={prevMonth} title="Пред. месяц">‹</button>
            <span className="datePickerTitle">{MONTH_NAMES[viewMonth]} {viewYear}</span>
            <button type="button" className="datePickerNav" onClick={nextMonth} title="След. месяц">›</button>
            <button type="button" className="datePickerNav" onClick={() => setViewYear((y) => y + 1)} title="След. год">»</button>
          </div>
          <div className="datePickerGrid">
            {DAY_NAMES.map((d) => <div key={d} className="datePickerDayName">{d}</div>)}
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - firstDay + 1
              const valid = day >= 1 && day <= daysInMonth
              return (
                <button
                  key={i}
                  type="button"
                  className={`datePickerDay${!valid ? ' empty' : ''}${isSelected(day) ? ' selected' : ''}${isToday(day) && !isSelected(day) ? ' today' : ''}`}
                  onClick={() => valid && selectDay(day)}
                  tabIndex={valid ? 0 : -1}
                >
                  {valid ? day : ''}
                </button>
              )
            })}
          </div>
          {value && (
            <div className="datePickerFooter">
              <button type="button" className="datePickerClearBtn" onClick={() => { onChange({ target: { value: '' } }); setOpen(false) }}>
                Сбросить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Select({ id, value, onChange, options, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={`customSelect ${open ? 'isOpen' : ''} ${className}`}>
      <button
        id={id}
        type="button"
        className="customSelectTrigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="customSelectValue">{current?.label ?? value}</span>
        <svg className="customSelectChevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="customSelectMenu" role="listbox">
          {options.map((option) => {
            const selected = String(option.value) === String(value)
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                className={`customSelectOption ${selected ? 'isSelected' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange({ target: { value: option.value } }); setOpen(false) }}
              >
                <span>{option.label}</span>
                {selected && (
                  <svg className="customSelectCheck" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
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

const DEFAULT_WHATSAPP_PHONE = import.meta.env.VITE_DEFAULT_WHATSAPP_PHONE || ''

const buildWhatsappLink = (phone) => {
  const normalized = String(phone || '')
    .replace(/[^\d]/g, '')
    .trim()
  return `https://wa.me/${normalized || DEFAULT_WHATSAPP_PHONE.replace(/[^\d]/g, '')}`
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
  if (rating >= 5) return { text: `★ ${rating} · Отлично`, className: 'rating5' }
  if (rating >= 4) return { text: `★ ${rating} · Хорошо`, className: 'rating4' }
  if (rating >= 3) return { text: `★ ${rating} · Нормально`, className: 'rating3' }
  if (rating >= 2) return { text: `★ ${rating} · Плохо`, className: 'rating2' }
  return { text: `★ ${rating} · Очень плохо`, className: 'rating1' }
}

const normalizeRating = (value) => {
  const rating = Number(value)
  if (!Number.isFinite(rating)) return null
  if (rating < 1 || rating > 5) return null
  return Math.round(rating)
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

const parseReviewDate = (value) => {
  if (!value || typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map((item) => Number(item))
  if (!day || !month || !year) return null
  return new Date(year, month - 1, day)
}

const formatAsDDMMYYYY = (date) => {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const getBucketMeta = (date, mode) => {
  if (mode === 'month') {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
    const label = `${String(monthStart.getMonth() + 1).padStart(2, '0')}.${monthStart.getFullYear()}`
    return { key: `m-${monthStart.getTime()}`, label, ts: monthStart.getTime() }
  }
  if (mode === 'week') {
    const day = date.getDay()
    const diffToMonday = (day + 6) % 7
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diffToMonday)
    weekStart.setHours(0, 0, 0, 0)
    return {
      key: `w-${weekStart.getTime()}`,
      label: `Неделя ${formatAsDDMMYYYY(weekStart)}`,
      ts: weekStart.getTime(),
    }
  }
  return { key: `d-${date.getTime()}`, label: formatAsDDMMYYYY(date), ts: date.getTime() }
}

function ListPage() {
  const [reviews, setReviews] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState('all')
  const [ratingFilters, setRatingFilters] = useState([])
  const [productFilters, setProductFilters] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderQuery, setOrderQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [productNameQuery, setProductNameQuery] = useState('')
  const [productSearch, setProductSearch] = useState('')
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

      const productsResponse = await authenticatedFetch('/api/products/ids/')
      if (productsResponse.status === 401) {
        clearTokens()
        navigate('/login')
        return
      }
      const productsData = await productsResponse.json().catch(() => ({}))
      if (productsResponse.ok) {
        setProducts(Array.isArray(productsData.products) ? productsData.products : [])
      }
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
    const normalizedProductNameQuery = productNameQuery.trim().toLowerCase()
    const fromTs = inputDateToTs(dateFrom, false)
    const toTs = inputDateToTs(dateTo, true)

    return reviews.filter((review) => {
      if (statusFilter === 'viewed' && !review.is_reviewed) return false
      if (statusFilter === 'not_viewed' && review.is_reviewed) return false

      if (ratingFilters.length > 0) {
        const rating = Number(getRawReviewValue(review, 'rating'))
        if (!Number.isFinite(rating) || !ratingFilters.includes(rating)) return false
      }

      if (productFilters.length > 0) {
        const reviewProductId = String(review?.review_dict?.product?.id ?? '')
        if (!productFilters.includes(reviewProductId)) return false
      }

      const reviewDateTs = dateToTs(getRawReviewValue(review, 'date'))
      if (fromTs && (!reviewDateTs || reviewDateTs < fromTs)) return false
      if (toTs && (!reviewDateTs || reviewDateTs > toTs)) return false

      const orderNumber = String(review.order_number ?? '').toLowerCase()
      if (normalizedOrderQuery && !orderNumber.includes(normalizedOrderQuery)) return false

      const phone = String(getRawReviewValue(review, 'phone_number') ?? '').toLowerCase()
      if (normalizedPhoneQuery && !phone.includes(normalizedPhoneQuery)) return false

      const productName = String(review?.review_dict?.product?.name ?? '').toLowerCase()
      if (normalizedProductNameQuery && !productName.includes(normalizedProductNameQuery)) return false

      return true
    })
  }, [reviews, statusFilter, ratingFilters, productFilters, dateFrom, dateTo, orderQuery, phoneQuery, productNameQuery])

  const ratingFilterLabel =
    ratingFilters.length === 0
      ? 'Все'
      : [...ratingFilters]
          .sort((a, b) => b - a)
          .join(', ')
  const productFilterLabel =
    productFilters.length === 0
      ? 'Все'
      : productFilters
          .map((id) => products.find((item) => item.id === id)?.name || id)
          .join(', ')

  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / pageSize))
  const paginatedReviews = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReviews.slice(start, start + pageSize)
  }, [filteredReviews, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, ratingFilters, productFilters, dateFrom, dateTo, orderQuery, phoneQuery, productNameQuery, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  return (
    <main className="page">
      <header className="topbar">
        <span className="navBrand">K</span>
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Список отзывов</h1>
          <p className="sub">Нажмите на строку, чтобы открыть детали</p>
        </div>
        <Link to="/analytics" className="linkBtn">Аналитика</Link>
        <Link to="/product-analytics" className="linkBtn">По товарам</Link>
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
            <Select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'viewed', label: 'Просмотрено' },
                { value: 'not_viewed', label: 'Не просмотрено' },
              ]}
            />
          </div>
          <div className="filterItem">
            <label htmlFor="ratingFilter">Оценка</label>
            <details id="ratingFilter" className="ratingDropdown">
              <summary>Выбрано: {ratingFilterLabel}</summary>
              <div className="ratingFilters">
                {[5, 4, 3, 2, 1].map((value) => (
                  <label key={value} className="ratingCheck">
                    <input
                      type="checkbox"
                      checked={ratingFilters.includes(value)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setRatingFilters((prev) => [...prev, value])
                        } else {
                          setRatingFilters((prev) => prev.filter((item) => item !== value))
                        }
                      }}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="filterItem">
            <label htmlFor="dateFrom">Дата c</label>
            <DateInput id="dateFrom" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="от" />
          </div>
          <div className="filterItem">
            <label htmlFor="dateTo">Дата по</label>
            <DateInput id="dateTo" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="до" />
          </div>
          <div className="filterItem">
            <label htmlFor="productFilter">Товары</label>
            <details id="productFilter" className="ratingDropdown">
              <summary>Выбрано: {productFilterLabel}</summary>
              <input
                className="productSearchInput"
                type="text"
                placeholder="Поиск по названию..."
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onClick={(event) => event.stopPropagation()}
              />
              <div className="ratingFilters productFilters">
                {products
                  .filter((product) =>
                    (product.name || product.id).toLowerCase().includes(productSearch.toLowerCase())
                  )
                  .map((product) => (
                    <label key={product.id} className="ratingCheck">
                      <input
                        type="checkbox"
                        checked={productFilters.includes(product.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setProductFilters((prev) => [...prev, product.id])
                          } else {
                            setProductFilters((prev) => prev.filter((item) => item !== product.id))
                          }
                        }}
                      />
                      <span>{product.name || product.id}</span>
                    </label>
                  ))}
                {!products.length && <span className="sub">Нет данных</span>}
                {products.length > 0 &&
                  products.filter((p) =>
                    (p.name || p.id).toLowerCase().includes(productSearch.toLowerCase())
                  ).length === 0 && (
                    <span className="sub">Ничего не найдено</span>
                  )}
              </div>
            </details>
          </div>
          <div className="filterItem filterItemSearch">
            <label htmlFor="productNameQuery">Поиск по товару</label>
            <input
              id="productNameQuery"
              type="text"
              placeholder="Например: iPhone"
              value={productNameQuery}
              onChange={(event) => setProductNameQuery(event.target.value)}
            />
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
                setRatingFilters([])
                setProductFilters([])
                setDateFrom('')
                setDateTo('')
                setOrderQuery('')
                setPhoneQuery('')
                setProductNameQuery('')
                setPageSize(20)
                setCurrentPage(1)
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
                <th>Товар</th>
                <th>Телефон</th>
                <th>Оценка</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {paginatedReviews.map((review) => (
                <tr key={review.order_number} className={!review.is_reviewed ? 'unreadRow' : ''}>
                  <td className={`mono ${!review.is_reviewed ? 'unreadText' : ''}`}>{review.order_number}</td>
                  <td>{review?.review_dict?.product?.name || 'Нет данных'}</td>
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
                    <button type="button" className="openBtn" onClick={() => navigate(`/reviews/${review.order_number}`)}>
                      Открыть →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredReviews.length && !loading && <p className="sub">Отзывы по фильтрам не найдены</p>}
        </div>
        <div className="paginationBar">
          <div className="paginationInfo">
            Показано: {paginatedReviews.length} из {filteredReviews.length}
          </div>
          <div className="paginationControls">
            <label htmlFor="pageSize" className="pageSizeLabel">
              На странице
            </label>
            <Select
              id="pageSize"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              options={[10, 20, 50, 100, 500].map((s) => ({ value: s, label: String(s) }))}
              className="pageSizeSelect"
            />
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Назад
            </button>
            <span className="pageIndicator">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Вперед
            </button>
          </div>
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
  const rawPhone = String(getRawReviewValue(review, 'phone_number') || '').trim()
  const phoneForDisplay = rawPhone || DEFAULT_WHATSAPP_PHONE
  const whatsappLink = buildWhatsappLink(phoneForDisplay)
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
        <span className="navBrand">K</span>
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Детали отзыва</h1>
          <p className="sub mono">Заказ: {orderNumber}</p>
        </div>
        <Link to="/analytics" className="linkBtn">
          Аналитика
        </Link>
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
                <dd className="phoneCell">
                  <span>{phoneForDisplay}</span>
                  <a href={whatsappLink} target="_blank" rel="noreferrer" className="whatsappBtn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.547 4.087 1.505 5.808L0 24l6.335-1.48A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.003-1.369l-.359-.213-3.72.869.936-3.62-.234-.373A9.818 9.818 0 1112 21.818z"/>
                    </svg>
                    WhatsApp
                  </a>
                </dd>
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

function AnalyticsPage() {
  const [products, setProducts] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [periodDays, setPeriodDays] = useState(30)
  const [groupBy, setGroupBy] = useState('day')
  const [productFilters, setProductFilters] = useState([])
  const [ratingFilters, setRatingFilters] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const loadProducts = async () => {
      const res = await authenticatedFetch('/api/products/ids/')
      if (res.status === 401) { clearTokens(); navigate('/login'); return }
      const data = await res.json().catch(() => ({}))
      if (res.ok) setProducts(Array.isArray(data.products) ? data.products : [])
    }
    loadProducts()
  }, [navigate])

  const loadChart = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const params = new URLSearchParams({ period_days: String(periodDays), group_by: groupBy })
      if (productFilters.length) params.set('product_ids', productFilters.join(','))
      if (ratingFilters.length) params.set('ratings', ratingFilters.join(','))
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)

      const res = await authenticatedFetch(`/api/analytics/chart/?${params}`)
      if (res.status === 401) { clearTokens(); navigate('/login'); return }
      const data = await res.json().catch(() => [])
      if (!res.ok) { setMessage(data.detail ?? 'Не удалось загрузить данные'); return }
      setChartData(Array.isArray(data) ? data : [])
    } catch {
      setMessage('Бэкенд недоступен')
    } finally {
      setLoading(false)
    }
  }, [periodDays, groupBy, productFilters, ratingFilters, dateFrom, dateTo, navigate])

  useEffect(() => { loadChart() }, [loadChart])

  const productFilterLabel =
    productFilters.length === 0
      ? 'Все'
      : productFilters.map((id) => products.find((p) => p.id === id)?.name || id).join(', ')

  const ratingFilterLabel =
    ratingFilters.length === 0 ? 'Все' : [...ratingFilters].sort((a, b) => b - a).join(', ')

  const ratingColors = { 1: '#F87171', 2: '#FB923C', 3: '#FBBF24', 4: '#60A5FA', 5: '#34D399' }
  const maxTotal = Math.max(1, ...chartData.map((item) => item.total))

  return (
    <main className="page">
      <header className="topbar">
        <span className="navBrand">K</span>
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Аналитика</h1>
          <p className="sub">Отзывы по дням</p>
        </div>
        <button type="button" onClick={loadChart} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
        <Link to="/product-analytics" className="linkBtn">По товарам</Link>
        <Link to="/" className="linkBtn">Список</Link>
        <LogoutButton />
      </header>

      {message && <p className="banner">{message}</p>}

      <section className="panel">
        <div className="analyticsFilters">
          <div className="periodSwitch">
            {[7, 30, 90, 'all'].map((days) => (
              <button
                key={days}
                type="button"
                className={periodDays === days ? 'periodBtn active' : 'periodBtn'}
                onClick={() => setPeriodDays(days)}
              >
                {days === 'all' ? 'Все дни' : `${days} дней`}
              </button>
            ))}
          </div>
          <div className="filterItem">
            <label htmlFor="groupBy">Группировка</label>
            <Select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              options={[
                { value: 'day', label: 'По дням' },
                { value: 'week', label: 'По неделям' },
                { value: 'month', label: 'По месяцам' },
              ]}
            />
          </div>
          <div className="filterItem">
            <label htmlFor="analyticsRatingFilter">Оценка</label>
            <details id="analyticsRatingFilter" className="ratingDropdown">
              <summary>Выбрано: {ratingFilterLabel}</summary>
              <div className="ratingFilters">
                {[5, 4, 3, 2, 1].map((value) => (
                  <label key={value} className="ratingCheck">
                    <input
                      type="checkbox"
                      checked={ratingFilters.includes(value)}
                      onChange={(e) => setRatingFilters((prev) =>
                        e.target.checked ? [...prev, value] : prev.filter((v) => v !== value)
                      )}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="filterItem">
            <label htmlFor="analyticsProductFilter">Товары</label>
            <details id="analyticsProductFilter" className="ratingDropdown">
              <summary>Выбрано: {productFilterLabel}</summary>
              <div className="ratingFilters productFilters">
                {products.map((product) => (
                  <label key={product.id} className="ratingCheck">
                    <input
                      type="checkbox"
                      checked={productFilters.includes(product.id)}
                      onChange={(e) => setProductFilters((prev) =>
                        e.target.checked ? [...prev, product.id] : prev.filter((v) => v !== product.id)
                      )}
                    />
                    <span>{product.name || product.id}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <div className="filterItem">
            <label htmlFor="analyticsDateFrom">Дата c</label>
            <DateInput id="analyticsDateFrom" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="от" />
          </div>
          <div className="filterItem">
            <label htmlFor="analyticsDateTo">Дата по</label>
            <DateInput id="analyticsDateTo" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="до" />
          </div>
          <div className="filterItem filterActions">
            <button
              type="button"
              onClick={() => {
                setPeriodDays(30)
                setGroupBy('day')
                setProductFilters([])
                setRatingFilters([])
                setDateFrom('')
                setDateTo('')
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
        <div className="analyticsLegend">
          {[5, 4, 3, 2, 1].map((rating) => (
            <div key={rating} className="legendItem">
              <span className="legendDot" style={{ background: ratingColors[rating] }} />
              <span>Оценка {rating}</span>
            </div>
          ))}
        </div>
        {loading && <p className="sub">Загрузка...</p>}
        {!loading && !chartData.length && <p className="sub">Недостаточно данных для графика</p>}
        {!loading && chartData.length > 0 && (
          <div className="analyticsChart">
            {chartData.map((item) => (
              <div key={item.key} className="chartCol">
                <div className="chartBarOuter" title={`${item.label} • Всего: ${item.total}`}>
                  <div className="chartBarStack" style={{ height: `${(item.total / maxTotal) * 100}%` }}>
                    {[1, 2, 3, 4, 5].map((rating) => {
                      const count = item.ratings[rating]
                      if (!count) return null
                      return (
                        <div
                          key={rating}
                          className="chartSegment"
                          style={{ height: `${(count / item.total) * 100}%`, background: ratingColors[rating] }}
                          title={`Оценка ${rating}: ${count}`}
                        />
                      )
                    })}
                  </div>
                </div>
                <div className="chartCount">{item.total}</div>
                <div className="chartDate">{item.label}</div>
              </div>
            ))}
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
      <section className="authPanel">
        <div className="authCard">
          <div className="authBrand">
            <div className="authLogo">K</div>
            <div className="authBrandText">
              <p className="eyebrow">Kaspi</p>
              <p className="authTitle">Reviews</p>
            </div>
          </div>
          <p className="authSubtitle">Авторизуйтесь для доступа к отзывам</p>
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
        </div>
      </section>
    </main>
  )
}

function ProductAnalyticsPage() {
  const [rawProducts, setRawProducts] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [periodDays, setPeriodDays] = useState(30)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ratingOp, setRatingOp] = useState('lt')
  const [ratingThreshold, setRatingThreshold] = useState('4.5')
  const [minReviews, setMinReviews] = useState(1)
  const [sortBy, setSortBy] = useState('avg')
  const [sortDir, setSortDir] = useState('asc')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const params = new URLSearchParams({
        period_days: String(periodDays),
        rating_op: ratingOp,
        rating_threshold: ratingThreshold,
        min_reviews: String(minReviews),
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)

      const res = await authenticatedFetch(`/api/analytics/products/?${params}`)
      if (res.status === 401) { clearTokens(); navigate('/login'); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage(data.detail ?? 'Не удалось загрузить данные'); return }
      setRawProducts(Array.isArray(data.products) ? data.products : [])
      setSummary(data.summary ?? null)
    } catch {
      setMessage('Бэкенд недоступен')
    } finally {
      setLoading(false)
    }
  }, [periodDays, dateFrom, dateTo, ratingOp, ratingThreshold, minReviews, sortBy, sortDir, navigate])

  useEffect(() => { load() }, [load])

  const ratingColors = { 1: '#F87171', 2: '#FB923C', 3: '#FBBF24', 4: '#60A5FA', 5: '#34D399' }

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(field); setSortDir('asc') }
  }
  const sortIndicator = (field) => sortBy === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const avgRatingClass = (avg) => {
    if (avg >= 4.5) return 'rating5'
    if (avg >= 3.5) return 'rating4'
    if (avg >= 2.5) return 'rating3'
    if (avg >= 1.5) return 'rating2'
    return 'rating1'
  }

  return (
    <main className="page">
      <header className="topbar">
        <span className="navBrand">K</span>
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Аналитика по товарам</h1>
          <p className="sub">Средний рейтинг товаров за период</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
        <Link to="/analytics" className="linkBtn">График</Link>
        <Link to="/" className="linkBtn">Список</Link>
        <LogoutButton />
      </header>

      {message && <p className="banner">{message}</p>}

      <section className="panel">
        <div className="paFilters">
          <div className="paFilterRow">
            <div className="periodSwitch">
              {[7, 30, 90, 'all'].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={periodDays === days ? 'periodBtn active' : 'periodBtn'}
                  onClick={() => setPeriodDays(days)}
                >
                  {days === 'all' ? 'Все дни' : `${days} дней`}
                </button>
              ))}
            </div>
            <div className="filterItem">
              <label htmlFor="paDateFrom">Дата c</label>
              <DateInput id="paDateFrom" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="от" />
            </div>
            <div className="filterItem">
              <label htmlFor="paDateTo">Дата по</label>
              <DateInput id="paDateTo" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="до" />
            </div>
            <div className="filterItem">
              <label htmlFor="paMinReviews">Мин. отзывов</label>
              <input
                id="paMinReviews"
                type="number"
                min={1}
                value={minReviews}
                onChange={(e) => setMinReviews(e.target.value)}
              />
            </div>
            <div className="filterItem filterActions">
              <button
                type="button"
                onClick={() => {
                  setPeriodDays(30)
                  setDateFrom('')
                  setDateTo('')
                  setRatingOp('lt')
                  setRatingThreshold('4.5')
                  setMinReviews(1)
                }}
              >
                Сбросить
              </button>
            </div>
          </div>

          <div className="paCondition">
            <span className="paConditionLabel">Средний рейтинг</span>
            <Select
              value={ratingOp}
              onChange={(e) => setRatingOp(e.target.value)}
              options={[
                { value: 'lt', label: '<' },
                { value: 'lte', label: '≤' },
                { value: 'gt', label: '>' },
                { value: 'gte', label: '≥' },
              ]}
              className="paOpSelect"
            />
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={ratingThreshold}
              onChange={(e) => setRatingThreshold(e.target.value)}
              className="paThresholdInput"
            />
            <span className="paConditionHint">{rawProducts.length} товаров</span>
          </div>
        </div>

        {summary && rawProducts.length > 0 && (
          <div className="paSummary">
            <div className="statCard">
              <span className="statValue">{summary.product_count}</span>
              <span className="statLabel">Товаров</span>
            </div>
            <div className="statCard">
              <span className="statValue">{summary.total_reviews}</span>
              <span className="statLabel">Отзывов</span>
            </div>
            <div className="statCard">
              <span className={`statValue ratingText ${summary.overall_avg !== null ? avgRatingClass(summary.overall_avg) : ''}`}>
                ★ {summary.overall_avg !== null ? Number(summary.overall_avg).toFixed(2) : '—'}
              </span>
              <span className="statLabel">Средний рейтинг</span>
            </div>
          </div>
        )}

        <div className="tableWrap">
          {loading && <p className="sub" style={{ padding: '20px 16px' }}>Загрузка...</p>}
          {!loading && (
            <table>
              <thead>
                <tr>
                  <th className="sortTh" onClick={() => toggleSort('name')}>Товар{sortIndicator('name')}</th>
                  <th className="sortTh" onClick={() => toggleSort('count')}>Отзывов{sortIndicator('count')}</th>
                  <th className="sortTh" onClick={() => toggleSort('avg')}>Ср. рейтинг{sortIndicator('avg')}</th>
                  <th>Распределение</th>
                  <th>★1</th>
                  <th>★2</th>
                  <th>★3</th>
                  <th>★4</th>
                  <th>★5</th>
                </tr>
              </thead>
              <tbody>
                {rawProducts.map((item) => (
                  <tr key={item.id}>
                    <td className="productNameCell">{item.name}</td>
                    <td className="mono">{item.count}</td>
                    <td>
                      <span className={`ratingBadge ${avgRatingClass(item.avg)}`}>
                        ★ {Number(item.avg).toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <div className="miniRatingBar">
                        {[1, 2, 3, 4, 5].map((r) => {
                          const pct = ((item.ratings[r] || 0) / item.count) * 100
                          return pct > 0 ? (
                            <div
                              key={r}
                              className="miniBarSegment"
                              style={{ width: `${pct}%`, background: ratingColors[r] }}
                              title={`★${r}: ${item.ratings[r]}`}
                            />
                          ) : null
                        })}
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5].map((r) => (
                      <td
                        key={r}
                        className="mono"
                        style={{ color: item.ratings[r] ? ratingColors[r] : 'var(--t-3)' }}
                      >
                        {item.ratings[r] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !rawProducts.length && (
            <p className="sub" style={{ padding: '20px 16px' }}>Нет товаров по заданным условиям</p>
          )}
        </div>
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
        path="/product-analytics"
        element={
          <RequireAuth>
            <ProductAnalyticsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/analytics"
        element={
          <RequireAuth>
            <AnalyticsPage />
          </RequireAuth>
        }
      />
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
