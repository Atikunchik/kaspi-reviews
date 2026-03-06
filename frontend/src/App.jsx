import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'

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

function CheckboxDropdown({ id, label, items, selected, onToggle, searchable = false, fetchItems }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [asyncItems, setAsyncItems] = useState(null)
  const [fetching, setFetching] = useState(false)
  const ref = useRef(null)
  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setAsyncItems(null)
      setFetching(false)
      return
    }
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open || !fetchItems) return
    let cancelled = false
    setFetching(true)
    fetchItems(debouncedSearch)
      .then((results) => { if (!cancelled) { setAsyncItems(results); setFetching(false) } })
      .catch(() => { if (!cancelled) setFetching(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, open, fetchItems])

  const displayItems = fetchItems ? (asyncItems ?? []) : (
    searchable && search
      ? items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
      : items
  )

  return (
    <div ref={ref} className={`checkboxDropdown ${open ? 'isOpen' : ''}`}>
      <button
        id={id}
        type="button"
        className="checkboxDropdownTrigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="checkboxDropdownValue">{label}</span>
        <svg className="customSelectChevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="checkboxDropdownMenu">
          {searchable && (
            <input
              className="checkboxDropdownSearch"
              type="text"
              placeholder="Поиск по названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className={`checkboxDropdownList${searchable ? ' checkboxDropdownListProducts' : ''}`}>
            {fetching ? (
              <span className="sub">Загрузка...</span>
            ) : (
              <>
                {displayItems.map((item) => (
                  <label key={item.value} className="ratingCheck">
                    <input
                      type="checkbox"
                      checked={selected.includes(item.value)}
                      onChange={(e) => onToggle(item.value, e.target.checked, item.label)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
                {displayItems.length === 0 && <span className="sub">Ничего не найдено</span>}
              </>
            )}
          </div>
        </div>
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

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ListPage() {
  const [reviews, setReviews] = useState([])
  const [total, setTotal] = useState(0)
  const [selectedProductMeta, setSelectedProductMeta] = useState({})
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
  const [minPositive, setMinPositive] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const navigate = useNavigate()

  const debouncedOrderQuery = useDebounce(orderQuery, 400)
  const debouncedPhoneQuery = useDebounce(phoneQuery, 400)
  const debouncedProductNameQuery = useDebounce(productNameQuery, 400)

  const fetchProducts = useCallback(async (search) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await authenticatedFetch(`/api/products/ids/?${params}`)
    if (!res.ok) return []
    const data = await res.json().catch(() => ({}))
    return (Array.isArray(data.products) ? data.products : []).map((p) => ({
      value: p.id,
      label: p.name || p.id,
    }))
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, ratingFilters, productFilters, dateFrom, dateTo, debouncedOrderQuery, debouncedPhoneQuery, debouncedProductNameQuery, minPositive, pageSize])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setMessage('')
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          page_size: String(pageSize),
          status: statusFilter,
        })
        if (ratingFilters.length) params.set('ratings', ratingFilters.join(','))
        if (productFilters.length) params.set('product_ids', productFilters.join(','))
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        if (debouncedOrderQuery) params.set('order_number', debouncedOrderQuery)
        if (debouncedPhoneQuery) params.set('phone', debouncedPhoneQuery)
        if (debouncedProductNameQuery) params.set('product_name', debouncedProductNameQuery)
        if (minPositive) params.set('min_positive', minPositive)

        const response = await authenticatedFetch(`/api/reviews/?${params}`)
        if (response.status === 401) { clearTokens(); navigate('/login'); return }
        const data = await response.json().catch(() => ({}))
        if (!cancelled) {
          if (!response.ok) {
            setMessage(data.detail ?? 'Не удалось загрузить список')
          } else {
            setReviews(Array.isArray(data.results) ? data.results : [])
            setTotal(data.total ?? 0)
          }
        }
      } catch {
        if (!cancelled) setMessage('Бэкенд недоступен')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentPage, pageSize, statusFilter, ratingFilters, productFilters, dateFrom, dateTo, debouncedOrderQuery, debouncedPhoneQuery, debouncedProductNameQuery, minPositive, navigate, refreshKey])

  const ratingFilterLabel =
    ratingFilters.length === 0
      ? 'Все'
      : [...ratingFilters].sort((a, b) => b - a).join(', ')
  const productFilterLabel =
    productFilters.length === 0
      ? 'Все'
      : productFilters.map((id) => selectedProductMeta[id] || id).join(', ')

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main className="page">
      <header className="topbar">
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Список отзывов</h1>
        </div>
        <button type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
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
            <CheckboxDropdown
              id="ratingFilter"
              label={`Выбрано: ${ratingFilterLabel}`}
              items={[5, 4, 3, 2, 1].map((v) => ({ value: v, label: String(v) }))}
              selected={ratingFilters}
              onToggle={(value, checked) =>
                setRatingFilters((prev) => checked ? [...prev, value] : prev.filter((v) => v !== value))
              }
            />
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
            <CheckboxDropdown
              id="productFilter"
              label={`Выбрано: ${productFilterLabel}`}
              items={[]}
              selected={productFilters}
              onToggle={(value, checked, label) => {
                setProductFilters((prev) => checked ? [...prev, value] : prev.filter((v) => v !== value))
                if (checked) setSelectedProductMeta((prev) => ({ ...prev, [value]: label }))
              }}
              searchable
              fetchItems={fetchProducts}
            />
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
          <div className="filterItem filterItemSearch">
            <label htmlFor="minPositive">Мин. полезных голосов</label>
            <input
              id="minPositive"
              type="number"
              min={1}
              placeholder="Например: 1"
              value={minPositive}
              onChange={(e) => setMinPositive(e.target.value)}
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
                setMinPositive('')
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
                <th>👍</th>
                <th>Дата</th>
                <th>Статус</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.order_number} className={!review.is_reviewed ? 'unreadRow' : ''}>
                  <td className={`mono ${!review.is_reviewed ? 'unreadText' : ''}`}>{review.order_number}</td>
                  <td>{review?.review_dict?.product?.name || 'Нет данных'}</td>
                  <td>{summaryValue(review, 'phone_number')}</td>
                  <td>
                    <span className={`ratingBadge ${getRatingMeta(summaryValue(review, 'rating')).className}`}>
                      {getRatingMeta(summaryValue(review, 'rating')).text}
                    </span>
                  </td>
                  <td className="mono">{review?.review_dict?.feedback?.positive ?? '—'}</td>
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
          {!reviews.length && !loading && <p className="sub">Отзывы по фильтрам не найдены</p>}
        </div>
        <div className="paginationBar">
          <div className="paginationInfo">
            Показано: {reviews.length} из {total}
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
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Детали отзыва</h1>
          <p className="sub mono">Заказ: {orderNumber}</p>
        </div>
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
  const [selectedProductMeta, setSelectedProductMeta] = useState({})
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [periodDays, setPeriodDays] = useState('all')
  const [groupBy, setGroupBy] = useState('day')
  const [productFilters, setProductFilters] = useState([])
  const [ratingFilters, setRatingFilters] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const navigate = useNavigate()
  const chartRef = useRef(null)

  const fetchProducts = useCallback(async (search) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await authenticatedFetch(`/api/products/ids/?${params}`)
    if (!res.ok) return []
    const data = await res.json().catch(() => ({}))
    return (Array.isArray(data.products) ? data.products : []).map((p) => ({
      value: p.id,
      label: p.name || p.id,
    }))
  }, [])

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

  useEffect(() => {
    if (chartData.length && chartRef.current) {
      chartRef.current.scrollLeft = chartRef.current.scrollWidth
    }
  }, [chartData])

  const productFilterLabel =
    productFilters.length === 0
      ? 'Все'
      : productFilters.map((id) => selectedProductMeta[id] || id).join(', ')

  const ratingFilterLabel =
    ratingFilters.length === 0 ? 'Все' : [...ratingFilters].sort((a, b) => b - a).join(', ')

  const ratingColors = { 1: '#F87171', 2: '#FB923C', 3: '#FBBF24', 4: '#60A5FA', 5: '#34D399' }
  const maxTotal = Math.max(1, ...chartData.map((item) => item.total))

  return (
    <main className="page">
      <header className="topbar">
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Аналитика</h1>
        </div>
        <button type="button" onClick={loadChart} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
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
            <CheckboxDropdown
              id="analyticsRatingFilter"
              label={`Выбрано: ${ratingFilterLabel}`}
              items={[5, 4, 3, 2, 1].map((v) => ({ value: v, label: String(v) }))}
              selected={ratingFilters}
              onToggle={(value, checked) =>
                setRatingFilters((prev) => checked ? [...prev, value] : prev.filter((v) => v !== value))
              }
            />
          </div>
          <div className="filterItem">
            <label htmlFor="analyticsProductFilter">Товары</label>
            <CheckboxDropdown
              id="analyticsProductFilter"
              label={`Выбрано: ${productFilterLabel}`}
              items={[]}
              selected={productFilters}
              onToggle={(value, checked, label) => {
                setProductFilters((prev) => checked ? [...prev, value] : prev.filter((v) => v !== value))
                if (checked) setSelectedProductMeta((prev) => ({ ...prev, [value]: label }))
              }}
              searchable
              fetchItems={fetchProducts}
            />
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
          <div className="analyticsChart" ref={chartRef}>
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
  const [periodDays, setPeriodDays] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ratingOp, setRatingOp] = useState('lt')
  const [ratingThreshold, setRatingThreshold] = useState('5')
  const [minReviews, setMinReviews] = useState(1)
  const [sortBy, setSortBy] = useState('count')
  const [sortDir, setSortDir] = useState('desc')
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
        <div className="titleWrap">
          <p className="eyebrow">Kaspi Reviews</p>
          <h1>Аналитика по товарам</h1>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
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
                  <tr key={item.id} className="clickableRow" onClick={() => navigate(`/product-analytics/${encodeURIComponent(item.id)}`)}>
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

function ProductDetailPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const [groupBy, setGroupBy] = useState('day')
  const [periodDays, setPeriodDays] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState([])
  const [reviewsTotal, setReviewsTotal] = useState(0)
  const [reviewsPage, setReviewsPage] = useState(1)
  const [reviewsPageSize] = useState(20)
  const [reviewsLoading, setReviewsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({ group_by: groupBy, period_days: periodDays })
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        const res = await authenticatedFetch(`/api/analytics/products/${encodeURIComponent(productId)}/detail/?${params}`)
        if (res.status === 401) { clearTokens(); navigate('/login'); return }
        const data = await res.json().catch(() => [])
        if (!cancelled) setChartData(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setError('Бэкенд недоступен')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [productId, groupBy, periodDays, dateFrom, dateTo, navigate])

  useEffect(() => {
    setReviewsPage(1)
  }, [productId, dateFrom, dateTo])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setReviewsLoading(true)
      try {
        const params = new URLSearchParams({
          product_ids: productId,
          page: String(reviewsPage),
          page_size: String(reviewsPageSize),
          status: 'all',
          sort_by: 'feedback_positive',
          sort_dir: 'desc',
        })
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        const res = await authenticatedFetch(`/api/reviews/?${params}`)
        if (res.status === 401) { clearTokens(); navigate('/login'); return }
        const data = await res.json().catch(() => ({}))
        if (!cancelled) {
          setReviews(Array.isArray(data.results) ? data.results : [])
          setReviewsTotal(data.total ?? 0)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setReviewsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [productId, dateFrom, dateTo, reviewsPage, reviewsPageSize, navigate])

  const n = chartData.length
  const totalReviews = chartData.reduce((s, d) => s + d.count, 0)
  const overallAvg = totalReviews > 0
    ? chartData.reduce((s, d) => s + d.avg * d.count, 0) / totalReviews
    : null
  const best = n > 0 ? chartData.reduce((b, d) => d.avg > b.avg ? d : b) : null
  const worst = n > 0 ? chartData.reduce((b, d) => d.avg < b.avg ? d : b) : null

  const seg = Math.max(1, Math.round(n * 0.3))
  const sliceAvg = (arr) => {
    const tot = arr.reduce((s, d) => s + d.count, 0)
    return tot > 0 ? arr.reduce((s, d) => s + d.avg * d.count, 0) / tot : null
  }
  const trend = n >= 4
    ? sliceAvg(chartData.slice(-seg)) - sliceAvg(chartData.slice(0, seg))
    : null
  const trendUp = trend !== null && trend > 0.01
  const trendDown = trend !== null && trend < -0.01

  const W = 920, H = 256
  const padL = 56, padR = 28, padT = 16, padB = 64
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const toX = (i) => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2)
  const toY = (v) => padT + innerH - ((Math.min(5, Math.max(1, v)) - 1) / 4) * innerH

  const areaPath = n === 0 ? '' : [
    `M ${toX(0)} ${padT + innerH}`,
    `L ${toX(0)} ${toY(chartData[0].avg)}`,
    ...chartData.slice(1).map((d, i) => `L ${toX(i + 1)} ${toY(d.avg)}`),
    `L ${toX(n - 1)} ${padT + innerH} Z`,
  ].join(' ')

  const linePath = n === 0 ? '' : [
    `M ${toX(0)} ${toY(chartData[0].avg)}`,
    ...chartData.slice(1).map((d, i) => `L ${toX(i + 1)} ${toY(d.avg)}`),
  ].join(' ')

  const dotColor = (avg) => {
    if (avg >= 4.5) return '#34D399'
    if (avg >= 3.5) return '#60A5FA'
    if (avg >= 2.5) return '#FBBF24'
    if (avg >= 1.5) return '#FB923C'
    return '#F87171'
  }

  const ratingClass = (avg) => {
    if (avg >= 4.5) return 'rating5'
    if (avg >= 3.5) return 'rating4'
    if (avg >= 2.5) return 'rating3'
    if (avg >= 1.5) return 'rating2'
    return 'rating1'
  }

  const fmtAvg = (v) => v != null ? Number(v).toFixed(2) : '—'
  const labelStep = n > 28 ? Math.ceil(n / 14) : n > 14 ? 2 : 1
  const maxCount = Math.max(1, ...chartData.map((d) => d.count))

  const kpis = [
    {
      label: 'Всего отзывов',
      value: totalReviews.toLocaleString('ru-RU'),
      sub: `${n} ${n === 1 ? 'период' : n < 5 ? 'периода' : 'периодов'}`,
      color: null,
      icon: (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3v5l3 3-1.4 1.4L8 11.4V5h2z" fill="currentColor" opacity=".5"/>
        </svg>
      ),
    },
    {
      label: 'Средний рейтинг',
      value: `★ ${fmtAvg(overallAvg)}`,
      sub: 'взвешенное среднее',
      color: overallAvg != null ? dotColor(overallAvg) : null,
      icon: (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L10 14.3l-4.8 2.5.9-5.3L2.2 7.7l5.4-.8L10 2z" fill="currentColor" opacity=".5"/>
        </svg>
      ),
    },
    {
      label: 'Тренд периода',
      value: trend === null
        ? '—'
        : `${trendUp ? '↑ +' : trendDown ? '↓ −' : '→ '}${Math.abs(trend).toFixed(2)}`,
      sub: 'первые vs последние 30%',
      color: trendUp ? '#34D399' : trendDown ? '#F87171' : 'var(--t-2)',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M2 14l5-5 4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".5"/>
        </svg>
      ),
    },
    {
      label: 'Лучший период',
      value: `★ ${fmtAvg(best?.avg)}`,
      sub: best?.label ?? '—',
      color: '#34D399',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M10 3l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L4.2 7.2l4-.6L10 3z" fill="#34D399" opacity=".6"/>
        </svg>
      ),
    },
    {
      label: 'Худший период',
      value: `★ ${fmtAvg(worst?.avg)}`,
      sub: worst?.label ?? '—',
      color: '#F87171',
      icon: (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M10 17l-1.8-3.6-4-.6 2.9-2.8-.7-4 3.6 1.9 3.6-1.9-.7 4 2.9 2.8-4 .6L10 17z" fill="#F87171" opacity=".6"/>
        </svg>
      ),
    },
  ]

  return (
    <main className="page">
      {/* ── Header ── */}
      <header className="topbar pbiTopbar">
        <div className="titleWrap">
          <button type="button" className="pbiBackBtn" onClick={() => navigate('/product-analytics')}>
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Аналитика по товарам
          </button>
          <h1 className="pbiPageTitle">Детальная аналитика</h1>
          <p className="sub mono pbiProductId">{decodeURIComponent(productId)}</p>
        </div>
        <div className="pbiHeaderBadge">
          <span className="pbiHeaderBadgeLabel">Product Analytics</span>
        </div>
      </header>

      {/* ── Control bar ── */}
      <div className="pbiControlBar">
        <div className="filterGroup">
          <span className="filterLabel">Период</span>
          <Select
            value={periodDays}
            onChange={(e) => setPeriodDays(e.target.value)}
            options={[
              { value: '30', label: '30 дней' },
              { value: '90', label: '90 дней' },
              { value: '180', label: '180 дней' },
              { value: '365', label: '1 год' },
              { value: 'all', label: 'Всё время' },
            ]}
          />
        </div>
        <div className="filterGroup">
          <span className="filterLabel">Группировка</span>
          <div className="segmentedControl">
            {[['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map(([g, lbl]) => (
              <button key={g} type="button" className={`segmentBtn${groupBy === g ? ' active' : ''}`} onClick={() => setGroupBy(g)}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="filterGroup">
          <span className="filterLabel">Дата с</span>
          <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="от" />
        </div>
        <div className="filterGroup">
          <span className="filterLabel">Дата по</span>
          <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="до" />
        </div>
        {(dateFrom || dateTo) && (
          <button type="button" className="pbiResetBtn" onClick={() => { setDateFrom(''); setDateTo('') }}>
            Сбросить даты
          </button>
        )}
      </div>

      {error && <p className="banner">{error}</p>}

      {/* ── Loading ── */}
      {loading && (
        <div className="pbiStateBox">
          <div className="pbiSpinner" />
          <span className="sub">Загрузка данных...</span>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && n === 0 && (
        <div className="pbiStateBox">
          <svg viewBox="0 0 64 48" width="56" height="42" fill="none" aria-hidden="true">
            <rect x="4" y="32" width="12" height="12" rx="2" fill="var(--t-3)"/>
            <rect x="26" y="20" width="12" height="24" rx="2" fill="var(--t-3)"/>
            <rect x="48" y="8" width="12" height="36" rx="2" fill="var(--t-3)"/>
          </svg>
          <p className="sub">Нет данных за выбранный период</p>
        </div>
      )}

      {/* ── Main content ── */}
      {!loading && n > 0 && (
        <>
          {/* KPI cards */}
          <div className="pbiKpiRow">
            {kpis.map(({ label, value, sub, color, icon }) => (
              <div key={label} className="pbiKpiCard">
                <div className="pbiKpiTop">
                  <span className="pbiKpiLabel">{label}</span>
                  <span className="pbiKpiIcon">{icon}</span>
                </div>
                <span className="pbiKpiValue" style={color ? { color } : undefined}>{value}</span>
                <span className="pbiKpiSub">{sub}</span>
              </div>
            ))}
          </div>

          {/* Main area/line chart */}
          <section className="panel pbiChartPanel">
            <div className="pbiChartHead">
              <div>
                <h2 className="pbiChartTitle">Динамика среднего рейтинга</h2>
                <p className="pbiChartSub">
                  Среднее значение оценок по {groupBy === 'day' ? 'дням' : groupBy === 'week' ? 'неделям' : 'месяцам'} · {n} точек данных
                </p>
              </div>
              <div className="pbiLegend">
                {[['#34D399', '≥4.5'], ['#60A5FA', '3.5–4.5'], ['#FBBF24', '2.5–3.5'], ['#FB923C', '1.5–2.5'], ['#F87171', '<1.5']].map(([color, lbl]) => (
                  <span key={lbl} className="pbiLegendItem">
                    <span className="pbiLegendDot" style={{ background: color }}/>
                    {lbl}
                  </span>
                ))}
              </div>
            </div>

            <div className="pbiSvgContainer">
              <svg viewBox={`0 0 ${W} ${H}`} className="pbiSvg" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="pbiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28"/>
                    <stop offset="70%" stopColor="#60A5FA" stopOpacity="0.06"/>
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity="0"/>
                  </linearGradient>
                  <clipPath id="pbiClip">
                    <rect x={padL} y={padT} width={innerW} height={innerH}/>
                  </clipPath>
                </defs>

                {/* Rating zone background bands */}
                {[[4, 5, 'rgba(52,211,153,0.045)'], [3, 4, 'rgba(96,165,250,0.035)'], [2, 3, 'rgba(251,191,36,0.035)'], [1, 2, 'rgba(248,113,113,0.05)']].map(([y1, y2, fill]) => (
                  <rect key={y1} x={padL} y={toY(y2)} width={innerW} height={toY(y1) - toY(y2)} fill={fill}/>
                ))}

                {/* Horizontal grid lines */}
                {[1, 2, 3, 4, 5].map((tick) => (
                  <g key={tick}>
                    <line x1={padL} y1={toY(tick)} x2={W - padR} y2={toY(tick)} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                    <text x={padL - 7} y={toY(tick)} textAnchor="end" dominantBaseline="middle" className="pbiAxisLabel">{tick}★</text>
                  </g>
                ))}

                {/* Reference line at 4.0 */}
                <line x1={padL} y1={toY(4)} x2={W - padR} y2={toY(4)} stroke="rgba(52,211,153,0.4)" strokeWidth="1" strokeDasharray="5,3"/>
                <text x={W - padR + 4} y={toY(4)} dominantBaseline="middle" className="pbiRefLabel">4.0</text>

                {/* Area fill */}
                <path d={areaPath} fill="url(#pbiAreaGrad)" clipPath="url(#pbiClip)"/>

                {/* Line */}
                <path d={linePath} fill="none" stroke="#60A5FA" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#pbiClip)"/>

                {/* Dots + x-axis labels */}
                {chartData.map((d, i) => (
                  <g key={d.key}>
                    <circle cx={toX(i)} cy={toY(d.avg)} r="4.5" fill={dotColor(d.avg)} stroke="var(--bg-1)" strokeWidth="2.5">
                      <title>{d.label}: ★ {Number(d.avg).toFixed(2)} · {d.count} отзывов</title>
                    </circle>
                    {i % labelStep === 0 && (
                      <text
                        x={toX(i)} y={padT + innerH + 10}
                        textAnchor="end" dominantBaseline="auto"
                        className="pbiAxisLabel"
                        transform={`rotate(-42, ${toX(i)}, ${padT + innerH + 10})`}
                      >
                        {d.label}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>

            {/* Chart footer stats */}
            <div className="pbiChartFooter">
              <div className="pbiChartStat">
                <span className="pbiChartStatLabel">Мин</span>
                <span className="pbiChartStatVal" style={{ color: '#F87171' }}>★ {fmtAvg(worst?.avg)}</span>
              </div>
              <div className="pbiChartStatDivider"/>
              <div className="pbiChartStat">
                <span className="pbiChartStatLabel">Среднее</span>
                <span className="pbiChartStatVal" style={{ color: overallAvg != null ? dotColor(overallAvg) : 'var(--t-2)' }}>★ {fmtAvg(overallAvg)}</span>
              </div>
              <div className="pbiChartStatDivider"/>
              <div className="pbiChartStat">
                <span className="pbiChartStatLabel">Макс</span>
                <span className="pbiChartStatVal" style={{ color: '#34D399' }}>★ {fmtAvg(best?.avg)}</span>
              </div>
              <div className="pbiChartStatDivider"/>
              <div className="pbiChartStat">
                <span className="pbiChartStatLabel">Всего отзывов</span>
                <span className="pbiChartStatVal">{totalReviews.toLocaleString('ru-RU')}</span>
              </div>
            </div>
          </section>

          {/* Bottom split row */}
          <div className="pbiSplitRow">

            {/* Count bar chart */}
            <section className="panel pbiChartPanel">
              <div className="pbiChartHead">
                <div>
                  <h2 className="pbiChartTitle">Объём отзывов</h2>
                  <p className="pbiChartSub">Количество по периодам</p>
                </div>
              </div>
              <div className="pbiCountBars">
                {chartData.map((d, i) => (
                  <div key={d.key} className="pbiCountBarRow" title={`${d.label}: ${d.count} отзывов · ★ ${Number(d.avg).toFixed(2)}`}>
                    <span className="pbiCountBarLabel">{i % labelStep === 0 ? d.label : ''}</span>
                    <div className="pbiCountBarTrack">
                      <div className="pbiCountBarFill" style={{ width: `${(d.count / maxCount) * 100}%`, background: dotColor(d.avg) }}/>
                    </div>
                    <span className="pbiCountBarVal">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Data table */}
            <section className="panel pbiChartPanel">
              <div className="pbiChartHead">
                <div>
                  <h2 className="pbiChartTitle">Сводная таблица</h2>
                  <p className="pbiChartSub">{n} {n === 1 ? 'запись' : n < 5 ? 'записи' : 'записей'}</p>
                </div>
              </div>
              <div className="tableWrap pbiScrollTable">
                <table>
                  <thead>
                    <tr>
                      <th>Период</th>
                      <th>Отзывов</th>
                      <th>Рейтинг</th>
                      <th>Шкала</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d) => (
                      <tr key={d.key}>
                        <td className="mono">{d.label}</td>
                        <td className="mono">{d.count}</td>
                        <td>
                          <span className={`ratingBadge ${ratingClass(d.avg)}`}>
                            ★ {Number(d.avg).toFixed(2)}
                          </span>
                        </td>
                        <td>
                          <div className="pbiInlineBar">
                            <div className="pbiInlineBarFill" style={{ width: `${((d.avg - 1) / 4) * 100}%`, background: dotColor(d.avg) }}/>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>

          {/* Reviews list */}
          <section className="panel pbiChartPanel">
            <div className="pbiChartHead">
              <div>
                <h2 className="pbiChartTitle">Самые популярные отзывы</h2>
                <p className="pbiChartSub">
                  {reviewsLoading ? 'Загрузка...' : `${reviewsTotal.toLocaleString('ru-RU')} отзывов`}
                </p>
              </div>
            </div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Номер заказа</th>
                    <th>Телефон</th>
                    <th>Оценка</th>
                    <th>👍</th>
                    <th>Комментарий</th>
                    <th>Дата</th>
                    <th>Статус</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => {
                    const comment = review?.review_dict?.comment || {}
                    return (
                      <tr key={review.order_number} className={!review.is_reviewed ? 'unreadRow' : ''}>
                        <td className={`mono ${!review.is_reviewed ? 'unreadText' : ''}`}>{review.order_number}</td>
                        <td>{summaryValue(review, 'phone_number')}</td>
                        <td>
                          <span className={`ratingBadge ${getRatingMeta(summaryValue(review, 'rating')).className}`}>
                            {getRatingMeta(summaryValue(review, 'rating')).text}
                          </span>
                        </td>
                        <td className="mono">{review?.review_dict?.feedback?.positive ?? '—'}</td>
                        <td className="reviewCommentCell">
                          {comment.plus  && <p className="reviewCommentPlus">+ {comment.plus}</p>}
                          {comment.minus && <p className="reviewCommentMinus">− {comment.minus}</p>}
                          {comment.text  && <p className="reviewCommentText">{comment.text}</p>}
                          {!comment.plus && !comment.minus && !comment.text && <span className="sub">—</span>}
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
                    )
                  })}
                </tbody>
              </table>
              {!reviewsLoading && !reviews.length && <p className="sub">Отзывы не найдены</p>}
            </div>
            {reviewsTotal > reviewsPageSize && (
              <div className="paginationBar">
                <div className="paginationInfo">
                  Показано: {reviews.length} из {reviewsTotal}
                </div>
                <div className="paginationControls">
                  <button type="button" onClick={() => setReviewsPage((p) => Math.max(1, p - 1))} disabled={reviewsPage === 1}>‹</button>
                  <span className="paginationInfo">Стр. {reviewsPage} / {Math.ceil(reviewsTotal / reviewsPageSize)}</span>
                  <button type="button" onClick={() => setReviewsPage((p) => p + 1)} disabled={reviewsPage >= Math.ceil(reviewsTotal / reviewsPageSize)}>›</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}

const NAV_ITEMS = [
  { path: '/', label: 'Отзывы' },
  { path: '/analytics', label: 'График' },
  { path: '/product-analytics', label: 'По товарам' },
]

function Sidebar() {
  const { pathname } = useLocation()
  const isActive = (path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/')

  return (
    <aside className="sidebar">
      <div className="sidebarBrand">
        <span className="sidebarLogo">K</span>
        <div>
          <p className="sidebarBrandName">Kaspi</p>
          <p className="sidebarBrandSub">Reviews</p>
        </div>
      </div>
      <nav className="sidebarNav">
        {NAV_ITEMS.map(({ path, label }) => (
          <Link key={path} to={path} className={`sidebarNavItem${isActive(path) ? ' active' : ''}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebarFooter">
        <LogoutButton />
      </div>
    </aside>
  )
}

function RequireAuth({ children }) {
  if (!getAccessToken()) return <Navigate to="/login" replace />
  return (
    <div className="appShell">
      <Sidebar />
      <div className="mainContent">{children}</div>
    </div>
  )
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
        path="/product-analytics/:productId"
        element={
          <RequireAuth>
            <ProductDetailPage />
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
