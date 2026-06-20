import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";
import { TripLayout } from "./components/Layout/TripLayout";
import { AccommodationPage } from "./pages/AccommodationPage";
import { FlightPage } from "./pages/FlightPage";
import { ItineraryPage } from "./pages/ItineraryPage";
import { LoginPage } from "./pages/LoginPage";
import { TicketPage } from "./pages/TicketPage";
import { TripsOverviewPage } from "./pages/TripsOverviewPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route index element={<TripsOverviewPage />} />
          </Route>
          <Route path="/:tripSlug" element={<TripLayout />}>
            <Route index element={<ItineraryPage />} />
            <Route path="flight" element={<FlightPage />} />
            <Route path="accommodation" element={<AccommodationPage />} />
            <Route
              path="ticket"
              element={
                <ProtectedRoute>
                  <TicketPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="." replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
