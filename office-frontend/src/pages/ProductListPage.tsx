import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatCount } from '../lib/format'
import { shortLabelForCode } from '../lib/masterData'
import { optionalOriginOf, originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, Product } from '../lib/types'
import { useCatalogueLabel, useMasterDataEntries } from '../masterdata/useMasterData'

/** What a product mask returns to when it is saved here. */
const ORIGIN = originState('/produkte', 'Produkte')

/** The catalogue of goods and services the tenant sells. */
export function ProductListPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <ProductList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ProductList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const typeLabel = useCatalogueLabel(tenantId, 'product-type')
  const vatLabel = useCatalogueLabel(tenantId, 'vat-category')
  const units = useMasterDataEntries(tenantId, 'units')
  // The term a link brought along, for example from the quick search of a position dialog.
  // Read once: the field takes over from here, and rewriting the address on every keystroke
  // would fill the history with half typed words.
  const [params] = useSearchParams()
  const search = useQuickSearch(params.get('suche') ?? '')
  // A list is normally reached through the navigation and shows no way back. It gets one
  // where another screen sent the user here, so the document is one click away again.
  const back = optionalOriginOf(useLocation().state)
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('name,asc')

  const query = listQuery({ search: search.term, activeOnly, page, size: PAGE_SIZE, sort })
  const products = useQuery({
    queryKey: ['products', tenantId, query],
    queryFn: () => api.get<Page<Product>>(`/api/tenants/${tenantId}/products?${query}`),
    // The rows found last stay on screen while the next answer is on its way. Without it the
    // table is replaced by its loading state on every term, which flickers while it is read.
    placeholderData: keepPreviousData,
  })

  // Search and the active flag are combined by the server; nothing is filtered again here.
  const result = products.data ?? emptyPage<Product>()
  const rows = result.content

  const columns: Column<Product>[] = [
    {
      key: 'number',
      header: 'Nummer',
      sortKey: 'productNumber',
      width: 'w-[110px]',
      render: (product) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {product.productNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      sortKey: 'name',
      render: (product) => (
        <Link
          to={`/produkte/${product.id}`}
          state={ORIGIN}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {product.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Art',
      width: 'w-[130px]',
      render: (product) => (
        <span className="text-text-secondary">{typeLabel(product.productType)}</span>
      ),
    },
    {
      key: 'unit',
      header: 'Einheit',
      width: 'w-[100px]',
      render: (product) => (
        <span className="text-text-secondary">{shortLabelForCode(units, product.unit)}</span>
      ),
    },
    {
      key: 'vat',
      header: 'MwSt',
      width: 'w-[180px]',
      render: (product) => (
        <span className="text-text-secondary">{vatLabel(product.vatCategory)}</span>
      ),
    },
    {
      key: 'price',
      header: 'Grundpreis',
      align: 'right',
      sortKey: 'basePrice',
      width: 'w-[130px]',
      render: (product) => formatAmount(product.basePrice),
    },
    {
      key: 'state',
      header: '',
      width: 'w-[110px]',
      render: (product) =>
        product.active === false ? <Badge tone="muted">Deaktiviert</Badge> : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Produkte"
        subtitle={`${formatCount(result.totalElements)} Artikel`}
        back={back && { to: back.from, label: back.label }}
      >
        {can('PRODUCT_WRITE') && (
          <LinkButton to="/produkte/neu" state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Produkt erfassen
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Bezeichnung oder Artikelnummer"
              maxLength={140}
            />
            <CheckboxField
              label="Nur aktive"
              checked={activeOnly}
              onChange={(event) => {
                setActiveOnly(event.target.checked)
                setPage(0)
              }}
              className="h-10 items-center"
            />
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(product) => product.id}
            rowTo={(product) => `/produkte/${product.id}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={products.isPending}
            error={products.error}
            empty={
              <EmptyState
                title={search.term ? 'Nichts gefunden' : 'Noch keine Produkte'}
                description={
                  search.term
                    ? `Für «${search.term}» gibt es keinen Treffer.`
                    : 'Ohne Katalog lässt sich keine Belegzeile aus einem Produkt bilden.'
                }
              >
                {!search.term && can('PRODUCT_WRITE') && (
                  <LinkButton to="/produkte/neu" state={ORIGIN}>
                    <Plus size={15} aria-hidden />
                    Erstes Produkt erfassen
                  </LinkButton>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>
    </>
  )
}
