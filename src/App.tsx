import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccommodationPage } from "./pages/AccommodationPage";
import { FlightPage } from "./pages/FlightPage";
import { ItineraryPage } from "./pages/ItineraryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ItineraryPage />} />
          <Route path="flight" element={<FlightPage />} />
          <Route path="accommodation" element={<AccommodationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
