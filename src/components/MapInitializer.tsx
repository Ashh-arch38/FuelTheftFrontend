// src/components/MapInitializer.tsx
import { useEffect } from "react";
import { useMap } from "react-leaflet";

interface Props {
  latitude: number;
  longitude: number;
}

const MapInitializer: React.FC<Props> = ({ latitude, longitude }) => {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    map.setView([latitude, longitude], 13);
  }, [latitude, longitude, map]);

  return null;
};

export default MapInitializer;
