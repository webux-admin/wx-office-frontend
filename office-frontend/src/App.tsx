import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './layout/AppShell'
import { UnauthorizedError } from './lib/api'
import { firstBasicDataPath } from './lib/basicData'
import { CataloguePage } from './pages/CataloguePage'
import { DashboardPage } from './pages/DashboardPage'
import { DocumentTypePage } from './pages/DocumentTypePage'
import { PrintLayoutListPage } from './pages/PrintLayoutListPage'
import { PrintLayoutPage } from './pages/PrintLayoutPage'
import { LoginPage } from './pages/LoginPage'
import { MasterDataPage } from './pages/MasterDataPage'
import { NumberRangePage } from './pages/NumberRangePage'
import { OrderListPage } from './pages/OrderListPage'
import { OrderPage } from './pages/OrderPage'
import { PartnerListPage } from './pages/PartnerListPage'
import { PartnerPage } from './pages/PartnerPage'
import { PaymentTermPage } from './pages/PaymentTermPage'
import { PriceGroupPage } from './pages/PriceGroupPage'
import { ProductListPage } from './pages/ProductListPage'
import { ProductPage } from './pages/ProductPage'
import { ProfilePage } from './pages/ProfilePage'
import { RolePage } from './pages/RolePage'
import { TenantListPage } from './pages/TenantListPage'
import { TenantPage } from './pages/TenantPage'
import { UserListPage } from './pages/UserListPage'
import { UserPage } from './pages/UserPage'
import { VatPage } from './pages/VatPage'

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

              <Route path="/auftraege" element={<OrderListPage />} />
              <Route path="/auftraege/:id" element={<OrderPage />} />

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
              <Route path="/belegarten" element={<DocumentTypePage />} />
              <Route path="/druckvorlagen" element={<PrintLayoutListPage />} />
              <Route path="/druckvorlagen/:id" element={<PrintLayoutPage />} />
              <Route path="/nummernkreise" element={<NumberRangePage />} />

              <Route path="/mandanten" element={<TenantListPage />} />
              <Route path="/mandanten/:id" element={<TenantPage />} />

              <Route path="/benutzer" element={<UserListPage />} />
              <Route path="/benutzer/:id" element={<UserPage />} />

              <Route path="/rollen" element={<RolePage />} />
              <Route path="/profil" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
