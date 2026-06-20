import { TripProvider } from "../../trip/TripContext";
import { Layout } from "./Layout";

export function TripLayout() {
  return (
    <TripProvider>
      <Layout />
    </TripProvider>
  );
}
