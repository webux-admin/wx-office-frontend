import { Fragment, lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './layout/AppShell'
import { LoadingBlock } from './components/Notice'
import { UnauthorizedError } from './lib/api'
import { firstBasicDataPath } from './lib/basicData'
import { STOCK_AS_OF_PATH } from './lib/inventory'
import { SECURITY_PATH } from './lib/loginPolicy'
import { MODULE_PATH } from './lib/modules'
import { MAIL_TEMPLATE_PATH, OUTBOX_ACCOUNT_PATH, OUTBOX_PATH } from './lib/outbox'
import { SALES_DOCUMENT_KINDS } from './lib/salesDocument'
import { LoginPage } from './pages/LoginPage'

/**
 * Every screen is its own chunk.
 *
 * <p>Loaded when it is opened, not when the application starts. In development that is the
 * difference between the browser fetching every screen up front and fetching the one someone
 * asked for; in production it splits one large bundle into pieces nobody downloads in vain.
 *
 * <p>The login screen is the exception: it is the first thing an unauthenticated visitor
 * sees, and a chunk for it would only add a round trip before the password field appears.
 */
const CataloguePage = lazy(() => import('./pages/CataloguePage').then((module) => ({ default: module.CataloguePage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const DocumentTypeListPage = lazy(() => import('./pages/DocumentTypeListPage').then((module) => ({ default: module.DocumentTypeListPage })))
const DocumentTypePage = lazy(() => import('./pages/DocumentTypePage').then((module) => ({ default: module.DocumentTypePage })))
const PrintLayoutListPage = lazy(() => import('./pages/PrintLayoutListPage').then((module) => ({ default: module.PrintLayoutListPage })))
const PrintLayoutPage = lazy(() => import('./pages/PrintLayoutPage').then((module) => ({ default: module.PrintLayoutPage })))
const MasterDataPage = lazy(() => import('./pages/MasterDataPage').then((module) => ({ default: module.MasterDataPage })))
const NumberRangePage = lazy(() => import('./pages/NumberRangePage').then((module) => ({ default: module.NumberRangePage })))
const SalesDocumentListPage = lazy(() => import('./pages/SalesDocumentListPage').then((module) => ({ default: module.SalesDocumentListPage })))
const SalesDocumentPage = lazy(() => import('./pages/SalesDocumentPage').then((module) => ({ default: module.SalesDocumentPage })))
const PartnerListPage = lazy(() => import('./pages/PartnerListPage').then((module) => ({ default: module.PartnerListPage })))
const PartnerPage = lazy(() => import('./pages/PartnerPage').then((module) => ({ default: module.PartnerPage })))
const PaymentTermPage = lazy(() => import('./pages/PaymentTermPage').then((module) => ({ default: module.PaymentTermPage })))
const PrinterListPage = lazy(() => import('./pages/PrinterListPage').then((module) => ({ default: module.PrinterListPage })))
const PriceGroupPage = lazy(() => import('./pages/PriceGroupPage').then((module) => ({ default: module.PriceGroupPage })))
const PriceEntryPage = lazy(() => import('./pages/PriceEntryPage').then((module) => ({ default: module.PriceEntryPage })))
const ProductListPage = lazy(() => import('./pages/ProductListPage').then((module) => ({ default: module.ProductListPage })))
const ProductPage = lazy(() => import('./pages/ProductPage').then((module) => ({ default: module.ProductPage })))
const ProductFreeFieldPage = lazy(() => import('./pages/ProductFreeFieldPage').then((module) => ({ default: module.ProductFreeFieldPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const DunningSettingsPage = lazy(() => import('./pages/DunningSettingsPage').then((module) => ({ default: module.DunningSettingsPage })))
const DunningLevelPage = lazy(() => import('./pages/DunningLevelPage').then((module) => ({ default: module.DunningLevelPage })))
const DunningBlockPage = lazy(() => import('./pages/DunningBlockPage').then((module) => ({ default: module.DunningBlockPage })))
const DunningNoticePage = lazy(() => import('./pages/DunningNoticePage').then((module) => ({ default: module.DunningNoticePage })))
const DunningTextPage = lazy(() => import('./pages/DunningTextPage').then((module) => ({ default: module.DunningTextPage })))
const DunningWorklistPage = lazy(() => import('./pages/DunningWorklistPage').then((module) => ({ default: module.DunningWorklistPage })))
const RolePage = lazy(() => import('./pages/RolePage').then((module) => ({ default: module.RolePage })))
const StockListPage = lazy(() => import('./pages/StockListPage').then((module) => ({ default: module.StockListPage })))
const StockShortageListPage = lazy(() => import('./pages/StockShortageListPage').then((module) => ({ default: module.StockShortageListPage })))
const StockReservationListPage = lazy(() => import('./pages/StockReservationListPage').then((module) => ({ default: module.StockReservationListPage })))
const StocktakeListPage = lazy(() => import('./pages/StocktakeListPage').then((module) => ({ default: module.StocktakeListPage })))
const StocktakePage = lazy(() => import('./pages/StocktakePage').then((module) => ({ default: module.StocktakePage })))
const StockMovementListPage = lazy(() => import('./pages/StockMovementListPage').then((module) => ({ default: module.StockMovementListPage })))
const StockLocationListPage = lazy(() => import('./pages/StockLocationListPage').then((module) => ({ default: module.StockLocationListPage })))
const ModulePage = lazy(() => import('./pages/ModulePage').then((module) => ({ default: module.ModulePage })))
const OutboxAccountPage = lazy(() => import('./pages/OutboxAccountPage').then((module) => ({ default: module.OutboxAccountPage })))
const OutboxListPage = lazy(() => import('./pages/OutboxListPage').then((module) => ({ default: module.OutboxListPage })))
const OutboxTemplatePage = lazy(() => import('./pages/OutboxTemplatePage').then((module) => ({ default: module.OutboxTemplatePage })))
const StockAsOfPage = lazy(() => import('./pages/StockAsOfPage').then((module) => ({ default: module.StockAsOfPage })))
const TenantListPage = lazy(() => import('./pages/TenantListPage').then((module) => ({ default: module.TenantListPage })))
const SecurityPolicyPage = lazy(() => import('./pages/SecurityPolicyPage').then((module) => ({ default: module.SecurityPolicyPage })))
const TenantPage = lazy(() => import('./pages/TenantPage').then((module) => ({ default: module.TenantPage })))
const UserListPage = lazy(() => import('./pages/UserListPage').then((module) => ({ default: module.UserListPage })))
const UserPage = lazy(() => import('./pages/UserPage').then((module) => ({ default: module.UserPage })))
const VatPage = lazy(() => import('./pages/VatPage').then((module) => ({ default: module.VatPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A lost session is not a network hiccup: retrying it only delays the login screen.
      retry: (failureCount, error) => !(error instanceof UnauthorizedError) && failureCount < 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Routes and the providers they all need.
 *
 * <p>Paths are German, because they are read by the people using the application. Only routes
 * a controller answers exist. A path leading to an empty screen would promise a module that
 * is not there.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingBlock label="Maske wird geladen" />}>
            <Routes>
              <Route path="/anmelden" element={<LoginPage />} />

              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<DashboardPage />} />

                <Route path="/kunden" element={<PartnerListPage role="customer" />} />
                <Route path="/kunden/:id" element={<PartnerPage role="customer" />} />

                <Route path="/lieferanten" element={<PartnerListPage role="supplier" />} />
                <Route path="/lieferanten/:id" element={<PartnerPage role="supplier" />} />

                <Route path="/produkte" element={<ProductListPage />} />
                <Route path="/produkte/:id" element={<ProductPage />} />

                <Route path="/preisgruppen" element={<PriceGroupPage />} />
                <Route path="/preise-erfassen" element={<PriceEntryPage />} />

                <Route path="/bestand" element={<StockListPage />} />
                <Route path="/unterdeckung" element={<StockShortageListPage />} />
                <Route path="/reservierungen" element={<StockReservationListPage />} />
                <Route path="/lagerbewegungen" element={<StockMovementListPage />} />
                <Route path="/lagerorte" element={<StockLocationListPage />} />
                <Route path="/inventuren" element={<StocktakeListPage />} />
                <Route path="/inventuren/:id" element={<StocktakePage />} />
                {/* The neighbours above write their path out, this one takes it from
                    lib/inventory: the address is already a constant there, and menu and route
                    read the same one so neither can move without the other. */}
                <Route path={STOCK_AS_OF_PATH} element={<StockAsOfPage />} />

                <Route path="/produkt-freifelder" element={<ProductFreeFieldPage />} />

                {/* Offerte, Auftrag, Lieferschein and Rechnung share one list and one mask,
                    so their routes come out of the same table the menu is built from. Written
                    out eight times, a fifth kind would be four chances to forget a line. */}
                {SALES_DOCUMENT_KINDS.map((kind) => (
                  <Fragment key={kind.category}>
                    <Route path={kind.path} element={<SalesDocumentListPage kind={kind} />} />
                    <Route path={`${kind.path}/:id`} element={<SalesDocumentPage kind={kind} />} />
                  </Fragment>
                ))}

                {/* Every maintained list is a screen of its own, so it can be linked and
                    bookmarked. The old collective address stays and points at the first one. */}
                <Route path="/basisdaten/:liste" element={<MasterDataPage />} />
                <Route
                  path="/auswahllisten"
                  element={<Navigate to={firstBasicDataPath()} replace />}
                />

                <Route path="/feste-werte" element={<CataloguePage />} />
                <Route path="/zahlungskonditionen" element={<PaymentTermPage />} />
                <Route path="/mehrwertsteuer" element={<VatPage />} />
                <Route path="/belegarten" element={<DocumentTypeListPage />} />
                <Route path="/belegarten/:id" element={<DocumentTypePage />} />
                <Route path="/druckvorlagen" element={<PrintLayoutListPage />} />
                <Route path="/druckvorlagen/:id" element={<PrintLayoutPage />} />
                <Route path="/drucker" element={<PrinterListPage />} />
                <Route path="/nummernkreise" element={<NumberRangePage />} />
                {/* Like the module screen, these take their address from the building block
                    the menu reads, so neither can move without the other. */}
                <Route path={OUTBOX_ACCOUNT_PATH} element={<OutboxAccountPage />} />
                <Route path={OUTBOX_PATH} element={<OutboxListPage />} />
                <Route path={MAIL_TEMPLATE_PATH} element={<OutboxTemplatePage />} />

                <Route path="/mandanten" element={<TenantListPage />} />
                <Route path={MODULE_PATH} element={<ModulePage />} />
                <Route path="/mandanten/:id" element={<TenantPage />} />

                <Route path="/benutzer" element={<UserListPage />} />
                <Route path="/benutzer/:id" element={<UserPage />} />

                <Route path={SECURITY_PATH} element={<SecurityPolicyPage />} />

                <Route path="/rollen" element={<RolePage />} />
                <Route path="/mahnwesen-einstellungen" element={<DunningSettingsPage />} />
                <Route path="/mahnstufen" element={<DunningLevelPage />} />
                <Route path="/mahntexte" element={<DunningTextPage />} />
                <Route path="/mahnvorschlag" element={<DunningWorklistPage />} />
                <Route path="/mahnungen" element={<DunningNoticePage />} />
                <Route path="/mahnstopps" element={<DunningBlockPage />} />
                <Route path="/profil" element={<ProfilePage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
